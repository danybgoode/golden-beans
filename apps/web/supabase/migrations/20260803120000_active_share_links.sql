-- pod-report · Sprint 3, Story 3.1 — the share-link resolution view.
--
-- Cross-review finding (Agy, PR #33, Should-fix #3), and the fix is symmetry rather than a patch.
--
-- ── The inconsistency ─────────────────────────────────────────────────────────────────────────
-- `active_ingest_keys` (20260803100000) compares expiry in Postgres: `expires_at > now()`.
-- `resolveShareToken` compared it in JavaScript, by interpolating the Node process's clock into a
-- PostgREST filter string:
--
--     .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
--
-- Two credential kinds in one table, with two different clocks deciding whether a row is live. Any
-- skew between the app server and the database is a window in which an expired link still renders
-- (or a live one 404s), and the string interpolation is a second, avoidable hazard — a filter built
-- by concatenation is one refactor away from being built from something less trustworthy than a
-- timestamp.
--
-- ── Why a view rather than moving the comparison inline ───────────────────────────────────────
-- The same reason `active_ingest_keys` is a view: liveness for a credential in THIS table is now
-- defined in exactly one kind of place — the database object the resolver queries. Ingest keys and
-- share links become structurally parallel, so the next person reading either resolver finds the
-- same shape, and neither can drift toward a clock the other does not use.
--
-- EXPAND-only and additive: nothing reads this until lib/report-shares.ts does.

CREATE OR REPLACE VIEW active_share_links AS
  SELECT
    k.id,
    k.project_id,
    k.key_hash,
    k.share_lens,
    p.slug AS project_slug
  FROM api_keys k
  JOIN projects p ON p.id = k.project_id
  WHERE k.scope = 'share'
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > now());

-- Service-role only, and REVOKE first: a CREATE OR REPLACE VIEW re-establishes Postgres' defaults
-- for what it treats as a fresh object, which is the same class of surprise as DROP+CREATE silently
-- restoring PUBLIC EXECUTE on a function (Roadmap/LEARNINGS.md). This view exposes a credential
-- hash and a tenant slug; anon must never reach it.
REVOKE ALL ON TABLE active_share_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE active_share_links TO service_role;

COMMENT ON VIEW active_share_links IS
  'Share-link resolution for lib/report-shares.ts. Scope, revocation and expiry are decided HERE, in '
  'database time, so a share link and an ingest key cannot be judged live by two different clocks. '
  'pod-report Sprint 3, Story 3.1 (cross-review fix, PR #33).';
