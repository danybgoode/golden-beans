-- event-destination-router · Sprint 3, Story 3.3 — the delivery operating view's aggregate.
--
-- EXPAND-only: one new read-only function, nothing existing changes shape.
--
-- WHY AN RPC AND NOT A POSTGREST QUERY: the view answers "per destination, how many deliveries
-- succeeded / are awaiting retry / dead-lettered / queued, and when did anything last land?" — a
-- GROUP BY across two tables with FILTERed counts. PostgREST cannot express that in one round trip,
-- so the alternatives were N status-count queries per destination or pulling every row into Node and
-- counting there (which stops being honest the moment a tenant has more rows than the fetch limit —
-- the counts would silently describe a WINDOW while claiming to describe everything). One aggregate
-- in the database is both cheaper and truthful.
--
-- TWO SOURCES, deliberately (cross-review, Codex 2026-07-21 — replay must not erase history):
--   • SUCCESS / FAILURE counts + last-delivery come from the APPEND-ONLY attempt log
--     (event_delivery_attempts). These are "how many deliveries ever succeeded/failed", and they
--     survive a replay (which resets the delivery ROW but only ADDS to the attempt log).
--   • QUEUED / DEAD counts are CURRENT delivery-row state (event_deliveries) — "how many (event,
--     destination) pairs are right now pending/in_flight/dead". A replayed row correctly leaves its
--     dead state and rejoins the queue, and the attempt log still shows the delivery it once made.
-- Mixing the two vocabularies is the point: an operator wants both "did it ever work" (history) and
-- "is anything stuck now" (state), and each column reads from its honest source.
--
-- READ-ONLY, PROJECT-SCOPED, and anchored on event_destinations via LEFT JOINs so a destination with
-- ZERO deliveries still appears — "configured, nothing ever delivered" is the state an operator most
-- needs to see, and an INNER JOIN would hide it. NO secrets, NO target URL, NO PII in the output.
-- ── soft delete, so the cap is not a one-way door ─────────────────────────────────────────────
-- A cap with no way to remove a destination is a permanent dead end (cross-review, Codex round 11):
-- at 20 you could never replace one. But a hard DELETE would CASCADE away its delivery history (see
-- the outbox migration's FK note), so removal is a SOFT delete — exactly the semantics that
-- migration said Story 2.1 would own. A soft-deleted row keeps its history, stops receiving
-- (deletion also disables it), and frees a cap slot.
ALTER TABLE event_destinations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- A deleted destination must never be enabled — that keeps the fan-out (which checks `enabled`) and
-- the claim (which checks enabled+deliverable) correct without either learning about deleted_at.
ALTER TABLE event_destinations
  ADD CONSTRAINT event_destinations_deleted_not_enabled CHECK (deleted_at IS NULL OR NOT enabled);

-- Names are unique among LIVE destinations only, so a name can be reused after its destination is
-- deleted. Replaces the unconditional unique constraint from the outbox migration.
ALTER TABLE event_destinations DROP CONSTRAINT IF EXISTS event_destinations_project_name_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS event_destinations_project_name_live_uidx
  ON event_destinations (project_id, name) WHERE deleted_at IS NULL;

DROP FUNCTION IF EXISTS delivery_health(UUID);
CREATE OR REPLACE FUNCTION delivery_health(p_project_id UUID)
RETURNS TABLE (
  destination_id   UUID,
  name             TEXT,
  enabled          BOOLEAN,
  delivered        BIGINT,   -- successful ATTEMPTS ever (survives replay)
  failed_attempts  BIGINT,   -- failed ATTEMPTS ever (retryable + permanent) — cumulative history
  awaiting_retry   BIGINT,   -- delivery ROWS currently in the failed state (a retry is scheduled)
  dead             BIGINT,   -- delivery ROWS currently dead-lettered
  pending          BIGINT,   -- delivery ROWS currently pending
  in_flight        BIGINT,   -- delivery ROWS currently in flight
  total_attempts   BIGINT,   -- all attempts ever
  last_delivery_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH attempts AS (
    SELECT destination_id,
           COUNT(*) FILTER (WHERE outcome = 'delivered')                    AS delivered,
           COUNT(*) FILTER (WHERE outcome IN ('retryable', 'permanent'))    AS failed,
           COUNT(*)                                                          AS total_attempts,
           MAX(created_at) FILTER (WHERE outcome = 'delivered')             AS last_delivery_at
      FROM event_delivery_attempts
     WHERE project_id = p_project_id
     GROUP BY destination_id
  ),
  states AS (
    SELECT destination_id,
           COUNT(*) FILTER (WHERE status = 'failed')    AS awaiting_retry,
           COUNT(*) FILTER (WHERE status = 'dead')      AS dead,
           COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
           COUNT(*) FILTER (WHERE status = 'in_flight') AS in_flight
      FROM event_deliveries
     WHERE project_id = p_project_id
     GROUP BY destination_id
  )
  SELECT
    d.id,
    d.name,
    d.enabled,
    COALESCE(a.delivered, 0),
    COALESCE(a.failed, 0),
    COALESCE(s.awaiting_retry, 0),
    COALESCE(s.dead, 0),
    COALESCE(s.pending, 0),
    COALESCE(s.in_flight, 0),
    COALESCE(a.total_attempts, 0),
    a.last_delivery_at
  FROM event_destinations d
  LEFT JOIN attempts a ON a.destination_id = d.id
  LEFT JOIN states   s ON s.destination_id = d.id
  WHERE d.project_id = p_project_id
    AND d.deleted_at IS NULL   -- the operating view shows LIVE destinations (history is retained)
  ORDER BY d.name;
$$;

-- Same grant posture as every other function here: Postgres grants EXECUTE to PUBLIC by default and a
-- later GRANT to service_role does NOT remove it, so REVOKE first, then grant.
REVOKE ALL ON FUNCTION delivery_health(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_health(UUID) TO service_role;

-- ── per-project DESTINATION CAP ───────────────────────────────────────────────────────────────
-- Every ENABLED destination multiplies each ingested event into another outbox row, so an unbounded
-- destination count is an unbounded write amplifier on a shared database (cross-review, Codex round
-- 10). Cap it per project.
--
-- Enforced by a TRIGGER, not by counting in the app: a count-then-insert in Node is check-then-act,
-- so two concurrent creates could both observe count = cap-1 and both insert. The trigger takes a
-- transaction-scoped ADVISORY LOCK on the project before counting — see the body for why the trigger
-- alone is not enough (a bare COUNT in BEFORE INSERT does not serialize).

CREATE OR REPLACE FUNCTION enforce_destination_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cap   INTEGER := 20;
  v_count INTEGER;
BEGIN
  -- SERIALIZE per project before counting (cross-review, Codex round 11). A bare COUNT(*) in a
  -- BEFORE INSERT trigger does NOT serialize concurrent transactions: under READ COMMITTED each
  -- would see 19 and all would insert, blowing straight past the cap — the same check-then-act race
  -- the rate_limit migration exists to avoid. A transaction-scoped advisory lock keyed on the
  -- project makes concurrent creates for the SAME project queue up (and is released automatically at
  -- commit/rollback); creates for DIFFERENT projects never contend, since the key is the project id.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.project_id::text, 0));

  -- Only LIVE destinations count — a soft-deleted one frees its slot.
  SELECT COUNT(*) INTO v_count
    FROM event_destinations
   WHERE project_id = NEW.project_id AND deleted_at IS NULL;

  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'destination cap reached for project % (max %)', NEW.project_id, v_cap
      USING ERRCODE = 'check_violation', CONSTRAINT = 'event_destinations_project_cap';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_destinations_cap_trg ON event_destinations;
CREATE TRIGGER event_destinations_cap_trg
  BEFORE INSERT ON event_destinations
  FOR EACH ROW EXECUTE FUNCTION enforce_destination_cap();

-- ── delete_destination() — soft-delete AND drain, ATOMICALLY ──────────────────────────────────
-- Two statements that MUST commit together (cross-review, Codex round 13): if the soft-delete
-- committed and the drain then failed, the destination's outstanding deliveries would be left
-- undrainable AND invisible (the operating view excludes deleted destinations). One plpgsql body is
-- one transaction, so either both land or neither does — the same reasoning as ingest_event().
--
-- Draining marks pending/failed/in_flight rows `dead` with an honest reason. Attempt HISTORY is
-- untouched: it lives in the append-only event_delivery_attempts log, not in these rows.
CREATE OR REPLACE FUNCTION delete_destination(p_project_id UUID, p_destination_id UUID, p_now TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE event_destinations
     SET deleted_at = p_now, enabled = false, updated_at = p_now
   WHERE id = p_destination_id
     AND project_id = p_project_id
     AND deleted_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false; -- unknown, foreign, or already-deleted
  END IF;

  UPDATE event_deliveries
     SET status = 'dead', last_error = 'destination removed', claimed_at = NULL, updated_at = p_now
   WHERE project_id = p_project_id
     AND destination_id = p_destination_id
     AND status IN ('pending', 'failed', 'in_flight');

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION delete_destination(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_destination(UUID, UUID, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION delete_destination(UUID, UUID, TIMESTAMPTZ) IS
  'Soft-deletes a destination AND drains its outstanding deliveries to dead, in ONE transaction so a partial failure cannot leave undrainable-and-invisible queue rows. Attempt history (event_delivery_attempts) is untouched.';

-- ── replay_delivery() — check-and-requeue, ATOMICALLY ─────────────────────────────────────────
-- The live-destination check and the re-queue must be ONE statement (cross-review, Codex round 13):
-- checking in the app and then updating is check-then-act — a destination deleted in between would
-- let replay flip a just-drained `dead` row back to `pending`, where nothing can ever claim it.
-- The EXISTS subquery re-asserts liveness inside the same UPDATE, so the row only moves if its
-- destination is still live at write time.
CREATE OR REPLACE FUNCTION replay_delivery(p_project_id UUID, p_delivery_id UUID, p_now TIMESTAMPTZ)
RETURNS UUID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  UPDATE event_deliveries d
     SET status = 'pending', attempt_count = 0, next_attempt_at = p_now,
         claimed_at = NULL, last_error = NULL, updated_at = p_now
   WHERE d.id = p_delivery_id
     AND d.project_id = p_project_id
     -- only a SETTLED row may be replayed; a pending/in_flight one is already queued
     AND d.status IN ('delivered', 'failed', 'dead')
     AND EXISTS (
       SELECT 1 FROM event_destinations dest
        WHERE dest.id = d.destination_id
          AND dest.project_id = d.project_id
          AND dest.deleted_at IS NULL
     )
  RETURNING d.event_id;
$$;

REVOKE ALL ON FUNCTION replay_delivery(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replay_delivery(UUID, UUID, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION replay_delivery(UUID, UUID, TIMESTAMPTZ) IS
  'Re-queues a SETTLED delivery, but only while its destination is still live — the liveness check is inside the UPDATE, so a concurrent delete cannot let replay resurrect unclaimable work. Returns the event_id, or NULL if nothing matched.';

COMMENT ON FUNCTION enforce_destination_cap() IS
  'Caps destinations per project (20). Enforced in-transaction by trigger because a count-then-insert in the app is a check-then-act race. Each enabled destination is a write amplifier on ingest.';

COMMENT ON FUNCTION delivery_health(UUID) IS
  'Per-destination delivery rollup for ONE project (Story 3.3). Success/failure/last-delivery come from the append-only attempt log (survive replay); queued/dead are current delivery-row state. Read-only; returns names, enabled flags and counts — never a signing secret or target URL.';
