-- multi-tenant-activation · Sprint 1, Story 1.3 (Roadmap/02-commercial/multi-tenant-activation)
-- API keys as first-class, revocable rows: a leaked key becomes a row-update (revoked_at), not a
-- migration. Many keys per project (rotation overlap), replacing the single unrotatable
-- projects.api_key_hash column.
--
--   key_hash: sha256 hex of the key — the plaintext is shown ONCE at issue time and never stored
--             (same non-reversible property as the legacy projects.api_key_hash it supersedes).
--   label:    human name for the key ("default", "ci", "rotated 2026-07") shown in the dashboard.
--
-- EXPAND-ONLY: projects.api_key_hash is deliberately NOT dropped here. A data backfill copies each
-- project's existing hash into an api_keys row so every currently-valid key keeps working, and
-- resolveProjectFromAuthHeader (apps/web/lib/auth.ts) reads api_keys going forward. The old column
-- retires in a later contract-phase migration once nothing reads it — so this migration is safe to
-- apply BEFORE the code that reads api_keys deploys (the reverse order would 500 ingest).

CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_hash    TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL DEFAULT 'default',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS api_keys_project_idx ON api_keys(project_id);
-- Hot path: resolve an ACTIVE key by hash on every ingest call. Partial index keeps it tight.
CREATE INDEX IF NOT EXISTS api_keys_active_hash_idx ON api_keys(key_hash) WHERE revoked_at IS NULL;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE api_keys TO service_role;

-- Backfill: every existing project's single api_key_hash becomes its first api_keys row, so no
-- currently-valid key stops working the moment auth.ts switches to reading api_keys. Idempotent
-- (ON CONFLICT) so re-running the migration set — or applying it after a partial run — is safe.
-- The IS NOT NULL guard is a cheap safeguard (cross-review, Gemini/Agy 2026-07-20): api_keys.key_hash
-- is NOT NULL, so a single legacy ghost row with a null hash would abort the whole migration.
INSERT INTO api_keys (project_id, key_hash, label)
SELECT id, api_key_hash, 'default (migrated)'
FROM projects
WHERE api_key_hash IS NOT NULL
ON CONFLICT (key_hash) DO NOTHING;
