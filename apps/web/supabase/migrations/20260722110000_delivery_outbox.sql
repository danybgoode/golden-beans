-- event-destination-router · Sprint 1, Story 1.2 — transactional outbox + dark delivery gate.
--
-- EXPAND-only (Roadmap/LEARNINGS.md, the rollout-ordering rule): two brand-new tables and one new
-- function. Nothing existing changes shape, so this is safe to apply BEFORE the code that reads it
-- and safe to leave in place if that code is reverted. The one touch to an existing table is an
-- additive UNIQUE constraint on `events (id, project_id)` — trivially satisfied by every row that
-- already exists, because `id` is already the primary key (see the composite-FK note below).
--
-- WHY AN OUTBOX AT ALL: the epic's Decision 2. `/track` must answer the caller from its OWN
-- durability, never from a vendor's. The classic failure here is "call the webhook inline, then
-- return" — which makes every tenant's ingest latency and availability a function of the flakiest
-- sink anyone configured, and loses the event outright when the sink is down. Writing the delivery
-- INTENT in the same transaction as the event means a sink can be unreachable for a week and lose
-- nothing: the work is already committed, waiting.
--
-- WHY A POSTGRES FUNCTION: supabase-js has no multi-statement transaction. Two separate
-- `.from(...).insert(...)` calls from the route are two independent transactions, so a crash (or a
-- cold-start timeout, or a 500 from PostgREST) between them commits the event with NO delivery work
-- — an event that silently never reaches its destination, with nothing anywhere recording that it
-- should have. That is the "honest-looking zero" failure LEARNINGS.md records three times in this
-- repo, and it is unrecoverable after the fact because nothing distinguishes "no destination was
-- eligible" from "we crashed before queueing". A plpgsql function body is ONE transaction by
-- definition, so the event row and its delivery rows commit or roll back together, full stop.

-- ── event_destinations ───────────────────────────────────────────────────────────────────────
-- MINIMAL ON PURPOSE. Sprint 2, Story 2.1 owns the destination LIFECYCLE — the management API,
-- the target URL, the HMAC signing secret and its rotation. Deliberately none of that here: a
-- secret column with no rotation path, no management route and no code reading it is a liability
-- that would sit in the schema for a whole sprint earning nothing. What this table needs to be
-- TODAY is something an outbox row can be eligible *against*, so that the fan-out rule is real and
-- testable before there is anything to fan out to.
--
--   enabled:      born FALSE. The per-destination kill (epic README, "Kill-switch") is the
--                 fine-grained sibling of DESTINATION_DELIVERY_ENABLED, and a destination that
--                 starts delivering the instant it is created is a destination nobody can safely
--                 create. Disabling one must stop NEW work being queued for it, which is why the
--                 flag is consulted in the fan-out below and not only at dispatch time.
--   event_filter: NULL = every event of this project. Otherwise an EXACT event-name match. Exact,
--                 not a glob or a prefix: a matcher a tenant can get subtly wrong silently under-
--                 delivers, and "why did only some events arrive" is a miserable support ticket.
--                 A richer matcher belongs with the management API that can validate and preview
--                 it (Story 2.1), not here.
CREATE TABLE IF NOT EXISTS event_destinations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  enabled      BOOLEAN     NOT NULL DEFAULT false,
  event_filter TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Names are how a human tells two destinations apart in a UI and in a support conversation, so
  -- they are unique WITHIN a project. Never globally: a globally-unique name would leak the
  -- existence of another tenant's destination through a conflict error, and is the same shape as
  -- the globally-unique-credential cross-tenant bind LEARNINGS.md records from
  -- multi-tenant-activation S1.
  CONSTRAINT event_destinations_project_name_uniq UNIQUE (project_id, name),
  CONSTRAINT event_destinations_name_bounds CHECK (char_length(name) BETWEEN 1 AND 128),
  CONSTRAINT event_destinations_filter_bounds
    CHECK (event_filter IS NULL OR char_length(event_filter) BETWEEN 1 AND 256)
);
ALTER TABLE event_destinations ENABLE ROW LEVEL SECURITY;

