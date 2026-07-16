-- commercial-shell · Sprint 2, Story 2.1 (Roadmap/02-commercial/commercial-shell/sprint-2.md)
-- One opaque, revocable, per-project connector token backing the read-only MCP route
-- (POST /api/v1/public/mcp/c/:token). Stored PLAINTEXT deliberately (unlike projects.api_key_hash):
-- the install page must keep re-showing the same URL, and v1 only ever mints a token for the
-- public demo project, so there's no confidentiality property to protect by hashing it — it's a
-- public demo credential, not a private one. Revocation is soft (`revoked_at`) so it can be
-- flipped directly in Supabase Studio for the Story 2.1 smoke test, no deploy required.

CREATE TABLE IF NOT EXISTS connector_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connector_tokens_project_id_idx ON connector_tokens(project_id);
ALTER TABLE connector_tokens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE connector_tokens TO service_role;
