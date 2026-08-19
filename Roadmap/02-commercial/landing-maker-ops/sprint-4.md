# Maker ops — Sprint 4: Verify and ship

**Status:** ✅ done — merged as `46c7e80`, production smoke green.

> **Build contract.** "Done" means serving on `https://goldenfrijoles.com`. Merging to `main` **is**
> the deploy (AGENTS.md rule #4) — no `vercel deploy`, ever. Nothing here is reported as passing
> that was not actually run; a green claim that was never run is the most expensive thing this
> sprint can produce (CODE-QUALITY, "the gate").

## Stories

### Story 4.1 — The specs describe the page that exists
**As a** future contributor, **I want** the landing's rendered contract to pin the new spine,
**so that** the next redesign breaks a test rather than a promise.

**Acceptance:**
- `e2e/landing.browser.spec.ts` is updated where it asserts the retired narrative: the `<h1>` text,
  the hero CTA href list, and the prompt-card count.
- New assertions for what this epic introduces: the Ops tablist is keyboard-operable and exposes
  `aria-selected`; the FinOps surface is labelled `next` wherever it appears; the primary CTA
  resolves to a real destination under both `SIGNUP_ENABLED` positions.
- The surface-note contract (every framed agent window commits to real or illustrated) still passes
  against the new frames — the new hero and operating-context frames both add one.
- `e2e/mobile-heuristics.browser.spec.ts` still passes for `/` — no horizontal scroll at 390px, no
  tap target under 44px.
- Each new spec is **mutation-checked**: break the thing it defends, observe red, revert, confirm
  `git diff HEAD` is clean (CODE-QUALITY #5 and #12).
**Risk:** low

### Story 4.2 — The full gate, actually run
**Acceptance:**
- `npm run typecheck` (four tsconfig projects), `npm run lint` (`--max-warnings=0`),
  `npm run test:unit`, `npm run test:e2e`, `npm run check:design-drift` — all run, with real output
  reported.
- `npm run test:e2e` needs `supabase start` and a freshly built server; a failure that turns out to
  be a stale server or a missing local Supabase is diagnosed, not reported as a regression.
**Risk:** low

### Story 4.3 — Cross-family review, to clean
**Acceptance:**
- Two cross-family reviewers per round (`review-route.mjs`, builder = claude → codex + agy).
- **Rounds continue until one round comes back clean from BOTH families.** Two rounds is a floor,
  not a stopping condition, and a fix gets the same suspicion as the code it replaced.
- Every finding is answered in the PR: fixed, or rejected with a reason.
**Risk:** medium

**Round log.** Seven rounds. agy went dark after round 2 (two loud failures — a permission-boundary
refusal, then a bare `pwd`), so **vibe** rotated in from the preference order rather than running a
short layer. Both reviewers hit their 256 KB argv cap on a diff this size; `--code-only` then
`--paths` kept them reading, with the reduced scope stated in each posted comment.

| Round | Codex | vibe / agy | What it cost |
|---|---|---|---|
| 1 | 2 blocking, 2 should-fix | agy: version pin stale, no review | dead nav anchors on `/talk`; a drill note true only in that day's flag state; dangling `aria-controls`; a CTA test covering one branch |
| 2 | 1 blocking | agy: 1 blocking, 1 should-fix, 1 nit | **both families independently found the same bug** — the CTA's fallback anchor, sibling of round 1's own fix |
| 3 | 2 blocking, 1 should-fix | agy failed | a claim that outlived its qualifier (`isConnectorWritesEnabled` retired with §4); DevOps advertising a gated capability; ~400 lines of dead CSS |
| 4 | 2 blocking, 1 should-fix | vibe: 1 blocking, 1 should-fix, 1 nit | the hero bag's SecOps row; an unbuilt capability in the link preview; **a guard I broke while fixing what it guards** — which then surfaced five stale specs |
| 5 | 1 blocking, 1 nit | vibe: 3 should-fix, 2 nits | a premature "live in production" claim; a CSS splice that ate one rule's body; the DevOps bag row (third instance of one root cause → derived the list) |
| 6 | **0 blocking**, 1 should-fix, 1 nit | vibe: 1 blocking, 1 should-fix, 1 nit | a 404 that could mean "deleted" reading as "gated"; three views spelling one status three ways → one label function |
| 7 | **0 blocking**, 1 should-fix (rejected with evidence — the tarball was never tracked) | vibe: malformed output, no review produced | a comment asserting "one badge, on the one row that needs it" after the rows were derived and three of them qualified |
| 8 | 1 blocking, 1 should-fix | vibe: 1 blocking, 2 should-fix, 1 nit | an unknown-gate guard that could not fire in the case it exists for; a THIRD dead anchor (`#try`, pointing at a deleted section) → added the guard for the whole class; a share description naming gate-dependent capabilities |
| 9 | **0 blocking**, 1 should-fix, 1 nit | vibe: 1 blocking, 1 should-fix (rejected), 1 nit | a lead sentence claiming runnability above the badge that qualified it; an allow-list that did not guarantee a handler — add a gate, forget the branch, and the surface renders LIVE with its gate closed |
| 10 | **0 blocking**, 1 should-fix | vibe: **0 blocking, 0 should-fix**, 1 nit | the share description's THIRD draft — the second listed capabilities and justified it by claiming they were ungated, which `lib/flags.ts` disproves; the last hand-spelled badge string |
| 11 | **0 blocking, 0 should-fix**, 1 nit | vibe: 1 "blocking" (rejected — scope artifact), 1 should-fix, 1 nit | `GATE_NOTES` typed `Record<string, …>` under a comment claiming an undescribed gate was a TYPE error — it was not; made real and proven by mutation. An unexercised `variant` prop |
| 12 | 1 blocking, 1 should-fix | vibe: **CLEAN — 0 blocking, 0 should-fix** | the drills panel's trailing clause: head computed, tail hardcoded, so with one gate open it denied a run that was startable |
| 13 | **CLEAN — 0 blocking, 0 should-fix, 0 nits** | vibe: 0 blocking; 1 should-fix + 2 nits, all checked and rejected with evidence | — |

**Stopped at 13.** Codex came back fully clean and vibe's three remaining items were verified
rather than applied: Cal.com does honour `embed=` (the plain and embed URLs return different
documents), the bag's `*` footnote IS referenced (the round stamp reads "beans\*"), and the `Nav`
comment stays because it records a shipped bug and why its guard could not see it.

### What the layer bought, by class

Six findings were ONE recurring defect — *a computed value sitting beside a hardcoded claim about
the same thing*: the Ops panel, SecOps on the bag, DevOps on the bag, the badge text, the drills
note, and the trailing half of a sentence whose first half was already computed. Every fix made
them one value rather than patching the copy.

Five more were a SECOND class — *prose asserting a property the code did not have*, including my
own comment claiming `Record<string, …>` made an undescribed gate a type error. It did not; it does
now, proven by mutation.

Five findings were **rejected with evidence**: the section stamps (already unique), `.agent-result`
(zero consumers), the SDK tarball (never tracked), `booking.ts` as dead code (scope artifact), and
the two from round 13.

**Stopping condition.** Round 10 was the first round where both families reported no blocking
findings. Because fixes landed after it, round 11 runs on the head that contains them — a clean
round on a head nobody has reviewed is not a clean round (LEARNINGS: a fix deserves the same
suspicion as the code it replaced).

Two findings were **rejected with evidence** rather than fixed: the section stamps were already
unique (1–4, verified), and `.agent-result` had zero consumers (verified twice). Five copy findings
from Sprint 3 were rejected on the record in `sprint-3.md`.

### Story 4.4 — Ship it, then prove it shipped

**Result — 2026-08-19.** Merged as `46c7e80`. Production deployment confirmed via
`gh api repos/danybgoode/golden-beans/deployments` (sha `46c7e80`, state `success`), not assumed
from a green CI run. Production smoke: **34 checks, 34 pass, 0 fail.**

The smoke script was **baselined against the OLD production first**, where it failed 19 checks —
which is what makes the pass afterwards evidence rather than a script that would have passed
either way. One check failed on the first live run and it was the CHECK that was wrong, not the
page: it counted string occurrences of the Cal.com embed URL and got 2, because the URL also
appears in Next's RSC payload. Corrected to count `<iframe>` elements (there is exactly one).

What the smoke actually exercised, by behaviour: six routes answer 200; all thirteen section ids
render; the tablist and all four Ops panels are present; **the gate-derived claims match reality** —
`GET /api/v1/scenarios/snapshot` is 404 while `POST /api/v1/scenarios/admin` is 400, so the route
family is deployed and only the gate closes it, and the page says so; every CTA resolves; `/talk`
serves exactly one Cal.com frame plus its unconditional escape-hatch link, with root-relative nav;
the metadata is repositioned and names no gate-dependent capability; the dogfood beacon endpoint
still answers.

Verified visually on the live site as well: the hero bag reads SecOps "Partly gated" and FinOps
"Next build" — both computed from the real production flags, which is the epic's central claim
proving itself in production.

**Acceptance:**
- PR opened, gate green, `origin/main` merged into the branch before merging.
- Merged to `main`. The deployed SHA confirmed via
  `gh api repos/danybgoode/golden-beans/deployments` — never assumed from a green CI run.
- **Production smoke on the live site**, by exercising behaviour: the new `<h1>` renders, every CTA
  resolves to a 200, the Ops tabs switch, the SecOps badge matches the real gate state, the FinOps
  section is labelled `next`, and `/` has no horizontal scroll at 390px.
- The dogfood beacon still fires — `landing_visited` is still being ingested after the deploy.
**Risk:** medium

### Story 4.5 — Close the epic
**Acceptance:**
- `Roadmap/README.md` poster updated.
- `RETROSPECTIVE.md` written — what shipped, what worked, what didn't, the owed ledger.
- Durable learnings promoted to `Roadmap/LEARNINGS.md`, deduped against what is already there.
- README frontmatter `status: shipped`.
- `node scripts/build-order.mjs` regenerated (never hand-edited).
**Risk:** low
