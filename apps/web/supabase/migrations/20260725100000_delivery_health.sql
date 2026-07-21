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
  ORDER BY d.name;
$$;

-- Same grant posture as every other function here: Postgres grants EXECUTE to PUBLIC by default and a
-- later GRANT to service_role does NOT remove it, so REVOKE first, then grant.
REVOKE ALL ON FUNCTION delivery_health(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_health(UUID) TO service_role;

COMMENT ON FUNCTION delivery_health(UUID) IS
  'Per-destination delivery rollup for ONE project (Story 3.3). Success/failure/last-delivery come from the append-only attempt log (survive replay); queued/dead are current delivery-row state. Read-only; returns names, enabled flags and counts — never a signing secret or target URL.';