-- RLS ON with NO policies, matching every other table in this repo (see the track_events
-- migration's note): only the service-role key — i.e. this app's server-side client — sees a row.
-- The anon key gets zero rows. There is no client-side Supabase usage in this project.

-- ── composite uniqueness, so tenancy is a DATABASE fact ──────────────────────────────────────
-- These two constraints exist ONLY to make the composite foreign keys on event_deliveries below
-- possible. Both are redundant as uniqueness claims (`id` is already the primary key of each
-- table), which is exactly why they are free to add to a live table — every existing row already
-- satisfies them.
--
-- The point: with them, a delivery row that pairs project A's event with project B's destination is
-- impossible to INSERT, not merely absent from the query that produces them. AGENTS.md's tenancy
-- rule is enforced in the application (`auth.projectId`, never the body) and that is the primary
-- control — but a WHERE clause is one careless edit away from being wrong, and this class of bug
-- ships silently. Belt and braces, on the axis that matters most.
ALTER TABLE events
  ADD CONSTRAINT events_id_project_uniq UNIQUE (id, project_id);
ALTER TABLE event_destinations
  ADD CONSTRAINT event_destinations_id_project_uniq UNIQUE (id, project_id);

-- ── event_deliveries — the outbox itself ─────────────────────────────────────────────────────
-- One row = "this event still owes this destination a delivery". Sprint 2, Story 2.2 owns the
-- retry ENGINE (backoff schedule, dead-letter policy, replay). The columns that engine will need
-- are here from the start, because adding bookkeeping columns later means backfilling rows that are
-- already in flight — but nothing in this sprint advances them past their defaults.
--
--   status:          pending → in_flight → delivered | failed | dead.
--                    `failed` is RETRYABLE (a 503, a timeout); `dead` is terminal (exhausted, or a
--                    permanent 4xx). Keeping them distinct is what lets Story 2.2's replay know
--                    what it may safely re-attempt without asking a human.
--   attempt_count:   real send attempts only. This sprint's dispatcher never increments it —
--                    see lib/delivery-dispatch.ts for exactly where that boundary sits.
--   claimed_at:      when a dispatcher took ownership. Story 2.2 uses this to RECLAIM rows stranded
--                    in `in_flight` by a worker that died mid-flight; until then, see the dispatcher
--                    comment for the residual window and why it is acceptable while the gate is OFF.
--   next_attempt_at: the backoff schedule's cursor. Defaults to now() so a fresh row is immediately
--                    eligible; Story 2.2 pushes it forward after a failure.
CREATE TABLE IF NOT EXISTS event_deliveries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL,
  event_id        UUID        NOT NULL,
  destination_id  UUID        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',
  attempt_count   INTEGER     NOT NULL DEFAULT 0,
  claimed_at      TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT event_deliveries_status_known
    CHECK (status IN ('pending', 'in_flight', 'delivered', 'failed', 'dead')),
  CONSTRAINT event_deliveries_attempts_sane CHECK (attempt_count >= 0),

  -- THE OUTBOX'S OWN IDEMPOTENCY, and the reason a replayed ingest cannot double-deliver. Delivery
  -- is at-least-once by contract (epic README), so consumers must be idempotent anyway — but that
  -- is no excuse for generating duplicate WORK. One (event, destination) pair owes exactly one
  -- delivery, forever, no matter how many times the caller retries the ingest that created it.
  CONSTRAINT event_deliveries_event_destination_uniq UNIQUE (event_id, destination_id),

  -- Composite, not simple, FKs — see the note above events_id_project_uniq. `(event_id,
  -- project_id)` and `(destination_id, project_id)` both have to agree on the SAME project_id
  -- column, so a cross-tenant delivery row is a constraint violation rather than a quiet leak.
  CONSTRAINT event_deliveries_event_fk
    FOREIGN KEY (event_id, project_id) REFERENCES events (id, project_id) ON DELETE CASCADE,
  CONSTRAINT event_deliveries_destination_fk
    FOREIGN KEY (destination_id, project_id) REFERENCES event_destinations (id, project_id)
    ON DELETE CASCADE
);
ALTER TABLE event_deliveries ENABLE ROW LEVEL SECURITY;

-- The dispatcher's PROJECT-SCOPED claim query: "the oldest due work for this project" (the
-- dispatcher is ALWAYS project-scoped — cross-review, Codex round 5). Partial on the two statuses a
-- dispatcher may touch, so the index stays small as delivered rows accumulate — the delivered/dead
-- rows are history, read by a different (Story 3.3) query shape. It also serves Story 2.2's
-- "which projects have due work" enumeration (`SELECT DISTINCT project_id … WHERE status IN (…) AND
-- next_attempt_at <= now`), since that leads on project_id too.
CREATE INDEX IF NOT EXISTS event_deliveries_claimable_idx
  ON event_deliveries (project_id, next_attempt_at)
  WHERE status IN ('pending', 'failed');

-- "What happened to this event?" — the operator question Story 3.3's view answers.
CREATE INDEX IF NOT EXISTS event_deliveries_event_idx ON event_deliveries (event_id);

