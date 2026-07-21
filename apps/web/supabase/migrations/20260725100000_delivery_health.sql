-- event-destination-router · Sprint 3, Story 3.3 — the delivery operating view's aggregate.
--
-- EXPAND-only: one new read-only function, nothing existing changes shape.
--
-- WHY AN RPC AND NOT A POSTGREST QUERY: the view answers "per destination, how much delivered /
-- failed / dead-lettered, and when did anything last land?" — a GROUP BY with FILTERed counts.
-- PostgREST cannot express that in one round trip, so the alternatives were (a) N status-count
-- queries per destination, which is O(destinations × statuses) round trips for a page render, or
-- (b) pulling every delivery row into Node and counting there, which stops being honest the moment a
-- tenant has more rows than the fetch limit — the counts would silently describe a WINDOW while
-- claiming to describe the whole. One aggregate in the database is both cheaper and truthful.
--
-- READ-ONLY and PROJECT-SCOPED: p_project_id comes from the resolved membership (never a request
-- body), and the LEFT JOIN is anchored on event_destinations so a destination with ZERO deliveries
-- still appears — "configured but nothing has ever been delivered" is exactly the state an operator
-- most needs to see, and an INNER JOIN would hide it.
--
-- NO SECRETS, NO PII: the returned columns are the destination's name/enabled flag and integer
-- counts. signing_secret and target_url are deliberately absent — this feeds an operational view,
-- and a health endpoint is not a place to re-expose a credential.
CREATE OR REPLACE FUNCTION delivery_health(p_project_id UUID)
RETURNS TABLE (
  destination_id   UUID,
  name             TEXT,
  enabled          BOOLEAN,
  delivered        BIGINT,
  failed           BIGINT,
  dead             BIGINT,
  pending          BIGINT,
  in_flight        BIGINT,
  total_attempts   BIGINT,
  last_delivery_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    d.id,
    d.name,
    d.enabled,
    COUNT(*) FILTER (WHERE dl.status = 'delivered'),
    COUNT(*) FILTER (WHERE dl.status = 'failed'),
    COUNT(*) FILTER (WHERE dl.status = 'dead'),
    COUNT(*) FILTER (WHERE dl.status = 'pending'),
    COUNT(*) FILTER (WHERE dl.status = 'in_flight'),
    COALESCE(SUM(dl.attempt_count), 0),
    MAX(dl.last_attempt_at) FILTER (WHERE dl.status = 'delivered')
  FROM event_destinations d
  LEFT JOIN event_deliveries dl
    ON dl.destination_id = d.id
   AND dl.project_id = d.project_id          -- composite match: tenancy is a JOIN fact here too
  WHERE d.project_id = p_project_id
  GROUP BY d.id, d.name, d.enabled
  ORDER BY d.name;
$$;

-- Same grant posture as ingest_event / claim_deliveries: Postgres grants EXECUTE to PUBLIC by
-- default and a later GRANT to service_role does NOT remove it, so REVOKE first, then grant.
REVOKE ALL ON FUNCTION delivery_health(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_health(UUID) TO service_role;

COMMENT ON FUNCTION delivery_health(UUID) IS
  'Per-destination delivery rollup for ONE project (Story 3.3 operating view). Read-only; returns names, enabled flags and counts — never a signing secret or target URL.';
