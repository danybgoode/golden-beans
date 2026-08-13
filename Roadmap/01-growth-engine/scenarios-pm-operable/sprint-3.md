# Scenarios made PM-operable — Sprint 3: Impact as a comparison

**Status:** ⬜ not started

> **Build contract (locked by the architect before the builder started).**
> **D7 answered:** #14's charting decision has not landed. This sprint ships impact as a clearer
> control-vs-treatment comparison table with the gap stated in the PR — it does not hand-roll an SVG
> chart and thereby make the dependency decision by accident.
> **D11 governs every story here.** A chart makes a claim look stronger than the same numbers in a
> table. The "no causal customer claim" and cohort caveats stay verbatim, and the product owner
> reviews the **rendered claim**, not just the render. On this sprint, "it looks good" is a warning
> sign.
> Branch `feat/scenarios-pm-operable-s3`, cut from `-s2`.

## Stories

### Story 3.1 — Control vs treatment, honestly (PRD-G E3)
**As a** PM, **I want** to see a scenario's business impact as a comparison,
**so that** "technical delta / claim / blockers" in a table row becomes something I can actually read.

**Acceptance:**
- Impact evidence from `lib/scenario-impact.ts` renders as a control-vs-treatment comparison, using
  whatever #14 decided (D7). If #14 has not landed, it renders as today's table and the PR says so.
- **Every caveat that accompanies the table today accompanies the comparison**, verbatim — cohort
  type, synthetic/internal qualification, and the no-causal-customer-claim statement (D11).
- The cohort is labelled **on the comparison itself**, not in a footnote below it. A synthetic-cohort
  result must not be readable as a customer result at a glance.
- Where evidence is insufficient to support a comparison, the view says so and shows nothing rather
  than showing a comparison with a disclaimer.
**Risk:** high

### Story 3.2 — Blockers and claim status stay first-class
**As a** PM, **I want** to see what's blocking a claim as prominently as the claim itself,
**so that** the product's honesty survives the redesign.

**Acceptance:**
- A result's blockers and claim status render at the same visual weight as its numbers — not as
  small print under a chart.
- A result with unresolved blockers is visually distinguishable from one without, **before** the
  reader gets to the numbers.
- Copy is reviewed against audit §2.6 and changed only in the direction of more precision.
**Risk:** high

### Story 3.3 — The scenario → impact → TARS thread (PRD-G E1)
**As a** PM, **I want** to get from a scenario I ran to the funnel it affected,
**so that** "define a scenario and watch the downstream impact" is one path instead of two screens.

**Acceptance:**
- A completed run links to the impact evidence it produced, and that links onward to the relevant
  funnel/North Star view.
- The thread works in both directions — from a run to its impact, and from the impact back to the
  run and definition that produced it.
- Links resolve through the existing tenancy path (`lib/dashboard-auth.ts`); no `project_id` is
  taken from the URL.
- No new read seam is introduced — this story connects existing views.
**Risk:** high

## Sprint QA
- **api spec(s):** extend `e2e/scenario-authoring.spec.ts` — impact renders with its caveats present
  (assert the caveat text is in the response, so a redesign cannot silently drop it); insufficient
  evidence renders the no-comparison state; the run↔impact↔funnel links resolve and are
  tenancy-scoped. `scenario-dashboard.authed.spec.ts` must pass **unchanged**.
- **browser smoke owed:** yes, to the product owner, and named explicitly — **read the rendered
  claim and judge whether it overstates the evidence** (D11). This is the one check in the epic that
  no spec can make, and it is the reason this sprint is risk-high despite writing nothing.
- **Mutation check:** remove a caveat from the render → the caveat-presence spec goes red. This is
  what stops the honesty rail from being decorative.
- **deterministic gate:** `npm run typecheck` + `npm run build` + Playwright `api` +
  `check:design-drift` green before merge.
- **Review:** HIGH tier — routed, two cross-family passes + fresh reviewer subagent. **Product owner
  merges.**

## Sprint 3 — Smoke walkthrough (do these in order)
Env: preview (pre-merge) · then production · https://golden-beans-gamma.vercel.app

1. Go to https://golden-beans-gamma.vercel.app/app/scenarios/<testProjectSlug> and find the impact
   evidence for the synthetic run from Sprint 2.
   → It renders as a control-vs-treatment comparison (or as today's table, if #14 hasn't landed and
     the PR says so).
2. **Read it as if you were a prospect, not the person who built it.**
   → Does it read as a claim about *customers*? It must not. The cohort label should be impossible
     to miss.
3. Find the cohort label.
   → It is **on the comparison**, not in a footnote underneath it.
4. Find the no-causal-customer-claim statement and the blocker list.
   → Both are present, at the same visual weight as the numbers. Compare the wording to what the
     page said before this epic — it should be identical or more precise, never softer.
5. Open a scenario whose evidence is insufficient.
   → It says the evidence is insufficient and shows **no comparison** — not a comparison with a
     disclaimer attached.
6. From the completed run, follow the link to its impact, then onward to the funnel view.
   → Both links work, and the funnel view is the right project's.
7. From the funnel view, navigate back to the run and its definition.
   → The thread works in both directions.
8. Try step 6 while signed in as a member of a **different** project.
   → You cannot reach the first project's run or impact.

If any step fails, note the step number + what you saw — that's the bug report.
**Step 2 is the acceptance check that matters most in this sprint**, and it is a judgement the
product owner owns.
