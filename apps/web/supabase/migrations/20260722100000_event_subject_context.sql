-- event-destination-router · Sprint 1, Story 1.1 — versioned actor/subject context on `events`.
--
-- EXPAND-only (Roadmap/LEARNINGS.md, the rollout-ordering rule): every column here is nullable and
-- every index is additive, so this migration is safe to apply BEFORE the code that reads it and
-- safe to leave in place if that code is reverted. Nothing existing changes shape — a v1 payload
-- (`{userId, event}`) still writes exactly the row it wrote yesterday, with these columns NULL.
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
-- too (lib/event-context.ts), but a CHECK is what makes it true for every writer forever — seed
-- scripts, backfills, a future admin path, and any code written by someone who never read the
-- route. Bounded length matters because these are OPAQUE ids we index and echo back: unbounded
-- text in an indexed column is a cheap way for one tenant to bloat shared storage.
ALTER TABLE events
  ADD CONSTRAINT events_context_version_known
    CHECK (context_version IS NULL OR context_version = 1),
  ADD CONSTRAINT events_actor_pairing
    CHECK ((actor_type IS NULL) = (actor_id IS NULL)),
  ADD CONSTRAINT events_subject_pairing
    CHECK ((subject_type IS NULL) = (subject_id IS NULL)),
  ADD CONSTRAINT events_opaque_id_bounds CHECK (
    (actor_type      IS NULL OR char_length(actor_type)      BETWEEN 1 AND 64)  AND
    (actor_id        IS NULL OR char_length(actor_id)        BETWEEN 1 AND 128) AND
    (subject_type    IS NULL OR char_length(subject_type)    BETWEEN 1 AND 64)  AND
    (subject_id      IS NULL OR char_length(subject_id)      BETWEEN 1 AND 128) AND
    (correlation_id  IS NULL OR char_length(correlation_id)  BETWEEN 1 AND 128) AND
    (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 1 AND 128)
  );

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
