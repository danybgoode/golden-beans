# Retrospective — Maker ops

> ⚠️ **NOT YET CLOSED.** This is written at the end of the review layer, before the merge that
> deploys it. The epic README's `status:` frontmatter is the SSOT and stays `in-progress` until the
> merge lands and the production smoke passes; the close-out commit sets both this line and that
> field together.
>
> It is written now rather than after, deliberately: the incidents below are freshest while the
> review rounds are still in view, and a retro drafted from memory a day later is the one that
> loses the detail worth keeping. Codex flagged the earlier "_Closed:_" header in round 12 —
> correctly, since a doc asserting a lifecycle state the SSOT contradicts is the same
> claim-without-a-check this epic spent twelve rounds removing from the page itself.

## What shipped

**Sprint 1 — shared surface.** `lib/landing-sections.ts` rewritten (not extended) to the new
section map; `lib/maker-ops.ts`, the four operating surfaces as data whose *status is computed*
rather than written down; the maker-ops layout block in `globals.css`, mobile-first and tokens-only.

**Sprint 2 — the new spine.** Eight new sections (hero, maker loop, operating context, Ops panel,
authority, FinOps-as-concept, methodology, closing), twelve retired, `app/page.tsx` recomposed and
`layout.tsx`'s metadata repositioned.

**Sprint 3 — copy, adversarially.** agy and vibe each did one single-pass, print-only read of the
*rendered* page copy. Eight findings accepted, eight rejected with reasons, all recorded in
`sprint-3.md`.

**Sprint 4 — verify and ship.** Spec updates plus three new contracts; the full gate; three rounds
of cross-family review.

**Sprint 5 — the Pods booking flow.** Added mid-build by the product owner: the consulting tier
loses its price, and `/talk` carries a real booking conversation with Cal.com embedded in our own
chrome.

## What worked

**Rendering the page beat reading it, twice.** Two defects were invisible in the source and obvious
on screen: a CSS class collision (`.context-body`, which `ContextCard` already owned) that silently
reshaped every Bet card into a two-column grid, and four kraft section stamps still reading 6, 8, 9
and 10 above a page whose 1–5 no longer existed. Neither would have failed a type-check, a lint or
a test. Both took one look.

**Deriving illustration content from the product's own source of truth.** The operating-context
sidebar reads `lib/project-route-inventory.ts` rather than hand-listing eight labels. The section
whose entire claim is "this is what you get" now cannot disagree with what the product actually
has.

**Computing every status claim.** No flag position is written down anywhere in this epic. The
SecOps badge, the drill note and every CTA destination resolve per request. This was already the
house rule; what this epic added is that it held up under review — see below.

## What didn't / incidents

**I shipped a bug and its twin in the same commit.** Round 1 (Codex) found that `Nav`'s bare
`#product` anchors were dead on `/talk`. I fixed them. Round 2 — *both* families independently —
found `PRICING_ANCHOR`, the CTA's gated-off fallback, still bare and therefore still dead on the
same route. It sits in a different file and reads as a section id rather than as a link, so fixing
one instance did not lead me to the other. This is precisely LEARNINGS' "grep for its siblings"
rule, and I did not apply it to my own fix.

**A guard that could not see the failure it is named for.** `e2e/landing.browser.spec.ts` has a test
called *"every nav link resolves to a section on the page"*. It passed throughout, because it only
ever loads `/`. The nav had become a shared component rendered on a second route, and the spec had
no way to know.

**A status claim that was accurate only in today's flag state.** The drill note was a constant
shown whenever `resilience && security` was false: *"Running a drill is switched off in this
deployment."* True today, and false the moment either gate opens alone — the page would have told a
reader that nothing could run while a resilience drill ran. Caught by Codex in round 1. The badge
beside it was correctly computed the whole time; getting the badge right and the sentence wrong is
the same defect wearing a smaller hat.

**The external copy reviewers produced good findings and unusable fixes.** Every replacement line
they offered either invented a capability (agy promised the product "caps spend per Bet" — in the
one section whose entire justification is that it says nothing is built), used vocabulary this page
bans, or swapped a cliché for a shorter cliché. The findings were worth the run; not one suggested
line shipped as written.

