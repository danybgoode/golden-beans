-- signals-loop · Sprint 2 — correcting a constraint that made the normal lifecycle impossible.
--
-- ── What was wrong, and how it got there ─────────────────────────────────────────────────────
-- 20260804100000 shipped:
--     CHECK (((status = 'claimed') = (claimed_at IS NOT NULL)) IS TRUE)
--
-- That biconditional says "claimed_at is set IF AND ONLY IF status is 'claimed'", which forbids a
-- RESOLVED task from carrying the timestamp of when it was claimed. So the single most ordinary
-- transition in the whole epic — an agent claims a task, then resolves it — was rejected by the
-- database. `claimed → resolved` was impossible.
--
-- The provenance is worth recording, because it is a pattern rather than a one-off. The original
-- constraint was one-directional and correct. Cross-review (Codex round 2) flagged, correctly, that
-- `claimed_by` was unconstrained and could sit on an open or resolved task. Tightening BOTH columns
-- into biconditionals fixed the reported hole and silently created a worse one — precisely the
-- LEARNINGS rule that on this kind of work "most late findings are bugs in your OWN previous
-- round's fix", and that a fix touching a state machine deserves reasoning about the whole machine
-- rather than the one transition the finding named.
--
-- Nothing found it by reading. It surfaced the moment `transition_task` was exercised against a
-- real database, on the second call of a two-call sequence.
--
-- ── The correct model ────────────────────────────────────────────────────────────────────────
--   open              → claim columns MUST be empty. A task nobody has taken has no claimant, and
--                       this is the direction the review finding was actually about.
--   claimed           → claim columns MUST be set. Unchanged.
--   resolved/dismissed→ claim columns MAY be set. This is the correction: they are HISTORY at that
--                       point ("agent-one resolved this"), and that is exactly the provenance the
--                       epic's evidence-pointer work exists to preserve. Discarding it on
--                       resolution would throw away who did the work.
--
-- `claimed_by` still travels with `claimed_at` in every state, so a half-populated pair remains
-- unrepresentable — the property Codex's finding asked for, kept.
--
-- Safe to apply to production as-is: no existing row can violate the new constraints, because they
-- are strictly WEAKER than the ones they replace on terminal rows and identical elsewhere.

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_claimed_has_timestamp;

-- Two independent statements rather than one composite, deliberately. Roadmap/LEARNINGS.md: a
-- composite predicate that evaluates to NULL is a suggestion PostgreSQL accepts, and a later rewrite
-- of one arm can silently reopen the other. Two named constraints fail independently and each says
-- exactly what it means in the error message an operator will read at 2am.
ALTER TABLE tasks ADD CONSTRAINT tasks_open_has_no_claim CHECK (
  (status <> 'open' OR claimed_at IS NULL) IS TRUE
);

ALTER TABLE tasks ADD CONSTRAINT tasks_claimed_requires_claim CHECK (
  (status <> 'claimed' OR claimed_at IS NOT NULL) IS TRUE
);

COMMENT ON CONSTRAINT tasks_open_has_no_claim ON tasks IS
  'An open task has no claimant. The direction cross-review asked for (Codex round 2).';
COMMENT ON CONSTRAINT tasks_claimed_requires_claim ON tasks IS
  'A claimed task names its claimant. Terminal tasks MAY retain the claim as history — the '
  'biconditional that forbade that made claimed -> resolved impossible (signals-loop Sprint 2).';
