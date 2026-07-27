-- signals-loop · Sprint 3, Story 3.2 — bind the confirmation to its credential INSIDE the consume.
--
-- Cross-review finding (Codex, PR #38, round 4 Blocking), on the fix that round 3 added and round 4
-- corrected. The binding was right; its PLACEMENT was not.
--
-- ── The bug: a valid same-project key could burn someone else's confirmation ──────────────────
-- The check lived in application code, AFTER `consume_write_confirmation` had already set
-- `consumed_at`. So key B presenting key A's token: the RPC consumed it, the app then noticed the
-- mismatch and returned `wrong_credential` — and key A, the legitimate proposer, could no longer
-- apply. The token was single-use and had been used by the wrong caller to accomplish nothing.
--
-- That is a denial-of-service by any credential in the same project, and it is worse than the
-- original defect it was fixing.
--
-- The previous migration's own comment argued that burning a token on a failed apply is correct
-- ("the alternative is a token that survives a failed apply and can be retried by yet another
-- credential"). That reasoning holds for a LIFECYCLE refusal — the task moved, the proposal is
-- genuinely stale. It does not hold for an authorization refusal, where the proposal is still
-- perfectly valid and simply was not presented by its owner. One sentence covering two cases that
-- needed opposite handling.
--
-- ── The fix: the credential joins the atomic gate ─────────────────────────────────────────────
-- `agent_key_id` moves into the UPDATE's WHERE clause, beside project, expiry and unspent-ness. A
-- mismatched key now matches no row, so it consumes nothing and the owner's token stays spendable.
-- The same reason the project check lives there: an authorization condition evaluated after the
-- state change has already happened is not an authorization condition.
--
-- `IS NOT DISTINCT FROM` rather than `=`, so a NULL-to-NULL comparison matches instead of yielding
-- NULL and silently failing the whole predicate — the three-valued-logic trap this repo has a
-- migration dedicated to (20260803130000).

DROP FUNCTION IF EXISTS consume_write_confirmation(TEXT, UUID);

CREATE FUNCTION consume_write_confirmation(
  p_token_hash   TEXT,
  p_project_id   UUID,
  p_agent_key_id UUID
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
  v_keyid    UUID;
  v_found    BOOLEAN;
BEGIN
  -- The UPDATE's WHERE clause IS the gate: unspent-ness, expiry, project AND now credential are all
  -- evaluated by the same statement that sets `consumed_at`, under a row lock. Exactly one caller
  -- can observe a match, and a caller who does not match consumes nothing.
  UPDATE task_write_confirmations c
     SET consumed_at = now()
   WHERE c.token_hash = p_token_hash
     AND c.project_id = p_project_id
     AND c.agent_key_id IS NOT DISTINCT FROM p_agent_key_id
     AND c.consumed_at IS NULL
     AND c.expires_at > now()
  RETURNING c.* INTO v_row;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, 'ok'::TEXT, v_row.task_id, v_row.action, v_row.actor,
                        v_row.resolution, v_row.evidence_pointer, v_row.agent_key_id;
    RETURN;
  END IF;

  -- Classify the refusal, scoped to the caller's project so another tenant's token stays
  -- indistinguishable from an invented one. Advisory only: the UPDATE above already decided.
  SELECT TRUE, c.consumed_at, c.agent_key_id INTO v_found, v_consumed, v_keyid
    FROM task_write_confirmations c
   WHERE c.token_hash = p_token_hash
     AND c.project_id = p_project_id;

  IF NOT COALESCE(v_found, FALSE) THEN
    RETURN QUERY SELECT FALSE, 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::UUID;
  ELSIF v_consumed IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'already_used'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::UUID;
  ELSIF v_keyid IS DISTINCT FROM p_agent_key_id THEN
    -- Live, unexpired, and simply not this caller's. Reported distinctly because both credentials
    -- belong to the same project — the caller already proved that — so there is no cross-tenant
    -- oracle here, and "you are using the wrong key" is the one message that lets an agent recover.
    RETURN QUERY SELECT FALSE, 'wrong_credential'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::UUID;
  ELSE
    RETURN QUERY SELECT FALSE, 'expired'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::UUID;
  END IF;
END;
$$;

-- A DROP discards the previous migration's REVOKEs and restores PostgreSQL's PUBLIC EXECUTE
-- default. Re-stated every time, never assumed (Roadmap/LEARNINGS.md).
REVOKE ALL ON FUNCTION consume_write_confirmation(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_write_confirmation(TEXT, UUID, UUID) TO service_role;

COMMENT ON FUNCTION consume_write_confirmation(TEXT, UUID, UUID) IS
  'Atomically spend a single-use write confirmation. Unspent-ness, expiry, project AND the acting '
  'agent_write key are all in the UPDATE''s WHERE clause, so a caller presenting someone else''s '
  'token consumes nothing and the owner''s token stays spendable. signals-loop Sprint 3 (PR #38).';