-- ── ingest_event() — the atomic write path ───────────────────────────────────────────────────
-- Replaces the route's plain `.from('events').insert()`. Everything the route used to send is a
-- parameter here, including all of Story 1.1's context columns.
--
-- TENANCY: `p_project_id` is supplied by the route from `auth.projectId` — resolved server-side
-- from the hashed API key — and NEVER from the request body (AGENTS.md, Decision 8). This function
-- deliberately has no other way to learn a project: it does not read a slug, a key, or anything
-- from `p_tags`/`p_metadata`. Every project-scoped statement below re-asserts `p_project_id`
-- rather than inferring the tenant from the event or destination row it just found.
--
-- Returns the event id plus whether this call was a dedupe hit, because the route's HTTP contract
-- differs between them (201 + id vs. 200 + id + deduplicated:true) and it must not have to
-- re-derive that with a second round trip.
CREATE OR REPLACE FUNCTION ingest_event(
  p_project_id      UUID,
  p_user_id         TEXT,
  p_event           TEXT,
  p_feature_id      TEXT,
  p_tags            JSONB,
  p_metadata        JSONB,
  p_context_version SMALLINT,
  p_actor_type      TEXT,
  p_actor_id        TEXT,
  p_subject_type    TEXT,
  p_subject_id      TEXT,
  p_correlation_id          TEXT,
  p_occurred_at             TIMESTAMPTZ,
  p_idempotency_key         TEXT,
  p_idempotency_fingerprint TEXT
)
RETURNS TABLE (event_id UUID, deduplicated BOOLEAN, queued_count INTEGER, conflict BOOLEAN)
LANGUAGE plpgsql
-- SECURITY INVOKER (the default, stated explicitly): this function must run with the caller's
-- privileges. SECURITY DEFINER would make it a standing privilege-escalation surface — anything
-- that could reach it would write events as the owner regardless of its own grants — for zero
-- benefit, since the only caller is already the service-role client.
SECURITY INVOKER
-- Pinning search_path is what stops a `public`-shadowing schema on someone's session from
-- redirecting these writes to a different `events` table.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id     UUID;
  v_dedup        BOOLEAN := false;
  v_conflict     BOOLEAN := false;
  v_queued       INTEGER := 0;
  v_constraint   TEXT;
  v_existing_fp  TEXT;
