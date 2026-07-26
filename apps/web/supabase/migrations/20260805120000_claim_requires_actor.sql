-- signals-loop · Sprint 2 — a claim with no claimant is refused CLEANLY, not by exception.
--
-- ── What cross-review found, and what it actually was ────────────────────────────────────────
-- Codex rounds 1 and 2 both reported that `transition_task` permits a claimed task with no
-- claimant. That specific claim is FALSE, and it was verified false two different ways: the
-- `tasks_claimed_by_matches_claimed_at` constraint from 20260804100000 survives (only the
-- biconditional on `claimed_at` was replaced), so both a direct INSERT and a
-- `transition_task(..., 'claimed', NULL, ...)` are rejected by the database. No row with an
-- unclaimed claim can exist. Roadmap/LEARNINGS.md: report a finding's severity from what you can
-- reproduce, not from what the reviewer labelled it.
--
-- But running the exact path the finding named surfaced a REAL defect underneath the wrong
-- diagnosis, which is why the finding was worth taking seriously twice: a NULL actor makes the
-- function raise a raw `check constraint` exception. Every other refusal in this function returns a
-- structured `(ok, reason, from_status)` that the caller renders as a sentence — `not_found`,
-- `already_claimed`, `already_terminal`. A constraint violation instead surfaces as an unhandled
-- error the API layer can only turn into a 500.
--
-- That matters more in Sprint 3 than it does today. The connector write tools will pass an
-- AGENT-SUPPLIED actor label, so "the agent sent no name" becomes an ordinary bad request from an
-- outside caller — and answering it with a 500 both misreports whose fault it is and leaks that a
-- database constraint exists. The validation belongs beside the other refusals.

CREATE OR REPLACE FUNCTION transition_task(
  p_task_id          UUID,
  p_project_id       UUID,
  p_to_status        TEXT,
  p_actor            TEXT,
  p_resolution       TEXT,
  p_evidence_pointer TEXT
)
RETURNS TABLE (ok BOOLEAN, reason TEXT, from_status TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_from    TEXT;
  v_updated INT;
  v_actor   TEXT;
BEGIN
  -- Normalized once, up front. A whitespace-only actor is the same as an absent one — storing
  -- '   ' as a claimant satisfies the NOT NULL pairing while telling a human reading the queue
  -- nothing at all, which is the shape of "technically valid, operationally useless" data that a
  -- constraint alone cannot catch.
  v_actor := NULLIF(btrim(COALESCE(p_actor, '')), '');

  SELECT t.status INTO v_from
  FROM tasks t
  WHERE t.id = p_task_id AND t.project_id = p_project_id
  FOR UPDATE;

  IF v_from IS NULL THEN
    RETURN QUERY SELECT FALSE, 'not_found'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_from IN ('resolved', 'dismissed') THEN
    RETURN QUERY SELECT FALSE, 'already_terminal'::TEXT, v_from;
    RETURN;
  END IF;

  IF p_to_status = 'claimed' THEN
    -- The new refusal, in the same shape as its siblings. Checked BEFORE the row is touched, so a
    -- bad request costs nothing and leaves no trace.
    IF v_actor IS NULL THEN
      RETURN QUERY SELECT FALSE, 'actor_required'::TEXT, v_from;
      RETURN;
    END IF;
    IF v_from = 'claimed' THEN
      RETURN QUERY SELECT FALSE, 'already_claimed'::TEXT, v_from;
      RETURN;
    END IF;
    UPDATE tasks
       SET status = 'claimed', claimed_by = v_actor, claimed_at = now(), updated_at = now()
     WHERE id = p_task_id AND project_id = p_project_id;

  ELSIF p_to_status = 'resolved' THEN
    UPDATE tasks
       SET status = 'resolved',
           resolution = COALESCE(p_resolution, 'fixed'),
           evidence_pointer = NULLIF(btrim(COALESCE(p_evidence_pointer, '')), ''),
           resolved_at = now(),
           updated_at = now()
     WHERE id = p_task_id AND project_id = p_project_id;

  ELSIF p_to_status = 'dismissed' THEN
    -- The claim is RETAINED on both terminal paths (20260805090000 made that legal): "who was
    -- working on this when it was dismissed" is the most useful fact about a dismissal.
    UPDATE tasks
       SET status = 'dismissed', resolved_at = now(), updated_at = now()
     WHERE id = p_task_id AND project_id = p_project_id;

  ELSE
    RETURN QUERY SELECT FALSE, 'invalid_status'::TEXT, v_from;
    RETURN;
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN QUERY SELECT (v_updated > 0), CASE WHEN v_updated > 0 THEN 'ok' ELSE 'no_change' END::TEXT, v_from;
END;
$$;

REVOKE ALL ON FUNCTION transition_task(UUID, UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION transition_task(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
