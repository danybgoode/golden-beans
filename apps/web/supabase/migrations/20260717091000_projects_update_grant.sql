-- commercial-shell · Sprint 1, Story 1.2 follow-up.
--
-- scripts/seed-demo-project.mjs upserts the demo project row on `slug` conflict
-- (`ON CONFLICT (slug) DO UPDATE`), so re-running the seed script idempotently is the first thing
-- in this codebase to ever UPDATE a `projects` row — every prior write path only ever INSERTs
-- once. The existing grant (20260714150000_track_events_grants.sql) only covers SELECT, INSERT,
-- so the upsert's UPDATE branch fails with "permission denied for table projects" (Postgres
-- 42501) the moment a re-seed actually hits the conflict path. Same shape as that migration's own
-- precedent: making the grant explicit, not relying on an environment's implicit defaults.
GRANT UPDATE ON TABLE projects TO service_role;
