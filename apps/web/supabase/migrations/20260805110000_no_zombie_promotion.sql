-- signals-loop · Sprint 2 — stop a resolved task from rising from the dead.
--
-- ── The bug, which was severe and which I shipped ────────────────────────────────────────────
-- `tasks_one_active_per_signal` is a PARTIAL unique index: `WHERE status IN ('open','claimed')`.
-- That is correct and deliberate — it is what lets a problem that RECURS get a fresh task with its
-- own history, rather than reopening one whose resolution was already claimed.
--
-- But promotion had no other condition. So the moment a task went terminal the index stopped
-- covering it, the underlying signal still cleared its thresholds (its counts do not decrease), and
-- the very next queue read created a brand-new open task for it. Resolve a task, refresh, it is
-- back. Resolve it again, refresh again, back again — one new row per read, forever.
--
-- Confirmed against a real database before fixing: resolving and re-promoting the same untouched
-- signal produced `created = t` every time. Found by cross-review (Codex round 1); the migration
-- comment one file earlier had described the intended behaviour ("a problem that comes back gets a
-- fresh task") accurately, and nothing enforced the "comes back" half.
--
-- ── The missing concept: RECURRENCE ──────────────────────────────────────────────────────────
-- A signal deserves a new task only if it has been seen AGAIN since the last one was closed.
-- `signals.last_seen_at` is exactly that watermark, and `record_signal` already advances it
-- (monotonically, with a GREATEST, and clamped against clock skew) on every occurrence. So the
-- condition is a comparison, not a new column and not a new counter to keep in sync:
--
--     promote  ⟺  no ACTIVE task for this signal
--                 AND (no terminal task exists  OR  last_seen_at > that task's resolved_at)
--
-- A resolved problem stays resolved while it stays quiet. The instant it happens again, the next
-- read opens a fresh task — which is the behaviour the epic documented all along.

CREATE OR REPLACE FUNCTION promote_signal_to_task(
  p_signal_id   UUID,
  p_project_id  UUID,
  p_title       TEXT,
  p_evidence    JSONB,
  p_impact_rank NUMERIC
)
RETURNS TABLE (task_id UUID, created BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_task_id UUID;
BEGIN
  INSERT INTO tasks (project_id, signal_id, title, evidence, impact_rank, status)
  SELECT s.project_id, s.id, p_title, COALESCE(p_evidence, '{}'::JSONB), COALESCE(p_impact_rank, 0), 'open'
  FROM signals s
  WHERE s.id = p_signal_id
    AND s.project_id = p_project_id
    -- ── The recurrence gate ─────────────────────────────────────────────────────────────────
    -- NOT EXISTS a terminal task closed at or after this signal was last seen. Read the other way:
    -- if the newest closure happened AFTER the last occurrence, the problem has been quiet since
    -- someone dealt with it, and re-raising it would be the zombie bug.
    --
    -- `>=` rather than `>` on the timestamp comparison is deliberate: resolving a task in the same
    -- instant an occurrence lands should count as "handled", not immediately re-open. The tie goes
    -- to staying closed, because the opposite tie produces a task nobody asked for.
    AND NOT EXISTS (
      SELECT 1
      FROM tasks t
      WHERE t.signal_id = s.id
        AND t.project_id = s.project_id
        AND t.status IN ('resolved', 'dismissed')
        AND t.resolved_at >= s.last_seen_at
    )
  ON CONFLICT (signal_id) WHERE status IN ('open', 'claimed') DO NOTHING
  RETURNING tasks.id INTO v_task_id;

  IF v_task_id IS NOT NULL THEN
    RETURN QUERY SELECT v_task_id, TRUE;
    RETURN;
  END IF;

  -- Nothing inserted. Three reasons now, not two: an active task already exists (the ordinary
  -- absorb path), the signal is quiet since its last closure (the new gate), or the pair did not
  -- resolve. The first still returns the existing task id so a caller can point at it; the other
  -- two return NULL, which the caller already treats as "nothing to do".
  SELECT t.id INTO v_task_id
  FROM tasks t
  WHERE t.signal_id = p_signal_id
    AND t.project_id = p_project_id
    AND t.status IN ('open', 'claimed')
  LIMIT 1;

  RETURN QUERY SELECT v_task_id, FALSE;
END;
$$;

-- Roadmap/LEARNINGS.md: CREATE OR REPLACE on a function whose signature is unchanged keeps its
-- grants, but re-REVOKE unconditionally anyway — a future edit that DOES change the signature turns
-- this into a DROP+CREATE, which silently restores Postgres' PUBLIC EXECUTE default. The habit is
-- what makes that impossible to forget, not the specific case.
REVOKE ALL ON FUNCTION promote_signal_to_task(UUID, UUID, TEXT, JSONB, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION promote_signal_to_task(UUID, UUID, TEXT, JSONB, NUMERIC) TO service_role;

COMMENT ON FUNCTION promote_signal_to_task(UUID, UUID, TEXT, JSONB, NUMERIC) IS
  'Promotes a signal to AT MOST ONE active task. Will not re-raise a signal that has been quiet '
  'since its last task was resolved or dismissed — a RECURRENCE (last_seen_at moving past that '
  'closure) is what earns a fresh task. signals-loop Sprint 2.';
