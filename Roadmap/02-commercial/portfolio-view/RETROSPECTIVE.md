# Portfolio view: every product in a workspace on one page, placed on the Consider · Operate · Exit loop — Retrospective

_Closed: 2026-10-03_
_Intent: yes | mostly | no_
<!-- Did we build what the product owner meant? One word, THEIR answer: yes, mostly or no. Required by `epic-dod` only
     when the epic's seed or README carries a numeric `intent_match:` (intent-match D17); the calibration learns from
     it. Keep the line and leave exactly one of the three words between `_Intent: ` and the closing underscore. -->
_Quote vs actual: not quoted (groomed before finops wrote quotes) → ≈$18.17 (—)_
<!-- Stamped by `node scripts/epic-actuals.mjs --epic portfolio-view --write`: 57.3M tokens, one orchestrated Claude Code
     session (its fresh-reviewer subagents included) across feat/portfolio-view and -s2. Codex/Agy/Vibe passes are not
     measured. For calibration: the M appetite's band on 2026-10-02 was $24–35 (n=4) — this landed under it. -->

## What shipped
One orchestrated session, two stacked PRs, each merged and deployed to production.

- **Sprint 1 — the read model and the loop stage** (#234, `a23ff01`). `getPortfolio(userId, workspaceId)` lists projects
  only through `getWorkspaceProjects()` and reads each one by id with the reads the single-project pages already use.
  Every cell is a value, a reason or "couldn't load" (D2), with a 5 s per-cell timeout (D7). `projects.loop_stage`
  (nullable, a named CHECK) was applied to production **before** the merge and verified by attempting a bad write.
- **Sprint 2 — the page and the front door** (#235, `1751c8c`). `/app/portfolio` in its five states, an owner-only
  Server Action to place a product on the loop, a "Portfolio" entry in the switcher, and a bare `/app` that opens on
  the portfolio at 2+ products in one workspace.

## What went well
- **The lock disproved the headline before any code.** The pitch's North Star "value (WoW)" has no source: the metric
  stores a key, and only its inputs have values (C1). The lock also caught that `/app?project=` is the switcher's link
  to Today, so redirecting every `/app` would have hidden Today from exactly these users (C2).
- **Running the signed-in spec found three defects no reviewer had.** A route `loading.tsx` streamed 200 before
  `notFound()` ran; an inline span over a `<details>` swallowed the "Place it" click; and the forged-id test first
  passed by never forging, because React restores a controlled hidden input on hydration.
- **The fresh reviewer earned its place on both PRs.** On S1 it confirmed the North Star bug independently and found
  the funnel partial-failure case. On S2 it found four Should-fix that two clean diff-only passes could not see,
  because each lived across files (the action's guard had no wire test, a thrown save landed in the page's
  "couldn't load" boundary, the shell named a project from another workspace, a fallback to bare `/app`).

## What we learned
- **A redirect on a front door has siblings.** The C2 class turned up three more times: the Today tab, two crumbs and
  the switcher's fallback all linked to bare `/app`. Grep every link to the URL before you change what it does.
- **`loading.tsx` decides the status code.** Anything that must 404 or redirect belongs above the first Suspense
  boundary. An HTTP spec that asserts the status catches it; one that reads the rendered words does not.
- **A spec that rewrites a hidden input must prove the rewrite took** (`toHaveValue`) before it submits. Without
  that, a refused forgery and a silently ignored one look the same.
- **A server-action error is not a page error.** A thrown action lands in the route's error boundary, and Next redacts
  its message in production. Report the outcome back to the page instead.

## Gaps / follow-ups
- **Owed to Daniel:** the signed-in walkthroughs (sprint-1 step 3, sprint-2 steps 1–4), placing his products on the
  loop, and the retro's `_Intent:_` answer.
- **A North Star level** (a stored value for the metric itself) is the follow-up that would light up WoW. It is a seed,
  not part of this epic.
- **The cut "Next wave" panel** (cross-product bets) stays a follow-up seed (D6).
- `/app/portfolio` is in the design ledger's denominator with a deferral until 2026-12-31: its five surfaces need a
  hash-row approval to count as covered.
- External review: Codex was capped all run; agy (Gemini) took the general pass, then Vibe the security lens on S2.
