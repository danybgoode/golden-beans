-- multi-tenant-activation · Sprint 1, Story 1.1 (Roadmap/02-commercial/multi-tenant-activation)
-- Links a Supabase Auth user (auth.users) to a project with a role. This join table is what
-- turns "anyone who guesses a slug reads any tenant's data" into "only members see a tenant".
--
-- Same RLS-on / no-policies / service-role-only pattern as projects & events (see
-- 20260713220000_track_events.sql): the app uses the anon key ONLY for the auth session itself
-- (who is logged in), never for DATA reads. Every membership/authorization check runs through the
-- service-role client (apps/web/lib/membership.ts) AFTER the session is resolved server-side. With
-- no policy, the anon/authenticated roles get zero rows; service_role bypasses RLS by design.
--
-- Additive/expand-only: no existing table changes. Memberships for real tenants (Miyagi, the demo
-- project) are hand-seeded — signup-driven membership arrives in Sprint 2 behind SIGNUP_ENABLED.

CREATE TABLE IF NOT EXISTS project_members (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS project_members_project_idx ON project_members(project_id);
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_members TO service_role;
