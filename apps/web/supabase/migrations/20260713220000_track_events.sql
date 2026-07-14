-- Growth Engine v1 · Sprint 1, Story 1.1 (Roadmap/01-growth-engine/growth-engine-v1)
-- POST /v1/track's storage: a projects table (tenant + credential) and an events table
-- (tenant-scoped from day one — Decision 8: design multi-tenant, run single).
--
-- RLS ON with NO policies on both tables, mirroring Miyagi's platform_flags pattern
-- (medusa-bonsai apps/miyagisanchez/supabase/migrations/20260701120000_platform_flags.sql):
-- only the service-role key (the ingest route's server-side client) can read/write.
-- The anon key gets zero rows. There is no client-side Supabase usage in this project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── projects ─────────────────────────────────────────────────────────────────
--   slug:         human-readable project identifier (e.g. "miyagisanchez")
--   api_key_hash: sha256 hex digest of the project's API key — the key itself is
--                 never stored; /v1/track hashes the incoming Bearer token and looks
--                 up this column, so a leaked DB dump doesn't leak usable credentials.
CREATE TABLE IF NOT EXISTS projects (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT        NOT NULL UNIQUE,
  api_key_hash  TEXT        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ── events ───────────────────────────────────────────────────────────────────
--   project_id:  resolved server-side from the request's API key — never taken from
--                the request body, so no query path can cross projects even though
--                the column exists on every row (Decision 8).
--   feature_id:  optional — which registered feature (S2's registry) this event is
--                targeted/adopted/retained for. Null for generic events.
--   tags / metadata: extensible jsonb from day one (PRD-G v2 forward-compat — chaos
--                /friction tagging is additive, never a migration).
CREATE TABLE IF NOT EXISTS events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT        NOT NULL,
  event       TEXT        NOT NULL,
  feature_id  TEXT,
  tags        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS events_project_feature_created_idx
  ON events (project_id, feature_id, created_at);
CREATE INDEX IF NOT EXISTS events_project_user_created_idx
  ON events (project_id, user_id, created_at);
