-- commercial-shell · Sprint 1, Story 1.3 (Roadmap/02-commercial/commercial-shell/sprint-1.md)
-- The public waitlist: email -> a row here, via POST /v1/public/waitlist. Written only by that
-- service-role route (never client-side Supabase) — RLS ON, no policies, GRANT included from the
-- start, mirroring the projects/events/features/north_star_metrics convention.
--
-- Dedupe-safe by construction: `email` is UNIQUE, and the route upserts with
-- `ignoreDuplicates: true` — a repeat signup is a silent no-op, never a duplicate row or an error.

CREATE TABLE IF NOT EXISTS waitlist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON TABLE waitlist TO service_role;
