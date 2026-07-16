-- commercial-shell · Sprint 1, Story 1.2 follow-up.
--
-- scripts/seed-demo-project.mjs is the first thing in this codebase to ever UPDATE or DELETE rows
-- in these tables — every prior write path only ever INSERTs (or, for `features`, upserts within
-- its own already-granted UPDATE). The seed script's idempotent-reseed design needs three grants
-- none of the existing migrations cover, each caught by a real CI failure ("permission denied for
-- table <x>", Postgres 42501) rather than assumed upfront:
--   - `projects` UPDATE — provisionProject() upserts the demo project row on `slug` conflict.
--   - `events` DELETE   — resetProjectContent() clears prior synthetic events before reseeding,
--                         so funnel/A-B counts don't double on every re-run.
--   - `features` DELETE — same reset, for the feature-registry row.
-- Same shape as 20260714150000_track_events_grants.sql's own precedent: making the grant
-- explicit, not relying on an environment's implicit defaults.
GRANT UPDATE ON TABLE projects TO service_role;
GRANT DELETE ON TABLE events TO service_role;
GRANT DELETE ON TABLE features TO service_role;
