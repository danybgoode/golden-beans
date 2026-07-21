-- event-destination-router · Sprint 1, Story 1.1 — versioned actor/subject context on `events`.
--
-- EXPAND-only (Roadmap/LEARNINGS.md, the rollout-ordering rule): every column here is nullable and
-- every index is additive, so this migration is safe to apply BEFORE the code that reads it and
-- safe to leave in place if that code is reverted. Nothing existing changes shape — a v1 payload
-- (`{userId, event}`) still writes exactly the row it wrote yesterday, with these columns NULL.
--
-- LOCK NOTE (cross-review, Codex round 3): the validated CHECK constraints and the composite UNIQUE
-- below take a brief ACCESS EXCLUSIVE lock and scan existing rows, which blocks ingest for the
-- duration of the scan. This is left as a plain synchronous migration DELIBERATELY, not staged:
-- the events table is small at the current dogfooding scale, so the scan is sub-second, and the
-- migration is applied as a SEPARATE step BEFORE the code merge (AGENTS.md rollout order) — during
-- that window ingest runs the OLD code, which needs none of these. The scale-safe pattern for when
-- the table is large — `ADD CONSTRAINT ... NOT VALID` then a `VALIDATE CONSTRAINT` in a LATER
-- migration (own transaction, weaker SHARE UPDATE EXCLUSIVE lock), and `CREATE UNIQUE INDEX
-- CONCURRENTLY` + `ADD CONSTRAINT ... USING INDEX` outside any transaction — is the documented
-- upgrade, adopted when row count warrants it rather than pre-emptively.
--
-- WHY a versioned context instead of more top-level columns: `userId` was doing three jobs at once
-- (who acted, what the event is about, and the identity a funnel counts). One stream has to be able
-- to describe a merchant, shop, promoter, campaign or experiment without overloading it, and
-- entity-journeys-projections + experiment-governance-v2 both join on a STABLE OPAQUE SUBJECT ID.
-- `context_version` is what lets a later contract add fields without guessing at an old row's
-- meaning: a row's context means what version N said it meant.

