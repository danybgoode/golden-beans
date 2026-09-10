-- mockups-as-built · Sprint 4, Story 4.2 — how many times a share link has been opened.
--
-- ── Why this migration exists, when the epic said it would ship none ───────────────────────────
-- The approved `setup-shares` state draws the third column as "Expires · opens". The product had
-- no such number: `/s/[token]` records a view with `trackSelfEvent`, which posts to the engine's own
-- public API under `SELF_PROJECT_API_KEY` and therefore lands in the SELF tenant — our telemetry
-- about our own product. A customer's project holds no record that their own link was opened.
--
-- Daniel's ruling, 2026-09-10: build it. That is epic D16 applied — "it's in the design, so it gets
-- built" — and it AMENDS D13 ("no migration") and the reason D4 gives for `git revert` being a sound
-- rollback. Recorded as D17 in the epic README rather than left as a surprise in a diff.
--
-- ── Additive, defaulted, and revert-safe on purpose ───────────────────────────────────────────
-- One nullable-free column with a DEFAULT and no backfill, plus one RPC. Reverting this epic's code
-- leaves a column nothing reads and an RPC nothing calls — so `git revert` stays a complete
-- rollback of BEHAVIOUR even though the schema keeps a column. That property is why this is a
-- column on the existing row rather than a new table with its own lifecycle.
--
-- ── A COUNT, not a log, and the unit is the whole point ───────────────────────────────────────
-- ⚠️ **TOTAL OPENS — every request that resolved this token, with no deduplication of any kind**
-- (cross-agent review, Codex, Nit: an earlier draft of this comment said "distinct times", which
-- this counter does not measure and could not). One person reloading twice is two.
--
-- That is the honest unit available, and it is the only one this data supports: a bearer URL can be
-- forwarded to a room full of people from one email, so a "visitor" count would be a number that
-- reads as an audience and is not one. Storing one row per open would invite exactly that
-- misreading, and would also store a timeline of when a named recipient read a report.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS opened_count INTEGER NOT NULL DEFAULT 0;

-- ⚠️ An RPC rather than an UPDATE from the route, for the reason every other counter in this schema
-- follows: `opened_count = opened_count + 1` inside the database is atomic, where a read-modify-write
-- from the app loses concurrent opens — and a share link forwarded to a room is precisely the case
-- where several arrive at once.
--
-- It takes the share's id and NEVER a token: the route has already resolved the token through
-- `resolve_share_token`, and accepting a token here would be a second place a credential is
-- compared.
--
-- ── THREE predicates, and the project one is the point (cross-agent review, Codex, Blocking) ──
-- `p_project_id` is required and filtered on, exactly as `revokeShareLink` does one file over.
-- Both ids are server-resolved — `resolve_share_token` returns them together — so no request can
-- supply either, and this function is `service_role`-only. The predicate is therefore defence in
-- depth rather than a closed hole, and it is worth having for the same reason that sibling gives:
-- without it, the ID alone decides which row a privileged mutation touches, and a mismatched pair
-- would silently increment another tenant's counter instead of failing. The scope predicate makes
-- that unrepresentable rather than merely unlikely.
--
-- `scope = 'share'` stays for the third: it can never be pointed at an ingest key.
CREATE OR REPLACE FUNCTION record_share_open(p_project_id UUID, p_share_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE api_keys
     SET opened_count = opened_count + 1
   WHERE id = p_share_id
     AND project_id = p_project_id
     AND scope = 'share';
$$;

REVOKE ALL ON FUNCTION record_share_open(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_share_open(UUID, UUID) TO service_role;
