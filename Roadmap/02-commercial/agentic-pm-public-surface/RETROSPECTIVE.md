# Retrospective — The public surface names the category

**Shipped:** 2026-08-20 · **PRs:** [#111](https://github.com/danybgoode/golden-beans/pull/111) ·
[#113](https://github.com/danybgoode/golden-beans/pull/113) ·
[#114](https://github.com/danybgoode/golden-beans/pull/114) (plus
[#112](https://github.com/danybgoode/golden-beans/pull/112), an agy version-pin bump)
**Live:** <https://goldenfrijoles.com> · 12 stories · 13 amendments · 3 production deploys

## What shipped

Three surfaces a stranger reads were three voices. Now:

- **The category is named, defined once, and stated from one place in the code.** `lib/positioning.ts`
  holds the name and its definition; five outward surfaces import it and none retypes it. A spec
  asserts the string a stranger reads is byte-identical to the string in the module.
- **The hero hands you a prompt instead of a picture.** `handoffPrompt` — written, documented,
  specced and **call-site-free for two epics** — is the first thing on the page. A reader who pastes
  it sends their own agent to go and check us, which is stronger than a stat tile because it does
  not require being believed.
- **Two sections came out.** §product argued §ops's point under a second heading; §proof was the
  page's only non-illustrative evidence and was removed on a deliberate product-owner call. The nav
  shrank to **Ops · Pricing · Methodology** rather than re-pointing a link at a section it does not
  name.
- **The workshop teaches the actual framework.** `/northstar-self-serve.md` went from eight generic
  questions to 16.7 KB of the real thing: the three games, the ladder, the checklist,
  breadth/depth/frequency/efficiency, worked examples, and a greenfield test that runs *before* the
  summary.
- **`/llms.txt` is an operating brief**, not a sitemap: it tells the agent that fetched it what to
  ask a new arrival and how to speak to them.

## What went well

**Locking the architecture against the code, not the plan.** The scaffolded epic was checked line by
line against the shipped repo before any story started, and it produced **nine amendments on day
one** — including four spec traps in Sprint 2 that the deterministic gate could never have caught,
because the `browser` project is not in it. Two of those (A5, A12) were specs that would have been
*loosened into uselessness* by a builder resolving them mid-flight.

**Persisting on a repeated review finding.** Codex raised the attribution issue Blocking **twice**.
The first answer was a builder's answer: it preserved the assertion by degrading the acceptance
criterion, because that is the trade that needs no permission. Following LEARNINGS' rule — *a
reviewer repeating a finding you reasoned your way out of is a signal to find a third option* — led
to escalating it, and the third option (widen the pin to a named allow-list) was **stricter** than
what it replaced. A count of hosts cannot tell you *which* host it found.

**Scoping the reviewer at the file it could not see.** `globals.css` is 140 KB and does not fit
agy's argv cap. Four unscoped rounds returned clean while the riskiest change in the epic sat
unreviewed. One scoped round found four real defects. This is the second epic in a row where every
real CSS finding came from a scoped pass; it should now be reflexive, not a recovery move.

**Screenshots found what assertions could not.** The copy button's icon had been sitting on its
label at every width, live, for two epics — invisible because the only prompt card was at the bottom
of the page. No assertion could have failed for it. Story 2.1 promoted it above the fold and a
screenshot caught it in one look.

## What we learned the hard way

**A scripted CSS prune needs a parsed-rule diff, and then it needs another one.** The first pass
matched dead substrings against whole rules and deleted **12 live selectors** grouped with dead ones.
Caught by diffing parsed rule sets — not by tests, which stayed green. The second pass walked only
top-level blocks and left every `@media`-nested rule behind. Caught by the scoped reviewer. Two
different bugs in one prune, neither visible to the gate.

**`git checkout <file>` is not "undo a mutation".** Twice, restoring a mutation check with
`git checkout` silently discarded uncommitted story work — Stories 3.2 and 3.3 both had to be
rebuilt. The habit that works is a file copy taken *before* the mutation. Notably, the epic's own new
spec is what caught the second one.

**Three guards had to be written twice.** The copy-button geometry guard compared the icon to the
*button* box and passed with the fix reverted. The widened host matcher was case-sensitive, so
`HTTPS://` walked past it. A test name claimed "once" while the body only asserted "contains". Every
one was found by mutation-checking or by a reviewer — none by writing them more carefully.

## Gaps, stated rather than implied

- **Story 1.4 is owed to Daniel by name.** Running the workshop end-to-end in a fresh Claude and a
  fresh ChatGPT, on a real product. No automated smoke can judge whether a facilitation script
  facilitates. It must be run against **production**, not a preview — see A13.
- **A13: `SITE_URL` is Production-only**, so every preview deployment renders every prompt as
  `localhost:3000`. Not a defect in this epic's code and not fixed here; the right answer is
  teaching `getSiteUrl()` about `VERCEL_URL`, which is a shared-surface change behind every absolute
  URL in the app. **Recommended as its own small epic.**
- **Three `components/ui/` kit primitives now have zero call sites** — `AgentWindow`, `ChatThread`,
  `ContextCard`. Kept deliberately (an unused kit primitive is inventory, not dead code) and named
  here so it is a decision rather than an oversight.
- **A broader orphaned-class sweep of `globals.css` is not done.** A static unreferenced-class sweep
  is not evidence in that file: `.north-star` appeared in the candidate list and turns out to be
  rendered by `/app/impact` and `/hub`.
- `e2e/north-star-sync.spec.ts:69` fails intermittently **locally** — on `main` too, and green in
  CI. Pre-existing, unrelated, not fixed inside a copy epic.

## Review record

**19 rounds across three PRs; 14 real findings.** Sprint 1 took 8 rounds and Codex found something
new in six of them, including two after agy had gone clean. Sprint 3 was clean from both families on
the first pass — the difference is that its risk had already been spent in the lock pass.

The rule that did the work: **stop at a clean round, not at a count** — and a clean round means one
where the reviewer could actually *see* the risky file.