-- ── the context columns ──────────────────────────────────────────────────────────────────────
--   context_version: NULL for legacy/untagged rows, 1 for anything written under this contract.
--                    Never inferred — absence is a fact ("this row predates the contract"), not a
--                    default to be filled in.
--   actor_*:         WHO caused the event (a staff user, a system job, an integration).
--   subject_*:       WHAT the event is about (the merchant, shop, campaign). This is the join key
--                    every downstream projection uses; actor and subject are frequently different
--                    (an admin activating someone else's shop) which is exactly why one `userId`
--                    could not carry both.
--   correlation_id:  ties several events emitted by one logical workflow together.
--   occurred_at:     when the fact HAPPENED, as asserted by the client. Distinct from `created_at`
--                    (when we received it) — a backfill or a queued mobile client can legitimately
--                    report an event hours after the fact, and a lifecycle projection that ordered
--                    by receipt time would then compute the wrong stage. NULL means "never
--                    asserted"; readers fall back to created_at explicitly rather than this column
--                    silently defaulting, so "client asserted a time" stays distinguishable from
--                    "we assumed one".
--   idempotency_key: caller-supplied dedupe token, unique PER PROJECT (see the index below).
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS context_version SMALLINT,
  ADD COLUMN IF NOT EXISTS actor_type      TEXT,
  ADD COLUMN IF NOT EXISTS actor_id        TEXT,
  ADD COLUMN IF NOT EXISTS subject_type    TEXT,
  ADD COLUMN IF NOT EXISTS subject_id      TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id  TEXT,
  ADD COLUMN IF NOT EXISTS occurred_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Integrity the application must not be the only thing enforcing. The route validates all of this
-- too (lib/event-context.ts), but a CHECK is what makes it true for EVERY writer forever — seed
-- scripts, backfills, a future admin path, and any code written by someone who never read the
-- route. These CHECKs deliberately mirror lib/event-context.ts rather than merely bounding length:
-- a constraint that only checked length while the comment claimed "integrity for every writer"
-- would be the "comment asserting a check the code does not perform" antipattern LEARNINGS records
-- — a service-role seed could still inject `Merchant`/` spaced `/version-less rows that break every
-- downstream projection (cross-review, Codex 2026-07-22). If you change a rule here, change it in
-- lib/event-context.ts too, and vice versa.
ALTER TABLE events
  ADD CONSTRAINT events_context_version_known
    CHECK (context_version IS NULL OR context_version = 1),
  -- If ANY context field is populated, the row was written under the contract and MUST name its
  -- version. Absence of version is only legal when the whole context is absent (a legacy row).
  ADD CONSTRAINT events_context_version_present CHECK (
    context_version IS NOT NULL OR (
      actor_type IS NULL AND actor_id IS NULL AND subject_type IS NULL AND subject_id IS NULL AND
      correlation_id IS NULL AND occurred_at IS NULL AND idempotency_key IS NULL
    )
  ),
  ADD CONSTRAINT events_actor_pairing
    CHECK ((actor_type IS NULL) = (actor_id IS NULL)),
  ADD CONSTRAINT events_subject_pairing
    CHECK ((subject_type IS NULL) = (subject_id IS NULL)),
  ADD CONSTRAINT events_opaque_id_bounds CHECK (
    (actor_id        IS NULL OR char_length(actor_id)        BETWEEN 1 AND 128) AND
    (subject_id      IS NULL OR char_length(subject_id)      BETWEEN 1 AND 128) AND
    (correlation_id  IS NULL OR char_length(correlation_id)  BETWEEN 1 AND 128) AND
    (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 1 AND 128)
  ),
  -- Entity types are a controlled vocabulary, mirroring TYPE_PATTERN in lib/event-context.ts:
  -- lower_snake_case, letter-initial, 1-64 chars. This is what stops `merchant`/`Merchant` becoming
  -- two cohorts at the DATABASE level, for a writer that never went through the route.
  ADD CONSTRAINT events_entity_type_vocabulary CHECK (
    (actor_type   IS NULL OR actor_type   ~ '^[a-z][a-z0-9_]{0,63}$') AND
    (subject_type IS NULL OR subject_type ~ '^[a-z][a-z0-9_]{0,63}$')
  ),
  -- Opaque ids: no control characters (they corrupt logs/CSV/terminal downstream) and no leading or
  -- trailing whitespace (` u1` and `u1` must not read as one subject to a human).
  --
  -- This is a COARSER backstop than lib/event-context.ts, on purpose, and the two are NOT
  -- byte-identical (cross-review, Codex round 3): `btrim` strips fewer whitespace forms than JS
  -- `.trim()` (no NBSP / Unicode spaces), and `char_length` counts code points where JS `.length`
  -- counts UTF-16 units, so a handful of exotic ids the route rejects could still be inserted by a
  -- direct service-role writer. That is acceptable because the route is AUTHORITATIVE for real
  -- tenant traffic; this CHECK exists only to stop a seed/backfill from injecting the OBVIOUS
  -- projection-breakers (a capital letter, an embedded newline, a wrapping space), not to replicate
  -- the validator exactly. Making them identical would mean a plpgsql function call per insert on
  -- the hot path for a rounding-error of extra coverage.
  ADD CONSTRAINT events_opaque_id_charset CHECK (
    (actor_id        IS NULL OR (actor_id        !~ '[[:cntrl:]]' AND actor_id        = btrim(actor_id))) AND
    (subject_id      IS NULL OR (subject_id      !~ '[[:cntrl:]]' AND subject_id      = btrim(subject_id))) AND
    (correlation_id  IS NULL OR (correlation_id  !~ '[[:cntrl:]]' AND correlation_id  = btrim(correlation_id))) AND
    (idempotency_key IS NULL OR (idempotency_key !~ '[[:cntrl:]]' AND idempotency_key = btrim(idempotency_key)))
  );

-- ── the ONE invariant that CANNOT be a CHECK, stated so the claim above stays honest ─────────────
-- lib/event-context.ts also bounds `occurred_at` to at most 24h in the FUTURE (an unbounded future
-- date pins a subject's timeline forever — see that file). That bound is deliberately NOT enforced
-- here, and the reason is a Postgres rule, not an oversight: a CHECK constraint may only call
-- IMMUTABLE functions, and `now()` is STABLE, so `CHECK (occurred_at <= now() + interval '24 hours')`
-- is rejected at migration time. A BEFORE-INSERT trigger could do it, but a trigger on the hottest
-- write path in the system is disproportionate for a bound only a rogue/buggy backfill could cross —
-- real tenant traffic goes through the route, which enforces it. So this is the single context
-- invariant that is APP-LAYER ONLY: any internal seed or backfill that writes `occurred_at` directly
-- must apply the same 24h-future clamp itself (cross-review, Codex round 2). The past is unbounded on
-- purpose (backfill is first-class), so there is no lower bound to enforce anywhere.

-- ── idempotency: unique PER PROJECT, never globally ──────────────────────────────────────────
-- The `project_id` leading column is the whole security property, not an optimisation. A globally
-- unique idempotency key would mean tenant A choosing `order-1` could make tenant B's `order-1`
-- silently collapse into A's event — a cross-tenant write dependency, and the exact shape of the
-- credential bug Roadmap/LEARNINGS.md records from multi-tenant-activation S1 (a globally-unique
-- column + "insert or ignore" = a silent cross-tenant bind that reports success). Scoping the
-- uniqueness to the project makes a collision impossible to construct from another tenant.
--
-- PARTIAL (`WHERE ... IS NOT NULL`): NULLs are distinct in a Postgres unique index anyway, but
-- stating it keeps the index off every legacy row instead of carrying millions of NULL entries.
CREATE UNIQUE INDEX IF NOT EXISTS events_project_idempotency_key_uidx
  ON events (project_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The read path entity-journeys-projections is built on: "give me every event about THIS subject,
-- in the order the facts happened." Ordered by occurred_at DESC NULLS LAST so a subject timeline
-- reads newest-first and rows that never asserted a time sort last rather than first.
CREATE INDEX IF NOT EXISTS events_project_subject_occurred_idx
  ON events (project_id, subject_type, subject_id, occurred_at DESC NULLS LAST)
  WHERE subject_id IS NOT NULL;

-- Correlation lookups ("show me the whole workflow this event belonged to") — partial for the same
-- reason: only rows that actually carry one.
CREATE INDEX IF NOT EXISTS events_project_correlation_idx
  ON events (project_id, correlation_id)
  WHERE correlation_id IS NOT NULL;

COMMENT ON COLUMN events.occurred_at IS
  'Client-asserted time the fact happened. NULL = never asserted; readers fall back to created_at explicitly. Distinct from created_at (server receipt) so late/backfilled events order correctly.';
COMMENT ON COLUMN events.subject_id IS
  'Opaque, tenant-scoped id of what this event is ABOUT (vs actor_id = who caused it). The join key for lifecycle projections and experiment metric attribution.';
COMMENT ON COLUMN events.idempotency_key IS
  'Caller-supplied dedupe token. Unique per (project_id, idempotency_key) — never globally, which would be a cross-tenant write dependency.';
