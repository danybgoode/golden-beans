-- golden-frijoles-cli · Sprint 1, Story 1.2 — the CLI's personal access token.
--
-- The credential that authenticates `gf`. It is the FIRST credential in this system bound to a
-- USER rather than to a project, and that is the whole reason it is not a seventh `api_keys` scope.
--
-- ── Why not a seventh scope on api_keys (epic README, D1) ──────────────────────────────────────
-- CODE-QUALITY.md #1 and both the `agent_write` and share-link migrations say the same thing: reuse
-- the seam, never build a second revoke path. That rule does not reach this case, for a reason
-- checked in the schema rather than assumed:
--
--   api_keys.project_id is NOT NULL (20260720130000_api_keys.sql), and all six existing scopes
--   resolve THROUGH a project — active_ingest_keys, active_share_links, active_agent_write_keys
--   and the two flag-credential RPCs every one of them keys off project_id.
--
-- A CLI token has to answer "which projects does this caller have?" BEFORE a project is known:
-- `gf whoami`, `gf projects ls` and `gf init` in an empty directory all need it. No row in api_keys
-- can express that. Making project_id nullable would weaken the NOT NULL that every one of those
-- six filters leans on — trading a real constraint for a notional reuse.
--
-- The authority question is settled a different way, and it is the important one: this token grants
-- NOTHING the holder's console session does not already grant. Every project-scoped thing the CLI
-- does resolves user_id -> project_members -> owner/member, exactly as lib/dashboard-auth.ts does
-- for a browser session. The token is an authentication shortcut, never an authorization widening.
--
-- ── EXPAND-ONLY, and safe to apply before the code ships ───────────────────────────────────────
-- Nothing existing changes. No row moves. Until apps/web/lib/cli-tokens.ts deploys, nothing reads
-- this table at all, so applying it early is inert — which is why the epic's deploy order applies
-- it BEFORE the PR that reads it merges (merging is the deploy; code reading an unmigrated table
-- breaks at the first request rather than staying quiet).

CREATE TABLE IF NOT EXISTS cli_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE CASCADE: a deleted account's CLI credentials must not outlive it. The api_keys
  -- analogue cascades from projects for the same reason.
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- sha256 hex, through lib/credential-hash.ts — the ONE hash function this system uses, so the
  -- console and the API agree byte-for-byte. The plaintext is shown once and never stored.
  -- UNIQUE for the same reason api_keys.key_hash is: two users must never share a credential.
  token_hash   TEXT        NOT NULL UNIQUE,
  label        TEXT        NOT NULL DEFAULT 'cli',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Credential hygiene, not telemetry: the console lists it so a human deciding whether to revoke
  -- a token can see whether anything is still using it. lib/cli-tokens.ts updates it on resolve.
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

-- The hash format is checked HERE rather than in application code, so a row that could never match
-- a real lookup cannot be written at all. hashCredential() emits lowercase sha256 hex.
ALTER TABLE cli_tokens DROP CONSTRAINT IF EXISTS cli_tokens_hash_format;
ALTER TABLE cli_tokens ADD CONSTRAINT cli_tokens_hash_format
  CHECK (token_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE cli_tokens DROP CONSTRAINT IF EXISTS cli_tokens_label_length;
ALTER TABLE cli_tokens ADD CONSTRAINT cli_tokens_label_length
  CHECK (char_length(label) BETWEEN 1 AND 120);

-- The console's "your CLI tokens" list, newest first.
CREATE INDEX IF NOT EXISTS cli_tokens_user_idx ON cli_tokens(user_id, created_at DESC);
-- The hot path: resolve an ACTIVE token by hash on every `gf` call. Partial, like
-- api_keys_active_hash_idx, so the index stays tight as revoked rows accumulate.
CREATE INDEX IF NOT EXISTS cli_tokens_active_hash_idx ON cli_tokens(token_hash) WHERE revoked_at IS NULL;

ALTER TABLE cli_tokens ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policy exists and none is added: this table is service-role only, like
-- every credential table here. RLS ON with no policies is the deny-all baseline.
REVOKE ALL ON TABLE cli_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE cli_tokens TO service_role;
-- No DELETE. Revocation is `revoked_at`, so a revoked credential stays auditable — the same shape
-- api_keys uses, and the reason share links were never DELETEd either.
REVOKE DELETE, TRUNCATE ON TABLE cli_tokens FROM service_role;

-- ── The resolution view, with revocation AND expiry welded in ──────────────────────────────────
-- lib/cli-tokens.ts selects from this and never from the table, exactly as lib/auth.ts selects from
-- active_ingest_keys and lib/agent-write-keys.ts from active_agent_write_keys. The liveness
-- predicate lives in the database object the hot path queries, so dropping it in application code
-- is not a thing that can be done — there is no predicate in application code to drop.
--
-- Expiry is compared HERE, in database time. active_share_links exists because two credential kinds
-- judged live by two different clocks makes any app-vs-database skew a window in which a dead
-- credential still works.
CREATE OR REPLACE VIEW active_cli_tokens AS
  SELECT
    t.id,
    t.user_id,
    t.label
  FROM cli_tokens t
  WHERE t.revoked_at IS NULL
    AND (t.expires_at IS NULL OR t.expires_at > now());

-- A view in the public schema is exposed by PostgREST like a table, so its grants are the whole
-- access-control story. REVOKE first: CREATE OR REPLACE VIEW re-establishes Postgres' defaults for
-- what it treats as a fresh object (Roadmap/LEARNINGS.md — the same class of surprise as DROP+CREATE
-- silently restoring PUBLIC EXECUTE on a function).
REVOKE ALL ON TABLE active_cli_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE active_cli_tokens TO service_role;

-- ⚠️ **This view IS auto-updatable, and its siblings are not.** active_ingest_keys,
-- active_share_links and active_agent_write_keys all JOIN to projects, and PostgreSQL will not make
-- a multi-table view auto-updatable — which is what made the 20260806100000 migration's identical
-- REVOKE "not currently exploitable". This one selects from a SINGLE table, so that accident of
-- shape does not protect it: without the line below, service_role could INSERT into cli_tokens
-- THROUGH the view, minting a CLI credential for any user id, bypassing lib/cli-tokens.ts entirely.
--
-- Supabase ships ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO service_role in the public
-- schema, so the GRANT SELECT above is purely additive and revokes nothing. The REVOKE two lines
-- above names only PUBLIC, anon and authenticated. This is the line that does the work.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE active_cli_tokens FROM service_role;

COMMENT ON TABLE cli_tokens IS
  'Personal access tokens for the Golden Frijoles CLI (gf). USER-scoped, not project-scoped — the '
  'one credential in this system that must resolve before a project is known. Grants no authority '
  'a console session does not already grant: every project-scoped action re-resolves membership. '
  'golden-frijoles-cli Sprint 1, Story 1.2 (epic README, D1).';

COMMENT ON VIEW active_cli_tokens IS
  'Liveness-filtered CLI token resolution for lib/cli-tokens.ts. Revocation and expiry live HERE, '
  'in database time, so a revoked or expired token cannot be resolved by application code that '
  'forgets to check. Not auto-updatable by grant — see the REVOKE in its migration.';
