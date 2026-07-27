-- signals-loop · Sprint 3, Story 3.2 — a confirmation must name its credential.
--
-- Cross-review finding (Codex, PR #38). `task_write_confirmations.agent_key_id` was nullable, and
-- `consume_write_confirmation` compares it with `IS NOT DISTINCT FROM` — which deliberately makes
-- NULL match NULL. Together those mean a confirmation staged without a credential could be consumed
-- by a caller presenting no credential, and the binding this whole design rests on would simply not
-- apply to that row.
--
-- Not reachable through the MCP route: the write tools are not registered unless an agent_write key
-- resolved, so every proposal it stages carries one. But the staging seam is a function, and the
-- next caller of it inherits whatever the database permits — "the route happens to always pass it"
-- is a fact about today's callers, not a property of the data.
--
-- CODE-QUALITY rule 2: make the failure unrepresentable rather than merely absent. A confirmation
-- without a credential is not a state this system has any use for, so the column stops allowing it.
--
-- Safe to apply: the write surface has never been enabled in production, so no rows exist. The
-- guard below turns a surprise into a clear error rather than a partial migration if that is ever
-- untrue in some environment.
DO $$
DECLARE
  v_orphans BIGINT;
BEGIN
  SELECT count(*) INTO v_orphans FROM task_write_confirmations WHERE agent_key_id IS NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'Refusing to add NOT NULL: % confirmation row(s) have no agent_key_id. Delete them (they are '
      'unusable under the binding rule) and re-run.', v_orphans;
  END IF;
END $$;

ALTER TABLE task_write_confirmations ALTER COLUMN agent_key_id SET NOT NULL;

COMMENT ON COLUMN task_write_confirmations.agent_key_id IS
  'The agent_write key that staged this confirmation. NOT NULL: a confirmation is a capability '
  'minted FOR a credential, and consume_write_confirmation binds spending to it, so a row without '
  'one could be spent by a caller presenting none. signals-loop Sprint 3 (cross-review, PR #38).';
