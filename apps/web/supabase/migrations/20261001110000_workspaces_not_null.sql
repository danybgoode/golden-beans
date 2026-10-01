-- workspaces · Sprint 2, head commit (Roadmap/02-commercial/workspaces — the Architecture lock, D4, D11, D13).
--
-- CONTRACT. Applied after Sprint 1's provisioning (which writes `projects.workspace_id`) is live, and before any code
-- that READS the column merges — the order lock D4 fixes because signup is live.

-- ── stragglers ───────────────────────────────────────────────────────────────────────────────────────────────────
-- A signup confirmed between migration A and Sprint 1's deploy was provisioned by the OLD code, so its project has
-- no workspace. The same rule, one more time, for exactly those rows. A project nobody can own still ABORTS here.
SELECT public.backfill_project_workspaces(NULL);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.projects WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'projects without a workspace remain after the backfill; NOT NULL would fail';
  END IF;
END
$$;

ALTER TABLE public.projects ALTER COLUMN workspace_id SET NOT NULL;

-- The backfill has done its one job. A function that can write every tenant's workspace has no reason to outlive it.
DROP FUNCTION public.backfill_project_workspaces(UUID[]);

-- ── a project member is always inside the project's workspace (lock D13) ─────────────────────────────────────────
-- Sprint 2's seam re-check (lib/membership.ts) denies a project whose workspace is not one of the caller's. Under
-- access model A that must never take access away from someone `project_members` grants it to — so whatever writes a
-- project membership also places that person inside the boundary, here, rather than every writer remembering to.
-- It grants NOTHING on its own: workspace membership opens no project (lock D1). `member`, never `owner`: the role
-- gates workspace administration only, and only provisioning makes an owner.
--
-- What the re-check still defends is the state this trigger cannot produce: a workspace membership REMOVED while
-- project memberships inside it remain. The workspace is the outer boundary; removing someone from it cuts them off
-- from everything inside.

-- The trigger covers every FUTURE grant. Every EXISTING one is placed inside its workspace here, by construction —
-- so the Sprint 2 re-check can never lock out a member whose row predates this migration (fresh reviewer, PR #221).
-- Production measured 0 such rows on 2026-10-01, before applying; on any database where that is not true, this is the fix.
INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT p.workspace_id, m.user_id, 'member'
    FROM public.project_members m
    JOIN public.projects p ON p.id = m.project_id
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.join_project_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
    SELECT p.workspace_id, NEW.user_id, 'member' FROM public.projects p WHERE p.id = NEW.project_id
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.join_project_workspace() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS project_members_join_workspace ON public.project_members;
CREATE TRIGGER project_members_join_workspace
  AFTER INSERT ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.join_project_workspace();
