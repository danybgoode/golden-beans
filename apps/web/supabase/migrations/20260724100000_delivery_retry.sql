-- event-destination-router · Sprint 2, Story 2.2 — the race-free claim + stale reclaim.
--
-- EXPAND-only: one new function, nothing existing changes shape. Story 1.2's dispatcher claimed with
-- a two-statement select-then-update dance and explicitly named its own successor (see
-- lib/delivery-dispatch.ts: "moving this into a plpgsql function alongside ingest_event is the
-- natural upgrade — SKIP LOCKED avoids the contention this shape merely survives"). This is that
-- function. supabase-js cannot express `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` in
-- one round trip, and that single atomic statement is the whole point:
--   • SKIP LOCKED means two concurrent workers never fight over the same row — each takes DIFFERENT
--     due rows and neither blocks, so N workers give N× throughput instead of N workers contending
--     for one lock. It is the standard Postgres work-queue claim.
--   • Doing the select and the flip-to-in_flight as ONE statement closes the check-then-act race the
--     old two-statement version could only *survive* (via a re-asserted status guard), not avoid.

-- Claims up to p_limit due deliveries for ONE project, flips them to in_flight, and returns them.
-- ALWAYS project-scoped (AGENTS.md rule #1): p_project_id is required and every predicate re-asserts
-- it. The dispatcher's production trigger enumerates projects with due work and calls this once per
-- project, so one worker's blast radius is exactly one tenant.
--
-- ELIGIBILITY is enforced HERE, not left to the sender: a row is claimable only if its destination is
-- still ENABLED and actually DELIVERABLE (has a url + secret). That means:
--   • disabling a destination stops its already-queued work from being sent (the "disabled receives
--     nothing" guarantee holds for in-flight-but-unsent work too, not just future fan-out), and
--   • a claimed row is always send-able — the sender never has to park a row it can't deliver.
--
-- Two sources of claimable work, unioned in the WHERE:
--   1. Due retryable work: status pending|failed AND next_attempt_at <= now.
--   2. STALE reclaim: a row stuck in_flight past p_stale_after — a worker died between claiming and
--      settling it (the residual window Story 1.2's dispatcher documented and left for this story).
--      Reclaiming it is safe because delivery is at-least-once by contract; the alternative is a row
--      stranded forever.
CREATE OR REPLACE FUNCTION claim_deliveries(
  p_project_id     UUID,
  p_limit          INTEGER,
  p_now            TIMESTAMPTZ,
  p_stale_after_ms INTEGER
)
RETURNS TABLE (id UUID, project_id UUID, event_id UUID, destination_id UUID, attempt_count INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  UPDATE event_deliveries d
     SET status     = 'in_flight',
         claimed_at = p_now,
         updated_at = p_now
   WHERE d.id IN (
     SELECT dd.id
       FROM event_deliveries dd
       JOIN event_destinations dest
         ON dest.id = dd.destination_id
        AND dest.project_id = dd.project_id      -- composite match: tenancy is a JOIN fact here too
      WHERE dd.project_id = p_project_id
        AND dest.enabled
        AND dest.target_url IS NOT NULL
        AND dest.signing_secret IS NOT NULL
        AND (
          (dd.status IN ('pending', 'failed') AND dd.next_attempt_at <= p_now)
          OR (dd.status = 'in_flight' AND dd.claimed_at < p_now - make_interval(secs => p_stale_after_ms / 1000.0))
        )
      ORDER BY dd.next_attempt_at ASC
      LIMIT p_limit
      FOR UPDATE OF dd SKIP LOCKED               -- the race-free claim; lock the delivery rows only
   )
  RETURNING d.id, d.project_id, d.event_id, d.destination_id, d.attempt_count;
END;
$$;

-- Same grant posture as ingest_event (20260722110000): Postgres grants EXECUTE to PUBLIC by default
-- and a later GRANT to service_role does NOT remove it, so REVOKE from PUBLIC/anon/authenticated
-- FIRST, then grant service_role. Naming the two API roles makes "service-role-only" conclusive
-- rather than dependent on how the grant happened to be shaped (LEARNINGS.md, multi-tenant S2).
REVOKE ALL ON FUNCTION claim_deliveries(UUID, INTEGER, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_deliveries(UUID, INTEGER, TIMESTAMPTZ, INTEGER) TO service_role;

COMMENT ON FUNCTION claim_deliveries(UUID, INTEGER, TIMESTAMPTZ, INTEGER) IS
  'Atomically claims up to p_limit due (or stale-in_flight) deliveries for ONE project via FOR UPDATE SKIP LOCKED, flipping them to in_flight. Only claims rows whose destination is enabled AND deliverable. p_project_id must come from the caller, never a request body.';

-- ── event_delivery_attempts — the append-only attempt LOG ─────────────────────────────────────
-- One row per REAL send attempt the dispatcher settled. It exists because the outbox row
-- (event_deliveries) holds only CURRENT state — one row per (event, destination) — so a REPLAY that
-- resets that row to pending would erase the record of the delivery it already made (cross-review,
-- Codex 2026-07-21). The delivery row stays the retry engine's working state; THIS table is the
-- history the operating view (Story 3.3) and any audit read from, and replay adds to it rather than
-- destroying it. Same append-only-by-grant shape as audit_log (SELECT+INSERT, no UPDATE/DELETE).
--
--   outcome:     the send disposition — delivered | retryable | permanent | skipped. NOT the
--                delivery's status: an attempt is delivered/retryable/permanent; the DELIVERY becomes
--                dead when a permanent attempt lands or the retry budget is spent. Keeping the two
--                vocabularies distinct is what lets the health view count "successful deliveries ever"
--                (outcome='delivered') separately from "current rows in a dead state".
--   attempt_no:  the post-increment attempt_count this attempt represents.
--
-- The composite FK below needs (id, project_id) unique on event_deliveries — redundant as a
-- uniqueness claim (id is already PK), which is why it is free to add to a live table. Added BEFORE
-- the table so the inline FK can reference it.
ALTER TABLE event_deliveries
  ADD CONSTRAINT event_deliveries_id_project_uniq UNIQUE (id, project_id);

CREATE TABLE IF NOT EXISTS event_delivery_attempts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL,
  delivery_id    UUID        NOT NULL,
  destination_id UUID        NOT NULL,
  event_id       UUID        NOT NULL,
  outcome        TEXT        NOT NULL,
  http_status    INTEGER,
  latency_ms     INTEGER,
  error          TEXT,
  attempt_no     INTEGER     NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT event_delivery_attempts_outcome_known
    CHECK (outcome IN ('delivered', 'retryable', 'permanent', 'skipped')),
  -- Composite FK: an attempt row can only pair a delivery with the SAME project — tenancy as a DB
  -- fact, the same shape as event_deliveries' composite FKs. CASCADE so tenant offboarding
  -- (DELETE FROM projects) erases attempts too.
  CONSTRAINT event_delivery_attempts_delivery_fk
    FOREIGN KEY (delivery_id, project_id) REFERENCES event_deliveries (id, project_id) ON DELETE CASCADE
);
ALTER TABLE event_delivery_attempts ENABLE ROW LEVEL SECURITY;

-- "What happened to this destination?" — the operating view's aggregate scans by destination.
CREATE INDEX IF NOT EXISTS event_delivery_attempts_dest_idx
  ON event_delivery_attempts (destination_id, outcome);

-- delivery_health() filters attempts by PROJECT first (WHERE project_id = …), so it needs a
-- project-leading index — the destination-leading one above can't serve it, and without this the
-- aggregate degrades to a full scan as attempts accumulate (cross-review, Codex round 5).
CREATE INDEX IF NOT EXISTS event_delivery_attempts_project_idx
  ON event_delivery_attempts (project_id, destination_id, outcome);

-- Append-only by GRANT (no UPDATE/DELETE to service_role), the same posture as audit_log: the
-- history cannot be rewritten, only added to. REVOKE PUBLIC/anon/authenticated first (a later grant
-- to service_role does not remove Postgres' PUBLIC default).
REVOKE ALL ON TABLE event_delivery_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE event_delivery_attempts TO service_role;

COMMENT ON TABLE event_delivery_attempts IS
  'Append-only log of every settled send attempt. The delivery row holds current state; this holds history, so a replay (which resets the delivery row) never erases the delivery it already made. Read by the Story 3.3 operating view.';

-- ── settle_delivery() — ATOMIC settle + attempt-log write ─────────────────────────────────────
-- The delivery ROW's new state AND its attempt-log row must be written in ONE transaction
-- (cross-review, Codex 2026-07-21): if the row settled but a separate best-effort log insert failed,
-- the operating view (which counts from the log) would permanently under-report — history silently
-- lost. supabase-js has no multi-statement transaction, so this is a plpgsql function, the same
-- reasoning as ingest_event().
--
-- The guarded UPDATE carries the OWNERSHIP TOKEN (status='in_flight' AND claimed_at=p_claim_token):
-- a row reclaimed out from under this worker (a later stale-reclaim gave it a new claimed_at) does
-- NOT match, so a stale worker cannot overwrite the winner's result. The attempt row is written ONLY
-- when the UPDATE matched exactly one row and p_log is true — tying history to owning the row keeps
-- a reclaim race from double-counting a send. Returns whether the row was persisted.
CREATE OR REPLACE FUNCTION settle_delivery(
  p_delivery_id     UUID,
  p_project_id      UUID,
  p_claim_token     TIMESTAMPTZ,
  p_status          TEXT,
  p_next_attempt_at TIMESTAMPTZ,
  p_last_error      TEXT,
  p_attempt_count   INTEGER,
  p_now             TIMESTAMPTZ,
  p_log             BOOLEAN,
  p_destination_id  UUID,
  p_event_id        UUID,
  p_outcome         TEXT,
  p_http_status     INTEGER,
  p_latency_ms      INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE event_deliveries
     SET status          = p_status,
         attempt_count   = p_attempt_count,
         last_error      = p_last_error,
         claimed_at      = NULL,
         -- NULL means "leave unchanged" — only the retry (failed) path supplies a new schedule. A
         -- terminal row (delivered/dead) therefore retains its last next_attempt_at; that is
         -- harmless and intentional — next_attempt_at is NOT NULL (so it cannot be cleared) and is
         -- only ever READ for claimable (pending/failed) rows, never for terminal ones (cross-review,
         -- Codex round 3 flagged the staleness; it is a no-op by construction).
         next_attempt_at = COALESCE(p_next_attempt_at, next_attempt_at),
         -- a real attempt stamps last_attempt_at; the release (p_log=false) path attempted nothing.
         last_attempt_at = CASE WHEN p_log THEN p_now ELSE last_attempt_at END,
         updated_at      = p_now
   WHERE id = p_delivery_id
     AND project_id = p_project_id
     AND status = 'in_flight'
     AND claimed_at = p_claim_token;   -- the ownership token
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 AND p_log THEN
    INSERT INTO event_delivery_attempts (
      project_id, delivery_id, destination_id, event_id, outcome, http_status, latency_ms, error, attempt_no
    ) VALUES (
      p_project_id, p_delivery_id, p_destination_id, p_event_id, p_outcome, p_http_status, p_latency_ms, p_last_error, p_attempt_count
    );
  END IF;

  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION settle_delivery(UUID, UUID, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TEXT, INTEGER, TIMESTAMPTZ, BOOLEAN, UUID, UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_delivery(UUID, UUID, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TEXT, INTEGER, TIMESTAMPTZ, BOOLEAN, UUID, UUID, TEXT, INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION settle_delivery(UUID, UUID, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TEXT, INTEGER, TIMESTAMPTZ, BOOLEAN, UUID, UUID, TEXT, INTEGER, INTEGER) IS
  'Atomically settles a claimed delivery (guarded by the claimed_at ownership token) AND writes its append-only attempt-log row in one transaction, so delivery history cannot be lost by a partial write. Returns whether the row was persisted.';

-- ── projects_with_due_work() — the cron enumeration, eligibility-aware ────────────────────────
-- Which projects should this tick dispatch? The naive answer (a PostgREST SELECT on pending/failed
-- then de-dup in Node) had two bugs cross-review caught (Codex + Antigravity, 2026-07-21):
--   1. It filtered status IN (pending, failed) and so NEVER surfaced a project whose only due work is
--      a STALE in_flight row — a worker crashed mid-send and its rows can never be reclaimed because
--      the enumeration that feeds the reclaiming RPC omits them. This RPC includes the SAME
--      stale-in_flight condition claim_deliveries uses, so enumeration and claim agree.
--   2. It read a bounded page BEFORE de-duplicating, so one project with a huge backlog (or a backlog
--      behind a DISABLED destination) could fill the page and starve every other tenant. A real
--      SELECT DISTINCT over only ELIGIBLE work (enabled + deliverable destination) has neither
--      problem: a disabled destination's rows are not "due work" at all, and DISTINCT is exact.
CREATE OR REPLACE FUNCTION projects_with_due_work(
  p_now            TIMESTAMPTZ,
  p_limit          INTEGER,
  p_stale_after_ms INTEGER
)
RETURNS TABLE (project_id UUID)
LANGUAGE sql
-- VOLATILE, not STABLE (cross-review, Codex round 10): the body orders by random(), so repeated
-- calls within one statement/snapshot legitimately return DIFFERENT rows. Declaring STABLE would
-- promise the planner otherwise and license it to cache/collapse calls — defeating the very
-- anti-starvation randomness the ORDER BY exists for.
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  -- ORDER BY random(), NOT oldest-first (cross-review, Codex rounds 3 & 6). Oldest-first looks fair
  -- but is the OPPOSITE under a sequential, budget-limited cron: a deeply-backlogged slow project is
  -- ALWAYS the oldest, so it is picked first on every tick and projects behind it can NEVER be
  -- reached — deterministic starvation. Random order gives every due project an independent chance
  -- each tick, so expected wait is bounded and no tenant is starved. Strict-oldest urgency is traded
  -- for anti-starvation deliberately; true round-robin/parallel scheduling is a scale follow-up when
  -- measured traffic needs it. GROUP BY collapses to one row per project (replaces DISTINCT).
  SELECT dd.project_id
    FROM event_deliveries dd
    JOIN event_destinations dest
      ON dest.id = dd.destination_id
     AND dest.project_id = dd.project_id
   WHERE dest.enabled
     AND dest.target_url IS NOT NULL
     AND dest.signing_secret IS NOT NULL
     AND (
       (dd.status IN ('pending', 'failed') AND dd.next_attempt_at <= p_now)
       OR (dd.status = 'in_flight' AND dd.claimed_at < p_now - make_interval(secs => p_stale_after_ms / 1000.0))
     )
   GROUP BY dd.project_id
   ORDER BY random()
   LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION projects_with_due_work(TIMESTAMPTZ, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION projects_with_due_work(TIMESTAMPTZ, INTEGER, INTEGER) TO service_role;

COMMENT ON FUNCTION projects_with_due_work(TIMESTAMPTZ, INTEGER, INTEGER) IS
  'DISTINCT project_ids that currently have ELIGIBLE due work (enabled+deliverable destination, and either due pending/failed OR stale in_flight). Feeds the dispatch cron; matches claim_deliveries eligibility so enumeration and claim never disagree.';
