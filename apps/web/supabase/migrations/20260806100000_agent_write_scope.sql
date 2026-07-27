-- signals-loop · Sprint 3, Story 3.1 — the `agent_write` credential scope.
--
-- The third scope in the api_keys taxonomy, and the one that authorizes the engine's FIRST public
-- mutation surface (Sprint 3, Story 3.2's staged write tools).
--
-- ── Why the connector token cannot do this job (epic README, Amendment 2) ──────────────────────
-- The seed's plan was "write tools ride the connector, on scoped credentials." That is now unsafe,
-- for a reason that did not exist when the seed was written: `connector_tokens` are stored in
-- PLAINTEXT by design and are deliberately re-displayed on the public `/install` page
-- (lib/connector-tokens.ts: "the value is meant to be openly re-displayed on the public install
-- page, not kept secret"). The 20260803100000 migration then wrote down, at length, why a URL-borne
-- credential must never authenticate a mutation: it travels through browser history, Referer
-- headers, proxy logs and screenshots. Adding writes to that token would hand a mutation credential
-- to everything that has ever seen an install page.
--
-- So a write needs TWO credentials that must AGREE:
--   • `gb_connector_…` in the MCP URL path  — identifies the project, authorizes reads (unchanged)
--   • `gb_key_…` with scope='agent_write' in an Authorization: Bearer header — authorizes the write
-- Both must resolve, and both must resolve to the SAME project_id, or the write tools are not
-- registered at all. Three independent kill switches result (the flag, revoke the connector token,
-- revoke the write key) — one more than AGENTS rule #3 requires, which is proportionate for a first
-- mutation surface.
--
-- ── Why a scope on api_keys and not a new table ────────────────────────────────────────────────
-- Same argument the share-link migration made and which has now held twice: a write key needs
-- exactly what an ingest key needs — mint once, show the plaintext once, store only a hash, list,
-- revoke, audit. That lifecycle exists. A fourth table would duplicate the revoke path, and the
-- duplicate is the one that gets forgotten when a leaked credential needs killing at 2am.
--
-- EXPAND-ONLY and safe to apply before the code ships: no existing row changes scope, and nothing
-- reads the new view until lib/agent-write-keys.ts does.

-- ── 1. Admit the new scope ──────────────────────────────────────────────────────────────────────
-- Dropped and recreated rather than added to, because a CHECK constraint cannot be extended in
-- place. The rewrite is the whole constraint, so the two existing scopes are restated here and any
-- future reader sees the complete set in one statement rather than reconstructing it from three
-- migrations.
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_scope_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_scope_check
  CHECK (scope IN ('ingest', 'share', 'agent_write'));

-- ── 2. The lens rule has to learn about the new scope, or it silently forbids it ────────────────
-- This is the trap in this migration, and it would have been a self-inflicted outage rather than a
-- vulnerability. The existing constraint reads:
--
--   CHECK ( ((scope='share' AND share_lens IN (...)) OR (scope='ingest' AND share_lens IS NULL))
--           IS TRUE )
--
-- For scope='agent_write' BOTH arms are FALSE, so the composite is FALSE, so `IS TRUE` rejects the
-- row. Step 1 above would have admitted the scope to one constraint while a second one still made
-- every such row unwritable — and the failure would have arrived at the first mint, not here.
--
-- The `IS TRUE` wrapper is retained and is not decoration: 20260803130000 exists because the
-- unwrapped version evaluated to NULL for a lensless share row, and PostgreSQL ACCEPTS a CHECK that
-- evaluates to NULL — only an explicit FALSE rejects. Adding a third arm to a three-valued predicate
-- without the wrapper would have reopened exactly that hole.
--
-- An agent_write row carries NO lens, for the same reason an ingest key carries none: a lens is an
-- audience for a read. A write credential has no audience — it has a project and a scope.
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_share_lens_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_share_lens_check CHECK (
  (
    (scope = 'share'       AND share_lens IN ('team', 'client', 'investor'))
    OR
    (scope = 'ingest'      AND share_lens IS NULL)
    OR
    (scope = 'agent_write' AND share_lens IS NULL)
  ) IS TRUE
);

-- `api_keys_share_lens_present` ((scope <> 'share') OR (share_lens IS NOT NULL)) is deliberately
-- left alone: an agent_write row satisfies its first arm, and it remains the independent second
-- statement that survives a future rewrite of the composite above.

-- ── 3. Listing a project's write keys is its own screen ────────────────────────────────────────
-- Partial, mirroring api_keys_share_idx, so the ingest hot path's index stays uncluttered.
CREATE INDEX IF NOT EXISTS api_keys_agent_write_idx
  ON api_keys(project_id) WHERE scope = 'agent_write' AND revoked_at IS NULL;

-- ── 4. The resolution view, with the scope condition WELDED IN ─────────────────────────────────
-- lib/agent-write-keys.ts selects from this, exactly as lib/auth.ts selects from
-- `active_ingest_keys` and lib/report-shares.ts from `active_share_links`. The filter lives in the
-- database object the hot path queries, so dropping it in application code is not a thing that can
-- be done — there is no filter in application code to drop.
--
-- That structural point is doing more work here than in either sibling. This table now holds three
-- credential kinds in one `key_hash` namespace, and the blast radius of a lost scope filter is no
-- longer symmetric: if the WRITE lookup ever stopped filtering by scope, every ingest key ever
-- issued — and every share token ever pasted into a Slack thread — would become a mutation
-- credential for that tenant.
--
-- The join to projects is INNER, matching the sibling views: a key whose project has vanished
-- resolves no row and the caller 401s. `expires_at` is compared HERE, in database time, so all
-- three credential kinds in this table are judged live by ONE clock (the finding that produced
-- active_share_links).
CREATE OR REPLACE VIEW active_agent_write_keys AS
  SELECT
    k.id,
    k.project_id,
    k.key_hash,
    p.slug AS project_slug
  FROM api_keys k
  JOIN projects p ON p.id = k.project_id
  WHERE k.scope = 'agent_write'
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > now());

-- A view in the public schema is exposed by PostgREST like a table, so its grants are the whole
-- access-control story. REVOKE first: a CREATE OR REPLACE VIEW re-establishes Postgres' defaults for
-- what it treats as a fresh object — the same class of surprise as DROP+CREATE silently restoring
-- PUBLIC EXECUTE on a function (Roadmap/LEARNINGS.md). This view exposes a credential hash; anon
-- must never reach it.
REVOKE ALL ON TABLE active_agent_write_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE active_agent_write_keys TO service_role;

-- ── 5. The GRANT above revokes nothing from service_role, and the two sibling views prove it ────
-- Roadmap/LEARNINGS.md: "A narrower GRANT revokes nothing — on Supabase, new public-schema tables
-- arrive with service_role already granted ALL." Supabase ships
-- `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO service_role` in the public schema, so this
-- view was created with INSERT/UPDATE/DELETE/TRUNCATE already granted and the `GRANT SELECT` above
-- is purely additive. The REVOKE on the line before it names only PUBLIC, anon and authenticated.
--
-- Checked against the running database rather than reasoned about, per the same LEARNINGS rule that
-- produced 20260803130000: `aclexplode(relacl)` shows service_role holding all eight privileges on
-- `active_agent_write_keys` AND on both siblings, `active_ingest_keys` and `active_share_links`.
-- Neither sibling migration revoked them either; the audit_log migration (20260721100000) is the
-- one place in this repo that got it right, and it wrote down why.
--
-- ── Severity, stated honestly ─────────────────────────────────────────────────────────────────
-- This is NOT currently exploitable, and saying otherwise would be the "a spec that looks like a
-- teeth test" failure one layer up. All three views JOIN api_keys to projects, and a view that does
-- not select from a single table is not auto-updatable in PostgreSQL. The writes were ATTEMPTED as
-- service_role — DELETE, UPDATE and INSERT each failed with `cannot … view … not automatically
-- updatable`, and information_schema reports is_insertable_into = NO for all three.
--
-- It is fixed anyway, on all three, because the property everyone will assume from reading
-- "REVOKE ALL … GRANT SELECT" should actually hold, and because the thing standing between this
-- grant and a real hole is a JOIN that a later simplification could remove. A single-table rewrite
-- of any of these views would make it auto-updatable, and service_role could then write to api_keys
-- THROUGH the view — bypassing lib/api-keys.ts, its audit calls, and the scope constraints' intent.
-- Cheap now, while the mental model is loaded; a whole review cycle later.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE active_agent_write_keys FROM service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE active_ingest_keys      FROM service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE active_share_links      FROM service_role;

COMMENT ON VIEW active_agent_write_keys IS
  'Write-credential resolution for lib/agent-write-keys.ts. The scope=''agent_write'' condition '
  'lives HERE, not in application code, so an ingest key or a share token can never authorize a '
  'mutation even if a caller forgets to filter. signals-loop Sprint 3, Story 3.1.';

COMMENT ON COLUMN api_keys.scope IS
  'Credential kind: ''ingest'' (Bearer key for the write/read API), ''share'' (opaque token in a '
  'share-link URL, never valid for the API), ''agent_write'' (Bearer key authorizing the connector''s '
  'staged write tools, never valid for ingest). Each kind is resolved through its own view with the '
  'scope filter welded in — active_ingest_keys, active_share_links, active_agent_write_keys.';