**agy could not read the whole PR.** Its 256 KB argv cap was exceeded by a 271 KB diff, and the run
failed outright. `--code-only` fixed it, at the cost of the reviewer never seeing the sprint docs —
so it could not check the code against its own acceptance criteria. The posted comment states the
reduced scope, which is what keeps that honest.

**The agy version pin was stale and blocked the rail entirely.** `agy-doctor --fix` re-probed and
bumped it. Folded into this PR rather than its own, given the Actions quota.

**I broke a guard while fixing the thing it guards, and the pipeline could not tell me.** Making
the nav root-relative (round 1) broke `every nav link resolves to a section on the page`, which
asserted `toMatch(/^#/)`. It went unnoticed through two more rounds because the `browser` project
is not in the blocking gate. vibe found it by *reading* the spec. Running the suite then surfaced
**five** failures, all specs still asserting retired sections. The lesson is not "update your
specs" — it is that a deletion-heavy epic invalidates tests that no gate runs, so the suite has to
be run deliberately, not assumed.

**agy then failed outright on two later rounds**, with two different errors (a permission-boundary
refusal reading its own config dir, then a bare `pwd`). Both were LOUD failures, which is the
system working — the danger this repo has recorded before is agy silently falling back and
hallucinating findings. Round 3 therefore had one external family, not two, and round 4 rotated
**vibe** in from the preference order rather than running a short layer. Worth knowing: the roster
has four families precisely so one going dark is a rotation and not a stall.

## Gaps / follow-ups

- The `/talk` iframe height is **chosen, not measured** — without Cal.com's embed script there is no
  auto-resize, so the trade-off (a short internal scroll vs. dead space) is recorded in the CSS
  rather than solved.
- **Two positioning calls were surfaced to the product owner and one is still open.** The Pods tier
  was resolved (kept, unpriced, booking through `/talk`). The Pod Report's *"your dev team, as a
  revenue engine"* headline got a one-sentence audience-switch note rather than a rewrite; whether
  that headline should change at all is `pod-report`'s call, not this epic's.
- The `browser` and `authed` Playwright projects are **not** in the blocking gate, so the new
  browser contracts (tablist, registry↔DOM, FinOps labelling) run on demand rather than on every
  PR. **This is now a known, demonstrated cost rather than a theoretical one** — see the incident
  below. Worth a follow-up bet: either put `browser` in the gate, or accept it and make "run the
  browser suite" an explicit line in the epic Definition of Done.

## Durable learnings

1. **When a review finds a bug, grep for its siblings *before* claiming the fix.** The rule exists in
   LEARNINGS for cross-file drift; it applies just as hard to the fix you are writing right now. One
   root cause, two call sites, two rounds of review.
2. **A component that moves from one route to many silently invalidates every spec that only loads
   the first route.** Bare in-page anchors are the specific failure; the general one is that "the
   page" stopped being singular and no test knew.
3. **Compute the sentence, not just the badge.** A status indicator derived from a flag, sitting
   beside prose that hardcodes the same claim, is a half-applied version of the rule — and the prose
   is the half a reader actually reads.
4. **An advisory copy reviewer's findings and its fixes are worth different amounts.** Take the
   diagnosis; write the line yourself. A model that cannot see the codebase will happily fix a flat
   sentence by promising a feature.
5. **Convergence between two foreign families is the signal worth paying for.** Every issue both
   models found independently was real. Findings from one alone were roughly half taste.
6. **A test suite outside the blocking gate is a suite you must run on purpose.** An epic that
   deletes twelve components will invalidate specs, and if those specs live in a non-gating project
   nothing will tell you — not CI, not the pre-push hook, not a reviewer who only reads the diff.
   Run it before claiming the epic is verified.
7. **When a review makes you change a shape, re-read every guard that asserts that shape.** The
   root-relative nav fix and the spec asserting bare fragments were two lines apart conceptually
   and in different files literally. Fixing the code and orphaning its guard leaves a green run and
   no coverage.
