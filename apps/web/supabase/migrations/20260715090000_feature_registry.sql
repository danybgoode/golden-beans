-- Growth Engine v1 · Sprint 2, Story 2.1 (Roadmap/01-growth-engine/growth-engine-v1)
-- The feature registry: seeded by the CLIENT PUSHING its live `platform_flags` rows
-- (POST /v1/features/sync), never from code defaults (those are fail-safe fallbacks
-- and systematically say OFF — see sprint-2.md's Flag-reality rationale).
--
-- `enabled` mirrors the pushed flag's live value — the "registry-declared" Targeted
-- gate Story 2.2 reads. `target_event`/`adopted_event`/`retained_event` are optional:
-- platform_flags rows carry no event-name mapping, so a sync payload MAY set them for
-- a feature it knows the shape of (e.g. `setup_guide`); when unset, aggregation falls
-- back to the sprint doc's literal reading (Targeted/Adopted = any event) rather than
-- inventing a fictional exposure count. RLS ON, no policies — service-role only,
-- mirroring `projects`/`events` (see 20260713220000_track_events.sql).
--
-- GRANT included from the start this time (Sprint 1 needed a follow-up migration for
-- this on a newer local Supabase CLI — see 20260714150000_track_events_grants.sql).

CREATE TABLE IF NOT EXISTS features (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key            TEXT        NOT NULL,
  enabled        BOOLEAN     NOT NULL DEFAULT false,
  target_event   TEXT,
  adopted_event  TEXT,
  retained_event TEXT,
  retention_days INTEGER     NOT NULL DEFAULT 7,
  description    TEXT,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
ALTER TABLE features ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE features TO service_role;
