-- Growth Engine v1 · Sprint 1 follow-up — explicit service_role grants on projects/events.
--
-- RLS bypass (BYPASSRLS) and table-level GRANTs are separate Postgres permission axes:
-- a role can bypass RLS entirely and still get "permission denied" without an explicit
-- GRANT. The original migration (20260713220000_track_events.sql) relied on whatever
-- default grants a given Supabase environment happens to bootstrap for service_role —
-- this held for the real hosted production project and for local dev on one CLI
-- version, but a newer local Supabase CLI's docker bootstrap (hit in CI, `supabase/
-- setup-cli@v1` with `version: latest`) does NOT auto-grant service_role table access,
-- producing "permission denied for table projects" (Postgres 42501). Making the grant
-- explicit here removes the dependency on any environment's implicit defaults —
-- idempotent to run again against the already-migrated production project.
GRANT SELECT, INSERT ON TABLE projects TO service_role;
GRANT SELECT, INSERT ON TABLE events TO service_role;
