-- signals-loop · Sprint 3, Story 3.2 — return the acting credential from consume_write_confirmation.
--
-- Cross-review finding (Codex, PR #38, Should-fix #1), and it is the class of defect this repo has
-- the sharpest scar for: **a comment asserting a check the code does not perform.**
--
-- lib/task-write-staging.ts said, above its audit call:
--
--   "What distinguishes an agent write is `via: 'connector'` plus the credential id — so 'who moved
--    this task, human or agent, and under which key?' is answerable from one place."
--
-- The `via` was there. The credential id was not. `task_write_confirmations` stores `agent_key_id`
-- at propose time and this function simply never returned it, so the audit row could not carry what
-- the comment promised — and prose in a diff reads as evidence, so a reviewer who saw that sentence
-- spent their scrutiny elsewhere. Roadmap/LEARNINGS.md, twice over.
--
-- Why it matters operationally: an `agent_write` key is revocable per agent. "This task was closed
-- wrongly — which credential did it, and should I revoke that one or all of them?" is exactly the
-- question the trail exists to answer, and without the key id the honest answer was "some agent".
--
-- ── Adding a column to the RETURNS TABLE forces a DROP ─────────────────────────────────────────
-- PostgreSQL cannot change a function's return type in place, so this is DROP + CREATE. That
-- silently restores the PUBLIC EXECUTE default — the LEARNINGS entry that produced a service-role-
-- only function quietly becoming anon-callable. The REVOKE/GRANT below is therefore not
-- boilerplate; it is the whole reason this migration is written out rather than edited in place.

DROP FUNCTION IF EXISTS consume_write_confirmation(TEXT, UUID);

CREATE FUNCTION consume_write_confirmation(
  p_token_hash TEXT,
  p_project_id UUID
)
RETURNS TABLE (
  ok               BOOLEAN,
  reason           TEXT,
  task_id          UUID,
  action           TEXT,
  actor            TEXT,
  resolution       TEXT,
  evidence_pointer TEXT,
  agent_key_id     UUID
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row      task_write_confirmations%ROWTYPE;
  v_consumed TIMESTAMPTZ;
  v_found    BOOLEAN;
BEGIN
  -- Unchanged from 20260806110000: the UPDATE's WHERE clause IS the gate. `consumed_at IS NULL` is
  -- evaluated by the same statement that sets it, under a row lock, so exactly one concurrent
  -- caller can observe a match. Expiry is compared here, in database time.
  UPDATE task_write_confirmations c
     SET consumed_at = now()
   WHERE c.token_hash = p_token_hash
     AND c.project_id = p_project_id
     AND c.consumed_at IS NULL
     AND c.expires_at > now()
  RETURNING c.* INTO v_row;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, 'ok'::TEXT, v_row.task_id, v_row.action, v_row.actor,
                        v_row.resolution, v_row.evidence_pointer, v_row.agent_key_id;
    RETURN;
  END IF;

  -- Refusal classification, scoped to the SAME project: another tenant's token must be
  -- indistinguishable from an invented one. Advisory only — the UPDATE above already decided.
  SELECT TRUE, c.consumed_at INTO v_found, v_consumed
    FROM task_write_confirmations c
   WHERE c.token_hash = p_token_hash
     AND c.project_id = p_project_id;

  IF NOT COALESCE(v_found, FALSE) THEN
    RETURN QUERY SELECT FALSE, 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::UUID;
  ELSIF v_consumed IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'already_used'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::UUID;
  ELSE
    RETURN QUERY SELECT FALSE, 'expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::UUID;
  END IF;
END;
$$;

-- Not boilerplate — see the header. A DROP discards the previous migration's REVOKEs.
REVOKE ALL ON FUNCTION consume_write_confirmation(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_write_confirmation(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION consume_write_confirmation(TEXT, UUID) IS
  'Atomically spend a single-use write confirmation, returning the acting agent_write key id so the '
  'audit row can name the credential that performed the mutation. The UPDATE''s WHERE clause is the '
  'gate, so two concurrent applies cannot both succeed. signals-loop Sprint 3 (cross-review, PR #38).';
