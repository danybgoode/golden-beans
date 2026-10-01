-- workspaces · Sprint 1, Stories 1.1 + 1.2 (Roadmap/02-commercial/workspaces — the Architecture lock, D2–D4).
--
-- The WORKSPACE becomes the tenant: one row above `projects`, so one person can hold several products and later
-- features (the portfolio view, the workspace-wide board) have exactly one legal place to read across them.
-- AGENTS.md states the invariant at workspace level in the same change.
--
-- EXPAND only. `projects.workspace_id` is born NULLABLE and nothing reads it yet. NOT NULL is migration B, applied
-- after the code that WRITES the column (lib/provisioning.ts) has deployed — signup is live, so a NOT NULL that
-- landed first would fail every signup in the gap (lock D4).
--
-- Same RLS-on / no-policies / service-role-only shape as project_members (20260720120000).

-- ── the tenant row ───────────────────────────────────────────────────────────────────────────────────────────────
--   created_by: NULLABLE, ON DELETE SET NULL — the same as projects.created_by. Deleting an account must never delete
--               a tenant out from under its other members, and seed/fixture workspaces have no auth user at all.
CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One workspace per creator, enforced by the DATABASE. lib/workspace-tenancy.ts reads-then-inserts with no
-- transaction between (supabase-js speaks REST), so a double-clicked confirmation link could otherwise mint two
-- tenants for one person. The loser of the race gets 23505 naming this index and re-reads the winner's row — the
-- same shape as projects_one_per_creator_idx (20260721100000). Both sides name it; rename one, rename both.
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_one_per_creator_idx
  ON workspaces(created_by) WHERE created_by IS NOT NULL;

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- ── who belongs to the tenant ────────────────────────────────────────────────────────────────────────────────────
-- ⚠️ `role` gates workspace ADMINISTRATION only, and in v1 nothing reads it for project access (LEARNINGS: a role
-- column is not an access rule — grep for who actually reads it). Project access is still `project_members` (access
-- model A, lock D1); membership HERE is the boundary a project must sit inside, never a grant to open it.
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id);
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- ── every project lives in exactly one tenant ────────────────────────────────────────────────────────────────────
-- ON DELETE RESTRICT: a tenant that still holds projects cannot be deleted, so a cleanup path that deletes "its"
-- workspace can never take another request's project with it (lib/workspace-tenancy.ts → releaseWorkspace).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects(workspace_id);

-- Supabase's default privileges grant every new public table to anon and authenticated. RLS with no policy already
-- returns them zero rows; the REVOKE makes it a refusal instead, which is what e2e/workspaces.spec.ts asserts.
REVOKE ALL ON TABLE workspaces, workspace_members FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workspaces, workspace_members TO service_role;

-- ── the backfill rule (lock D3) — ONE place, this function ───────────────────────────────────────────────────────
-- For each project with no workspace, the person whose tenant it joins is, in order:
--   1. its `created_by` (a self-serve project);
--   2. else its EARLIEST owner — ORDER BY created_at, user_id, so a two-owner project lands in one workspace,
--      deterministically, never two;
--   3. else NOBODY, and the call ABORTS. The groomed plan invented a "platform" workspace owned by a hardcoded user
--      for this branch; production had 0 such projects at the lock, and a fresh database has 0 projects of any kind
--      when migrations run (seed.sql runs after them), so the branch only ever fires on data that needs a human.
-- One workspace per person ("<display name>'s products", else the email's local part), reused across their projects.
--
-- Then EVERY member of the project becomes a member of its workspace — `owner` for the person above, `member` for
-- the rest. Without this, the seam re-check (Sprint 2, lock D9) would lock out any non-owner project member, and
-- "nobody gains or loses access" would be false.
--
-- `p_project_ids` scopes a call to named projects: the migration passes NULL (all of them), and the spec passes its
-- own fixtures so it never assigns — or aborts on — a project another spec inserted concurrently.
--
-- Not a scheduler exemption (AGENTS.md): no request path calls it, it returns nothing, and migration B drops it.
--
-- SECURITY DEFINER because naming a workspace reads auth.users, which service_role cannot. The migration's own call
-- runs as the owner anyway; DEFINER makes the spec's call run with those SAME privileges rather than different ones.
-- The search_path is pinned so a definer function cannot be steered by a caller's schema, and EXECUTE is revoked
-- from everyone but service_role below.
CREATE OR REPLACE FUNCTION public.backfill_project_workspaces(p_project_ids UUID[] DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  candidate RECORD;
  tenant_user UUID;
  tenant_id UUID;
  tenant_name TEXT;
BEGIN
  -- Serialise concurrent calls: two would otherwise both see "no workspace for this person" and race the index.
  PERFORM pg_advisory_xact_lock(hashtext('public.backfill_project_workspaces'));

  FOR candidate IN
    SELECT p.id, p.slug, p.created_by,
           (SELECT m.user_id FROM project_members m
             WHERE m.project_id = p.id AND m.role = 'owner'
             ORDER BY m.created_at, m.user_id
             LIMIT 1) AS first_owner
      FROM projects p
     WHERE p.workspace_id IS NULL
       AND (p_project_ids IS NULL OR p.id = ANY (p_project_ids))
     ORDER BY p.created_at, p.id
  LOOP
    tenant_user := COALESCE(candidate.created_by, candidate.first_owner);
    IF tenant_user IS NULL THEN
      RAISE EXCEPTION 'project % has no creator and no owner, so it has no workspace to join', candidate.slug
        USING ERRCODE = 'P0001';
    END IF;

    SELECT w.id INTO tenant_id FROM workspaces w WHERE w.created_by = tenant_user;
    IF tenant_id IS NULL THEN
      SELECT COALESCE(
               NULLIF(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
               NULLIF(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
               NULLIF(btrim(u.raw_user_meta_data ->> 'name'), ''),
               NULLIF(split_part(u.email, '@', 1), ''),
               'My'
             )
        INTO tenant_name
        FROM auth.users u WHERE u.id = tenant_user;
      INSERT INTO workspaces (name, created_by)
        VALUES (left(COALESCE(tenant_name, 'My'), 100) || '''s products', tenant_user)
        RETURNING id INTO tenant_id;
    END IF;

    UPDATE projects SET workspace_id = tenant_id WHERE id = candidate.id;

    INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (tenant_id, tenant_user, 'owner')
      ON CONFLICT (workspace_id, user_id) DO NOTHING;
    INSERT INTO workspace_members (workspace_id, user_id, role)
      SELECT tenant_id, m.user_id, 'member' FROM project_members m WHERE m.project_id = candidate.id
      ON CONFLICT (workspace_id, user_id) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_project_workspaces(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_project_workspaces(UUID[]) TO service_role;

SELECT public.backfill_project_workspaces(NULL);
