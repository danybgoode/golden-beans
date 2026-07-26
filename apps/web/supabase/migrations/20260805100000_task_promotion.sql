-- signals-loop · Sprint 2, Story 2.1 (Roadmap/01-growth-engine/signals-loop/sprint-2.md)
-- Signal → task promotion: the thresholds as data, and the ONE atomic promotion path.
--
-- EXPAND-only. `signals` and `tasks` are unchanged; this adds the per-project override table and
-- the function that turns a qualifying signal into exactly one task.

CREATE SCHEMA IF NOT EXISTS private;

-- ══ task_promotion_rules ══════════════════════════════════════════════════════════════════════
-- Per-project overrides. No row = the conservative defaults in lib/task-promotion.ts.
--
-- One row per project, not per rule: promotion is a single decision with three inputs, unlike
-- friction where each detector is independently tunable and independently disable-able.

CREATE TABLE IF NOT EXISTS task_promotion_rules (
  project_id         UUID        PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  min_users_affected INTEGER     NOT NULL CHECK (min_users_affected >= 1),
  min_event_count    INTEGER     NOT NULL CHECK (min_event_count >= 1),
  min_impact_score   INTEGER     NOT NULL CHECK (min_impact_score >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE task_promotion_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE task_promotion_rules FROM PUBLIC, anon, authenticated;
-- Configuration, not evidence — so DELETE stays (removing an override falls back to the defaults).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE task_promotion_rules TO service_role;

-- ══ promote_signal_to_task ════════════════════════════════════════════════════════════════════
-- Turn a qualifying signal into AT MOST ONE open task, and report what happened.
--
-- ── Why the whole decision lives in SQL and not in the calling TypeScript ────────────────────
-- The naive shape is: SELECT the signal, decide in Node, INSERT a task. That is check-then-act, and
-- two concurrent ingests of the same crash both pass the check and both insert. The partial unique
-- index (`tasks_one_active_per_signal`, Sprint 1) makes the second INSERT fail rather than
-- duplicate — which is the important half — but the caller then has to distinguish "lost a benign
-- race" from "real error", and getting that wrong means either a spurious 500 or a swallowed fault.
--
-- Doing it in one statement with ON CONFLICT DO NOTHING removes the question: the loser writes
-- nothing, learns it wrote nothing, and both callers see a consistent, correct answer. Same
-- reasoning as record_signal's upsert one migration earlier.

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
  -- The tenant scope is re-asserted in the WHERE clause rather than trusted from the caller's
  -- p_project_id alone. A signal id is a UUID someone could hold from another context; pairing it
  -- with the project means a mismatched pair inserts nothing instead of creating project A's task
  -- from project B's signal (Roadmap/LEARNINGS.md — the cross-tenant bind class).
  INSERT INTO tasks (project_id, signal_id, title, evidence, impact_rank, status)
  SELECT s.project_id, s.id, p_title, COALESCE(p_evidence, '{}'::JSONB), COALESCE(p_impact_rank, 0), 'open'
  FROM signals s
  WHERE s.id = p_signal_id
    AND s.project_id = p_project_id
  -- Names the INDEX, not a column list: the constraint is PARTIAL (`WHERE status IN
  -- ('open','claimed')`), and a bare `ON CONFLICT (signal_id)` cannot match a partial index —
  -- Postgres rejects it outright. This is the same shape as the ON CONSTRAINT fix in
  -- record_signal, and the same lesson: the conflict target has to name the real object.
  ON CONFLICT (signal_id) WHERE status IN ('open', 'claimed') DO NOTHING
  RETURNING tasks.id INTO v_task_id;

  IF v_task_id IS NOT NULL THEN
    RETURN QUERY SELECT v_task_id, TRUE;
    RETURN;
  END IF;

  -- Nothing inserted. Either an active task already exists (the ordinary "absorb" path — the
  -- acceptance criterion "an open task absorbs new matching signals"), or the signal/project pair
  -- did not resolve. Distinguish them: the caller must not treat a bad pair as a successful absorb.
  SELECT t.id INTO v_task_id
  FROM tasks t
  WHERE t.signal_id = p_signal_id
    AND t.project_id = p_project_id
    AND t.status IN ('open', 'claimed')
  LIMIT 1;

  RETURN QUERY SELECT v_task_id, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION promote_signal_to_task(UUID, UUID, TEXT, JSONB, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION promote_signal_to_task(UUID, UUID, TEXT, JSONB, NUMERIC) TO service_role;

-- ══ transition_task ═══════════════════════════════════════════════════════════════════════════
-- The ONE path that changes a task's status. Claim, resolve, dismiss.
--
-- Sprint 3's connector write tools call this, and so does the dashboard — one function, so the
-- lifecycle rules cannot drift between the surface a human uses and the surface an agent uses.

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
BEGIN
  -- FOR UPDATE, taken as its own statement before anything is decided. Roadmap/LEARNINGS.md:
  -- `UPDATE … FROM other_table` does not lock the joined rows, and a liveness check written as a
  -- join reads a snapshot that a concurrent writer can invalidate underneath it. Two agents racing
  -- to claim the same task is the exact scenario this function exists to arbitrate.
  SELECT t.status INTO v_from
  FROM tasks t
  WHERE t.id = p_task_id AND t.project_id = p_project_id
  FOR UPDATE;

  IF v_from IS NULL THEN
    -- Same answer for "no such task" and "not your task" — no existence oracle, matching the
    -- house pattern for every other tenant-scoped surface in this codebase.
    RETURN QUERY SELECT FALSE, 'not_found'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- Terminal states are terminal. Re-opening a resolved task would silently rewrite history a
  -- resolution claim already rests on; a recurrence gets a FRESH task (the partial unique index
  -- permits exactly that), which keeps each claim attached to the evidence it was made against.
  IF v_from IN ('resolved', 'dismissed') THEN
    RETURN QUERY SELECT FALSE, 'already_terminal'::TEXT, v_from;
    RETURN;
  END IF;

  IF p_to_status = 'claimed' THEN
    IF v_from = 'claimed' THEN
      -- Already claimed, by someone. Refused rather than silently re-assigned: "who is working on
      -- this?" must not have two answers, and an agent that thinks it holds a task nobody gave it
      -- will duplicate work at best.
      RETURN QUERY SELECT FALSE, 'already_claimed'::TEXT, v_from;
      RETURN;
    END IF;
    UPDATE tasks
       SET status = 'claimed', claimed_by = p_actor, claimed_at = now(), updated_at = now()
     WHERE id = p_task_id AND project_id = p_project_id;

  ELSIF p_to_status = 'resolved' THEN
    UPDATE tasks
       SET status = 'resolved',
           resolution = COALESCE(p_resolution, 'fixed'),
           -- NULLIF so an empty string is stored as NULL rather than as an "evidence pointer" that
           -- points at nothing. pod-report's rule, one layer in: a claim with no RESOLVABLE pointer
           -- is recorded as unevidenced, never quietly as evidenced.
           evidence_pointer = NULLIF(btrim(COALESCE(p_evidence_pointer, '')), ''),
           resolved_at = now(),
           updated_at = now()
     WHERE id = p_task_id AND project_id = p_project_id;

  ELSIF p_to_status = 'dismissed' THEN
    UPDATE tasks
       SET status = 'dismissed', resolved_at = now(), updated_at = now()
           -- The claim is deliberately RETAINED, not cleared. An earlier draft nulled it to satisfy
           -- the biconditional CHECK that 20260805090000 has since corrected — which is the tell
           -- for a workaround: the code was contorting to fit a constraint that was itself wrong,
           -- and the contortion quietly discarded "who was working on this when it was dismissed",
           -- the single most useful fact about a dismissal.
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

COMMENT ON FUNCTION promote_signal_to_task(UUID, UUID, TEXT, JSONB, NUMERIC) IS
  'Promotes a signal to AT MOST ONE active task, atomically. Returns created=false with the existing '
  'task id when one is already open (the absorb path), or a NULL id when the signal/project pair does '
  'not resolve. signals-loop Sprint 2, Story 2.1.';
COMMENT ON FUNCTION transition_task(UUID, UUID, TEXT, TEXT, TEXT, TEXT) IS
  'The ONE status-change path for a task — used by both the dashboard and the connector write tools, '
  'so lifecycle rules cannot drift between the human and agent surfaces. Locks the row with FOR '
  'UPDATE before deciding. signals-loop Sprint 2, Story 2.1.';
