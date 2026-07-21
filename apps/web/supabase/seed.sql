-- Local/CI-only fixture data — NOT applied to any real project. Two projects so the
-- Playwright `api` spec can assert tenant isolation (a key can only see its own rows).
--
-- Plaintext keys (local dev + CI only, never real credentials):
--   project-one: local-test-key-do-not-use-in-prod
--   project-two: local-test-key-two-do-not-use-in-prod
INSERT INTO projects (slug, api_key_hash) VALUES
  ('project-one', 'b2a48213dbc6bcc579fc927ba2a926e4dc7e6962c2db4a296d47f321ceca9f76'),
  ('project-two', 'f7207a46e314a91a166d20f591c699d175e3e370b42597c5c5630763f6fa7004')
ON CONFLICT (slug) DO NOTHING;

-- multi-tenant-activation Story 1.3: lib/auth.ts now resolves keys from api_keys, and this seed
-- runs AFTER the migration's backfill (which saw zero projects on a fresh DB), so seed the api_keys
-- rows for these fixture projects here too. Idempotent (key_hash is unique).
INSERT INTO api_keys (project_id, key_hash, label)
SELECT id, api_key_hash, 'default (seed)'
FROM projects
WHERE api_key_hash IS NOT NULL
ON CONFLICT (key_hash) DO NOTHING;
