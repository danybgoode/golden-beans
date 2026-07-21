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
  p_project_id  UUID,
  p_limit       INTEGER,
  p_now         TIMESTAMPTZ,
  p_stale_after INTERVAL
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
          OR (dd.status = 'in_flight' AND dd.claimed_at < p_now - p_stale_after)
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
REVOKE ALL ON FUNCTION claim_deliveries(UUID, INTEGER, TIMESTAMPTZ, INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_deliveries(UUID, INTEGER, TIMESTAMPTZ, INTERVAL) TO service_role;

COMMENT ON FUNCTION claim_deliveries(UUID, INTEGER, TIMESTAMPTZ, INTERVAL) IS
  'Atomically claims up to p_limit due (or stale-in_flight) deliveries for ONE project via FOR UPDATE SKIP LOCKED, flipping them to in_flight. Only claims rows whose destination is enabled AND deliverable. p_project_id must come from the caller, never a request body.';
