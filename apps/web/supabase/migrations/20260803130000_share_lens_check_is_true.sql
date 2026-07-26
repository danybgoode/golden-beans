-- pod-report · Sprint 3, Story 3.1 — make the scope/lens CHECK actually enforce its invariant.
--
-- Cross-review finding (Codex, PR #33). 20260803100000 added this constraint and a comment claiming
-- that a lensless share row "cannot exist for application code to interpret". The comment was false,
-- and this is the same class of defect this repo has a LEARNINGS entry for: prose in a diff reads as
-- evidence, so a reviewer who sees a stated invariant spends their scrutiny elsewhere.
--
-- ── The hole ────────────────────────────────────────────────────────────────────────────────────
--   CHECK ( (scope='share'  AND share_lens IN ('team','client','investor'))
--        OR (scope='ingest' AND share_lens IS NULL) )
--
-- For `scope='share', share_lens=NULL` the first arm is `TRUE AND (NULL IN (...))` = NULL, the second
-- is FALSE, and `NULL OR FALSE` = NULL. **PostgreSQL accepts a CHECK that evaluates to NULL** — only
-- an explicit FALSE rejects a row. So both an INSERT and an `UPDATE api_keys SET scope='share'` on an
-- ordinary ingest row (whose lens defaults to NULL) succeeded.
--
-- Verified against PRODUCTION before writing this, rather than reasoned about: the probe row was
-- accepted, reported `scope=share, share_lens=null`, and was deleted immediately afterwards.
--
-- ── Why it was not exploitable, and why it is still worth fixing ────────────────────────────────
-- The application fails closed on such a row: `active_share_links` returns it, `parseLens(null)`
-- yields null (it refuses to default), and `resolveShareToken` answers 'not_found'. So no lens was
-- ever widened by this. What was actually broken is the claim — a database-level guarantee that
-- turned out to be a database-level suggestion, in the exact place a later reader would trust it
-- without re-deriving it.
--
-- `IS TRUE` collapses the three-valued result to two: NULL becomes FALSE and the row is rejected.

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_share_lens_check;

ALTER TABLE api_keys ADD CONSTRAINT api_keys_share_lens_check CHECK (
  (
    (scope = 'share'  AND share_lens IN ('team', 'client', 'investor'))
    OR
    (scope = 'ingest' AND share_lens IS NULL)
  ) IS TRUE
);

-- Belt and braces at the column level too, and NOT redundant: this one holds even if a future
-- migration rewrites the composite predicate above and reintroduces a three-valued arm. Two
-- independent statements of "a share row has a lens" is the right amount for a constraint whose
-- failure mode is a credential with an undefined audience.
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_share_lens_present;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_share_lens_present CHECK (
  (scope <> 'share') OR (share_lens IS NOT NULL)
);

COMMENT ON COLUMN api_keys.share_lens IS
  'Audience lens for scope=''share'' rows; NULL for ingest keys. Enforced by two CHECKs, both '
  'written to be two-valued — an earlier single CHECK evaluated to NULL for a lensless share row, '
  'which PostgreSQL accepts (cross-review, PR #33).';
