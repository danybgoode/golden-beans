-- pod-report · Sprint 3, Story 3.1 (Roadmap/02-commercial/pod-report/sprint-3.md)
-- Scoped, revocable share links — as rows in the EXISTING api_keys taxonomy, per the epic's
-- Platform-primitives note: "one taxonomy, not a third system."
--
-- ── Why this is an ALTER and not a new table ──────────────────────────────────────────────────
-- A share link needs exactly what an API key needs: mint once, show the plaintext once, store only
-- a hash, list them, revoke one, audit who did. That lifecycle already exists (lib/api-keys.ts,
-- lib/audit.ts, the dashboard's key screen). A `report_shares` table would have duplicated all of
-- it — a second revoke path, a second audit call, a second list UI — and the second copy is the one
-- that gets forgotten when a leaked credential needs killing at 2am.
--
-- ── The danger this introduces, and the structural answer ─────────────────────────────────────
-- Sharing one table means a share token and an ingest key live in one `key_hash` namespace. A share
-- token travels in a URL: browser history, Referer headers, proxy logs, a screenshot in a
-- Slack thread. An ingest key never does. So if the ingest lookup ever stopped filtering by scope —
-- a refactor, a bad merge, a resolved conflict that kept the wrong side — every share link ever
-- pasted anywhere would become a WRITE credential for that tenant.
--
-- Writing `.eq('scope', 'ingest')` in lib/auth.ts and trusting it to survive is not good enough for
-- that blast radius. So the filter is moved INTO the database object the hot path queries:
-- `active_ingest_keys` is a view with the scope condition baked in, and lib/auth.ts selects from
-- the view. Dropping the filter in application code is no longer a thing that can be done, because
-- there is no filter in application code to drop. (Roadmap/LEARNINGS.md's recurring lesson: make
-- the failure unrepresentable rather than merely fixed.)
--
-- EXPAND-ONLY and safe to apply before the code ships: every existing row defaults to
-- scope='ingest', and the view returns exactly what the current query returns today.

ALTER TABLE api_keys
  -- 'ingest' — a Bearer credential for the write/read API. The default, so every pre-existing row
  --            and every future issueApiKey() call keeps its current meaning with no backfill.
  -- 'share'  — an opaque token in a share-link URL. NEVER valid for the API.
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'ingest',
  -- Which audience lens the token grants. Resolved from THIS COLUMN and never from the URL — the
  -- acceptance criterion "scope enforced server-side (lens comes from the token, never the URL)"
  -- is satisfied by the lens having no other place to come from.
  ADD COLUMN IF NOT EXISTS share_lens TEXT,
  -- Optional expiry. A revoke is a decision someone has to remember to make; an expiry is one they
  -- make once, at mint time, for a link they know is for one meeting.
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_scope_check') THEN
    ALTER TABLE api_keys ADD CONSTRAINT api_keys_scope_check CHECK (scope IN ('ingest', 'share'));
  END IF;

  -- The two columns are not independent facts. A 'share' row without a lens has no audience and
  -- would have to be given a default at read time — which is precisely how an unintended row ends
  -- up rendering the widest view. An 'ingest' row WITH a lens is a row whose author was confused
  -- about which kind of credential they were minting. Both are rejected at the database, so neither
  -- can exist for application code to interpret.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_share_lens_check') THEN
    ALTER TABLE api_keys ADD CONSTRAINT api_keys_share_lens_check CHECK (
      (scope = 'share'  AND share_lens IN ('team', 'client', 'investor'))
      OR
      (scope = 'ingest' AND share_lens IS NULL)
    );
  END IF;
END $$;

-- Listing a project's share links is its own screen; keep it off the ingest hot path's index.
CREATE INDEX IF NOT EXISTS api_keys_share_idx
  ON api_keys(project_id) WHERE scope = 'share' AND revoked_at IS NULL;

-- ── The ingest hot path, with the scope condition welded on ───────────────────────────────────
-- lib/auth.ts selects from this. The join to projects is INNER on purpose: a key whose project has
-- vanished resolves no row and 401s, which is exactly what the route's own orphan branch already
-- did — one behaviour, now expressed once.
--
-- `expires_at` is checked here too. Ingest keys are minted with a NULL expiry so the condition is a
-- no-op for them today; it means an expiring ingest credential is a data decision later, not a
-- migration.
CREATE OR REPLACE VIEW active_ingest_keys AS
  SELECT
    k.id,
    k.project_id,
    k.key_hash,
    p.monthly_event_quota,
    p.ingest_rate_per_min,
    p.created_by,
    p.first_event_at
  FROM api_keys k
  JOIN projects p ON p.id = k.project_id
  WHERE k.scope = 'ingest'
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > now());

-- A view in the public schema is exposed by PostgREST like a table, so its grants are the whole
-- access-control story. Service-role only — the same posture as every other table here, and a
-- REVOKE first because a CREATE OR REPLACE VIEW re-establishes Postgres' defaults for a fresh
-- object (Roadmap/LEARNINGS.md: DROP+CREATE silently restores PUBLIC EXECUTE; the same class of
-- surprise applies to a re-created view's grants).
REVOKE ALL ON TABLE active_ingest_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE active_ingest_keys TO service_role;

COMMENT ON VIEW active_ingest_keys IS
  'Ingest credential resolution for lib/auth.ts. The scope=''ingest'' condition lives HERE, not in '
  'application code, so a share-link token can never authenticate against the API even if a caller '
  'forgets to filter. pod-report Sprint 3, Story 3.1.';
