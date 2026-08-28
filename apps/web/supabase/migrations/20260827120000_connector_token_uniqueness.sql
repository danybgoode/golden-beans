-- console-ia-overhaul · Sprint 2, Story 2.1 — at most ONE active connector token per project.
--
-- ── Why this exists ──────────────────────────────────────────────────────────────────────────
-- `mintConnectorToken` (apps/web/lib/connector-tokens.ts) is a check-then-act: it asks whether an
-- active token exists and inserts if not. Nothing made that atomic, so two concurrent mints could
-- both see "none active" and both insert. Raised as Blocking by BOTH cross-family reviewers
-- independently (agy and Mistral Vibe, PR #123), which is corroboration rather than repetition.
--
-- The application-side fix — returning EVERY active token so a duplicate is visible and revocable
-- rather than hidden behind a `LIMIT 1` — removed the danger (a credential you cannot see is a
-- credential you cannot revoke). It could not remove the race. Only the database can, and a
-- constraint is the only thing that holds under concurrency: an application check is a promise about
-- interleaving that the application is not in a position to make.
--
-- ── Why a PARTIAL index, not a plain unique constraint ───────────────────────────────────────
-- Revocation here is soft (`revoked_at`), and a project rotating its connector accumulates revoked
-- rows by design — that history is the audit trail. `UNIQUE (project_id)` would forbid ever minting
-- a second token, breaking rotation entirely. The predicate scopes uniqueness to the rows that
-- represent live access, which is the actual invariant: **at most one token may authorize reads of a
-- project at any moment.**
--
-- ── Safe on existing data, verified rather than assumed ──────────────────────────────────────
-- Production holds 3 connector_tokens rows across 3 projects; the duplicate check
-- (`GROUP BY project_id HAVING count(*) > 1` over unrevoked rows) returned ZERO rows on 2026-08-27.
-- So this is additive with no backfill and cannot fail on data that already exists. It is applied
-- BEFORE the merge that deploys the code, per AGENTS rule #4 — merging is the deploy, and a
-- constraint the code relies on must exist before the code does.
--
-- ── What the application still does, and why it is not redundant ─────────────────────────────
-- `mintConnectorToken` keeps its pre-check. This index makes the duplicate impossible; the check is
-- what turns the second concurrent mint into a readable "this project already has an active
-- connector URL" instead of a raw 23505 constraint violation. Belt and braces answering different
-- questions: the index guarantees correctness, the check produces a sentence an operator can act on.

CREATE UNIQUE INDEX IF NOT EXISTS connector_tokens_one_active_per_project_idx
  ON connector_tokens (project_id)
  WHERE revoked_at IS NULL;

COMMENT ON INDEX connector_tokens_one_active_per_project_idx IS
  'At most one unrevoked connector token per project. Partial so soft-revoked rows (the rotation '
  'audit trail) do not count. Added by console-ia-overhaul S2 after both cross-family reviewers '
  'independently found mintConnectorToken to be a check-then-act with nothing behind it.';