BEGIN
  -- ── 1. the canonical event ────────────────────────────────────────────────────────────────
  -- The inner BEGIN/EXCEPTION block is a subtransaction: a unique violation here rolls back THIS
  -- statement only, leaving the enclosing transaction usable so we can resolve the original id and
  -- still fan out. Without the block, the whole function would abort and the route would have to
  -- retry from scratch.
  BEGIN
    INSERT INTO events (
      project_id, user_id, event, feature_id, tags, metadata,
      context_version, actor_type, actor_id, subject_type, subject_id,
      correlation_id, occurred_at, idempotency_key, idempotency_fingerprint
    ) VALUES (
      p_project_id, p_user_id, p_event, p_feature_id,
      COALESCE(p_tags, '{}'::jsonb), COALESCE(p_metadata, '{}'::jsonb),
      p_context_version, p_actor_type, p_actor_id, p_subject_type, p_subject_id,
      p_correlation_id, p_occurred_at, p_idempotency_key, p_idempotency_fingerprint
    )
    RETURNING id INTO v_event_id;

  EXCEPTION WHEN unique_violation THEN
    -- ── 2. idempotent replay ────────────────────────────────────────────────────────────────
    -- Semantics moved here verbatim from the route's 23505 branch (Story 1.1); the HTTP behaviour
    -- it produces is unchanged and its specs still pass unmodified.
    --
    -- We let the unique index be the arbiter rather than checking-then-inserting: two concurrent
    -- retries of the same request would both pass a prior SELECT and both insert, which is exactly
    -- the check-then-act race the rate_limit migration exists to avoid elsewhere.
    --
    -- Scoped to OUR index BY NAME. Any other unique violation (the new composite constraints
    -- above, a future one, a bug) must NOT be silently reinterpreted as "this was just a retry" and
    -- answered with someone else's event id — so it is re-raised untouched.
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'events_project_idempotency_key_uidx' THEN
      RAISE;
    END IF;

    -- The tenant scope is RE-ASSERTED here, never assumed from the key. Uniqueness is per
    -- (project_id, idempotency_key), so looking up on the key alone could match another tenant's
    -- row — the cross-tenant bind shape LEARNINGS.md records from multi-tenant-activation S1.
    SELECT e.id, e.idempotency_fingerprint INTO v_event_id, v_existing_fp
      FROM events e
     WHERE e.project_id = p_project_id
       AND e.idempotency_key = p_idempotency_key;

    IF v_event_id IS NULL THEN
      -- Unreachable by construction (the index just told us a row exists). Raised with a distinct
      -- SQLSTATE so the route can keep answering this case with its own specific 500 rather than
      -- flattening it into "failed to persist" — a message that would send an operator looking at
      -- the wrong thing.
      RAISE EXCEPTION 'idempotency conflict with no matching row for project %', p_project_id
        USING ERRCODE = 'GB001';
    END IF;

    -- PAYLOAD-MISMATCH detection (cross-review, Codex round 4). The key already belongs to a stored
    -- event; if the fingerprint of THIS payload differs, the caller reused one key for two different
    -- events — a client bug. Report it as a conflict (the route answers 409) instead of returning the
    -- original id and silently dropping this event. A NULL stored fingerprint (an event written
    -- before this column existed) is treated as "cannot compare" → a plain dedup, never a false
    -- conflict.
    IF v_existing_fp IS NOT NULL AND p_idempotency_fingerprint IS NOT NULL
       AND v_existing_fp IS DISTINCT FROM p_idempotency_fingerprint THEN
      v_conflict := true;
    ELSE
      v_dedup := true;
    END IF;
  END;

  -- A conflict fans out nothing and creates nothing — it is a rejected request, not a stored event.
  IF v_conflict THEN
    RETURN QUERY SELECT v_event_id, false, 0, true;
    RETURN;
  END IF;

  -- ── 3. fan-out: one delivery row per ELIGIBLE destination ─────────────────────────────────
  -- ONLY ON A FRESH INSERT. A replay (v_dedup) returns here having created no event — and it must
  -- create no delivery work either. Two things make "fan out on every call" actively wrong, not
  -- merely redundant (cross-review, Codex 2026-07-22):
  --   (1) The RETRY's p_event and the CURRENT destination set are used, not the original event's.
  --       A client that retries with a different event name, or a destination enabled AFTER the
  --       original ingest, would attach BRAND-NEW deliveries to the ORIGINAL event — routing it
  --       through a filter its canonical event never matched. "Repeat returns the original id and
  --       creates nothing" would be violated.
  --   (2) Retroactive delivery to a newly-enabled destination is a real feature — but it is Story
  --       2.2's operator-initiated REPLAY, a deliberate act, not an accidental side effect of a
  --       client's at-least-once retry. A destination receives events that arrive AFTER it is
  --       enabled, never ones that merely get re-sent past it.
  --
  -- WITH ZERO DESTINATIONS CONFIGURED — the state of production today — THIS INSERTS NOTHING, and
  -- that is the correct dark behaviour, not a bug. `queued_count` returning 0 is the honest answer
  -- to "who wanted this event?", and it stays 0 until a tenant deliberately creates and enables a
  -- destination in Story 2.1.
  --
  -- The (event_id, destination_id) unique constraint remains the concurrency arbiter for the fresh
  -- path: two genuinely-concurrent first inserts of the same event can't both win the event insert
  -- (one becomes the dedup path), so only one reaches this fan-out — but the constraint is kept as
  -- belt-and-braces against any future caller that reaches this line twice.
  IF NOT v_dedup THEN
    INSERT INTO event_deliveries (project_id, event_id, destination_id)
    SELECT p_project_id, v_event_id, d.id
      FROM event_destinations d
     WHERE d.project_id = p_project_id
       AND d.enabled
       AND (d.event_filter IS NULL OR d.event_filter = p_event)
    ON CONFLICT ON CONSTRAINT event_deliveries_event_destination_uniq DO NOTHING;

    GET DIAGNOSTICS v_queued = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_event_id, v_dedup, v_queued, false;
END;
$$;

-- Explicit grants for the same reason 20260714150000_track_events_grants.sql made them explicit:
-- RLS bypass and table-level GRANTs are separate permission axes, and a newer local Supabase CLI's
-- bootstrap does not auto-grant service_role table access. No claim is made here about what these
-- grants FORBID — on Supabase a new public-schema table can arrive with service_role already
-- granted ALL, so a narrower GRANT revokes nothing (LEARNINGS.md, multi-tenant-activation S2).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE event_destinations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE event_deliveries   TO service_role;
GRANT EXECUTE ON FUNCTION ingest_event(
  UUID, TEXT, TEXT, TEXT, JSONB, JSONB, SMALLINT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
) TO service_role;

COMMENT ON TABLE event_deliveries IS
  'Transactional outbox: one row per (event, destination) that still owes a delivery. Written in the SAME transaction as the event by ingest_event(), so a sink outage can never cost an event. Retry/backoff/dead-letter is Sprint 2 Story 2.2.';
COMMENT ON COLUMN event_destinations.enabled IS
  'Per-destination kill switch, born FALSE. Consulted at FAN-OUT time (not only at dispatch), so disabling a destination stops new work being queued for it.';
COMMENT ON FUNCTION ingest_event(
  UUID, TEXT, TEXT, TEXT, JSONB, JSONB, SMALLINT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
) IS
  'Atomic ingest: canonical event + eligible outbox work in one transaction. p_project_id must come from the resolved API key, never from a request body.';
