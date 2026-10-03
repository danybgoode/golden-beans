-- portfolio-view · Sprint 1, Story 1.3 (Roadmap/02-commercial/portfolio-view — the Architecture lock, D3, D9).
--
-- EXPAND only. A nullable column the old code never selects, so it is safe to apply before the code that reads it
-- merges and safe to leave in place after a `git revert` of that code.
--
-- Where a product sits on the method's Consider · Operate · Exit loop is a JUDGMENT an owner writes, never a value
-- inferred from metrics (D3). NULL is the honest "not placed yet" and is meant to pass the check: a CHECK that
-- evaluates to NULL accepts the row (LEARNINGS, pod-report S3), which is exactly the behaviour wanted for the
-- column's own NULL — and the reason the predicate is a plain IN-list and nothing composite, where NULL would leak.
--
-- Verified by ATTEMPTING the writes, not by reading this comment (CODE-QUALITY #3): `e2e/portfolio-loop-stage.spec.ts`
-- writes each of the three stages and NULL against the real database and is refused `loop_stage = 'grow'` with 23514.
ALTER TABLE public.projects ADD COLUMN loop_stage text;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_loop_stage_check CHECK (loop_stage IN ('consider', 'operate', 'exit'));
