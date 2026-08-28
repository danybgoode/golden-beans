# Four destinations — an information architecture for the signed-in console — Retrospective

_Closed: 2026-08-28_

## What shipped

The signed-in product went from **sixteen destinations and no information architecture** to four
sections, a per-feature destination that answers the whole loop, and a console that looks like the
design the product owner approved.

| Sprint | What | Where |
|---|---|---|
| 1 | Four sections generated from the route inventory; the per-section rail; `⌘K` over surfaces; `funnel`/`impact` leave the nav and `DEFAULT_FEATURE_HINT` dies with them | `834eb73` (#122) |
| 2 | `Setup › Connect` and `Setup › Keys`; a credential swap that cannot half-happen; **the console flipped ON in production** (A19) | `e6bb22b` (#123) |
| 3A | The approved design made **binding and measurable** — `CONSOLE-CONTRACT.md`, `app/console.css`, `e2e/console-visual.authed.spec.ts`; Ship › Features rebuilt; the AgentRail out of the console grid | `4ba9665` (#124) |
| 3B | Both free-key authoring paths deleted and the **"New feature" wizard** landed in the same commit; **Funnel and Impact as tabs**; `⌘K` indexes feature keys; the dead nav removed; A22 swept across every signed-in route; the visual gate wired into CI | `270faa0` · `88dccd0` · `54fa594` · `68a593f` · `05e857c` · `f825f46` |

The outcome test the epic was written against: **every surface is reachable in three clicks or one
`⌘K`, and no navigation entry anywhere tells anyone to edit a URL.**

## What went well

- **The architecture lock did its job, and it did it by being WRONG in public.** Nine decisions were
  locked against live code and the live production database before any code was written; **D6, D8 and
  D9 came back disproved**, and each disproof became an amendment with a number instead of a
  mid-build surprise. A4 is the clearest: asking the database *"do these two registries intersect?"*
  returned **0 rows for 42 of 42 features**, and turned Story 3.2 from "build a funnel tab" into
  "build the sentence that says why there is no funnel" — before a line was written.
- **Story 3.3 first was the right call, and it was measurable.** It is the only story that turns the
  visual gate's assertion [1] green: **2889px in a 960px viewport** before, `<= 960` after. Every
  later story was built against a page that already fits on one screen.
- **The ordering rule held under real pressure.** Story 3.3 deleted the only two ways to create a
  feature and landed the replacement in the same commit. With the console LIVE since Sprint 2 there
  was no dark period in which a missing control would have gone unnoticed — which is exactly why A3
  wrote the requirement down before a builder could reach it.
- **Six defects were found by OPENING THE PAGE**, none by reading a diff: three landing rules leaking
  into the console through shared class names; a `<section>` opening 72px of dead air the moment
  Story 3.3 emptied it; **every confirmation dialog in the product pinned to the top-left corner of
  the viewport** since the component shipped; and the command palette's keyboard cursor painted by a
  selector that matched nothing.

## What we learned

- **A `font:` SHORTHAND resets family, weight and style — so restating `font-size` under it leaves
  the rest in place.** `tokens.css`'s `.tag` and `.note` are landing rules; the console's own `.tag`
  set only `font-size`, and every type/risk chip rendered as tracked-out mono while the override
  looked applied. Override the shorthand's *fields*, not one of them.
- **A universal `* { margin: 0 }` reset defeats the UA's `margin: auto` on `dialog:modal`.** Every
  confirmation dialog in this product has been pinned to the viewport's top-left corner since the
  component shipped, measured at `x: 0, y: 0` in 1440×960. Nothing noticed because no spec looks at
  where a dialog IS and no screenshot of one had been read.
- **A selector written against markup that later moved is dead CSS that reads as live CSS.** The
  palette's cursor rule was `li[aria-selected]`; a fix moved `role="option"` and `aria-selected` onto
  the anchor and left the rule behind, so ↑/↓ moved an announcement a screen reader could hear and a
  sighted reader could not see — the exact defect that rule's own comment claimed to prevent.
- **When the prototype and the control plane disagree about a WORD, the control plane wins and the
  disagreement is the finding.** The design's *"a release toggle is off by default"* maps onto
  `defaultVariantKey: 'off'`, which in Golden creates a feature you cannot turn on: activation and
  what the served version evaluates to are different things, and the console's own
  `describeActivationSurprise` would have warned about every feature the wizard created. Both kinds
  default to `on`; the kind decides `metadata.polarity`, which is what the design's own copy claims
  for it.
- **A stale `next start` is a test run against a build you did not make.** A "regression" that
  appeared after a clean restore was a server still serving the mutated build, because the restart
  command did not kill port 3000 first. Twice in one session. `lsof -ti:3000 | xargs kill` belongs in
  front of every rebuild, not most of them.
- **Prove a gate-off guarantee by RENDERING both off-states, not by reading the diff.** A21 says the
  promise is about two gates; the check is four page renders (this branch × the merge base × two
  off-states), normalised for per-run ids and diffed. Identical — and it also surfaced the ONE thing
  that is not identical (a preloaded chunk in the RSC payload), which is the sentence that keeps
  "byte-for-byte" honest.
- **A number in a story is a claim, and the cheapest way to check it is to measure it.** Story 3.4
  owed "the `/app` load cost does not regress". Counting requests in a browser gave `0 / 1 / 1`
  (page load / first `⌘K` / reopen), which is worth more than any amount of reasoning about caching.

## Gaps / follow-ups

- **Owed to Daniel by name:** the signed-in production walkthrough (`sprint-3.md`), whose two writing
  steps — turning a live flag off and creating a real definition version — are his by construction;
  and **minting a connector URL** (`Setup › Connect`), outstanding from Sprint 2, because a real
  production credential mint is never covered by a merge authorization.
- **Command Center's own layout is still pre-contract** (A25): mono-italic caveats, a wide vertical
  gap between the stat row and the funnel figures. A page redesign that no story in this epic covers.
  Half-doing it would have left a route that is neither.
- **`landing.browser.spec.ts:630` is red on `main`** — `expected > 3, received 2` in-page anchors,
  reproduced identically at `4ba9665`. It belongs to a landing epic and decayed silently because the
  `browser` project runs in no pipeline. Reported, not patched.
- **Five deferred rows remain in the visual gate**, each named with its reason in
  `console-visual.authed.spec.ts` (the switch closed in Story 3.3; the feature row's 78px, the
  dormant row's 89px, the button's 38px, the switcher's 30px and the un-built 44px second chrome tier
  remain). Two of them are contract numbers that are *emergent measurements of the prototype's
  shorter copy* rather than declared intent, and one is unreachable by decision (a 44px WCAG target
  floor beats a measured pixel).
- **The `authed` project is still not the blocking gate.** One file of it now is. The other 84 specs
  are run on purpose, and this epic is the second consecutive one to record what happens when nobody
  does.
