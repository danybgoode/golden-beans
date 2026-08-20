# Methodology experience — Sprint 1: The vocabulary and the loop

**Status:** ✅ **Shipped and verified in production** — PR [#104](https://github.com/danybgoode/golden-beans/pull/104), squashed to `main` as `0751e45`, Production deployment `5995556979` reported `success` for that exact SHA.
**Branch:** `feat/methodology-experience` (off latest `main`)
**Risk:** LOW — reviewer may auto-merge on green CI

> **Build contract (locked by the architect before any builder starts).**
> **Amended in flight — see [A1](README.md#a1--sprint-1-touches-globalscss-2026-08-19).** The clause
> below said this sprint touches no CSS. It does: Story 1.3's six-title contents list could not reuse
> the three-pill band that held the three-word list, so `.field-guide__steps` is deleted and replaced
> from the same tokens. No new device, no new token, nothing dropped. The rest of the contract stands
> unchanged, and this note stays here rather than in the amendment alone — a contract that asserts a
> property the code does not have is read as evidence by the next reviewer (CODE-QUALITY #3).
>
> This sprint touches **only** existing landing components, `lib/landing-sections.ts` and the one
> `globals.css` rule named above. It adds no
> route, no module, no CSS device and no dependency, and it is carved so that **if the epic stops
> here, the live page is still better and nothing is half-built.**
> `references/design/assets/tokens.css` is **not edited** — it is the byte-mirrored design handoff.
> Cite the epic's D1–D4; do not re-derive them. In particular: the loop copy in D4 is the product
> owner's and is used **verbatim**, and D3's rename is a copy pass with a human read, **never `sed`**.

## Stories

### Story 1.1 — The maker loop reads as three portfolio moves  ✅ `d65ddec`

**As a** visitor, **I want** the maker loop to read as three investment moves, **so that** I
understand the method as decisions about what deserves funding rather than as a five-step process.

**Acceptance:**
- `components/landing/MakerLoopSection.tsx` renders exactly **three** items, with the epic D4 table's
  titles and copy **verbatim** — no rewording, no added trailing punctuation on the titles
  (`check-design-drift`'s `heading-period` rule reads the final character of heading text).
- The component's **"Why five steps and not four"** comment is *replaced* by one recording why three
  — the portfolio metaphor, and the fact that Release/Observe/Grow are all *Operate*. Deleting it
  silently, or leaving it, are both CODE-QUALITY #3.
- `lib/landing-sections.ts`'s `loop` entry title is updated in the **same commit** — the registry is a
  description, not a wish.
- Numbering stays `01/02/03`; the kraft `.divider` above the section is untouched.
**Risk:** LOW

### Story 1.2 — The product uses one word for the second move  ✅ `db2ea21` + `a0f797f`

**As a** reader, **I want** the page to say *Design* and never *Shape*, **so that** the product does
not use two words for the same move while I am deciding whether to trust it.

**Acceptance:**
- No user-visible "Shape"/"shaping"/"shaped" in the rendered HTML of `/`. Today's occurrences to
  clear: `MakerLoopSection`'s step 01 (removed by 1.1 anyway), `MethodologySection`'s prose (*"shape
  a Bet with your agents"*), and `MakerHero`'s illustrated chat bubble (*"Help me shape it."*).
- **Each replacement is read as a sentence, not swapped.** *"…install the rails, design a Bet with
  your agents…"* is fine; a line that reads worse after the swap gets rewritten, not tolerated (D3).
- The hero's micro line is realigned to the three moves. Proposal for the product owner's call at
  review: *"Bring an idea. Consider it. Operate it. Exit on the Evidence."*
- `MethodologySection`'s "Three steps, not nine" comment is updated — it currently explains a
  vocabulary that Story 1.3 changes.
- **Out of scope, and a reviewer should reject it if it appears:** `AGENTS.md`,
  `Roadmap/WAYS-OF-WORKING.md`, `Roadmap/LEARNINGS.md`, the seeds, `references/shapeup/`, and every
  internal use of "shape" that means *the shape of a data structure* (there are ~30 in `lib/`).
**Risk:** LOW

### Story 1.3 — The Methodology section previews the chapters instead of repeating the phases  ✅ `a0f797f`

**As a** visitor, **I want** §methodology to tell me what is actually in the field guide, **so that**
the page stops printing Consider/Operate/Exit twice and I learn something new by scrolling.

**Acceptance:**
- `MethodologySection`'s field-guide card lists the **six chapter titles grouped by phase** rather
  than `['Consider', 'Operate', 'Exit']` (epic D4): Bring an idea · Design it · Place the Bet ·
  Build it · Prove it · Decide what happens next.
- §loop and §methodology no longer render the same three-word list.
- The CTA keeps `RunYourFirstBet` and its current destination. **Story 2.4 repoints it** — this
  sprint must not ship a link to a route that does not exist yet.
- The chapter list is written inline here and is **explicitly temporary**: a comment says Story 2.1
  replaces it with a derive from `lib/methodology-chapters.ts`. Two lists that must agree is the
  defect `MakerHero` was bitten by three times; here it lives for one sprint by design, and the
  comment is what makes that a decision rather than a leak.
**Risk:** LOW

## Sprint QA

- **`api` project (the blocking gate)** — one spec over `/`'s rendered HTML: the three loop titles
  are present with their copy; there is **zero** occurrence of the word "Shape" outside code
  identifiers; §loop's list and §methodology's list are not equal.
- **`browser` project (opt-in smoke)** — `/` at desktop and 390px: three loop items, no horizontal
  scroll, §methodology's six-item list renders.
- **Red first.** Every new spec is observed failing at least once (mutate the implementation if the
  spec was written after the code) — a spec asserting "no Shape on the page" passes trivially against
  a page that failed to render at all.

## Sprint 1 — Smoke walkthrough

Env: **production** · <https://goldenfrijoles.com> · deployed SHA `0751e45` (confirmed via
`gh api repos/danybgoode/golden-beans/deployments`, not inferred from a green CI run).

Every step is one action and one expected result. No account, no session, no credentials — this is
all public surface. Steps 1–5 are a browser walkthrough; step 6 is the same thing as a command.

| # | Do this | Expect |
|---|---|---|
| 1 | Open <https://goldenfrijoles.com> and scroll to **The new maker loop** | **Three** numbered cards, not five: `01 Consider` · `02 Operate` · `03 Exit` |
| 2 | Read the three sentences under those titles | *"Consider whether it deserves investment."* · *"Operate by deploying that investment through humans and agents."* · *"Exit by deciding what the Evidence justifies."* — word for word |
| 3 | On a screen wider than 900px, look at the **right-hand edge** of that card | The third card reaches the edge. No empty strip, no border stopping in the middle of nothing. (This was broken before merge and is the reason the check exists.) |
| 4 | Scroll to **The way of working behind the product** and read the kraft card | A contents page: `CONSIDER` 01 Bring an idea · 02 Design it · 03 Place the Bet · `OPERATE` 04 Build it · 05 Prove it · `EXIT` 06 Decide what happens next |
| 5 | Use the browser's own find (⌘F / Ctrl+F) for **Shape** with match-case on | **Zero** hits. Lower-case "shape" hits twice — §finops' *"the shape of the capability"* and §pricing's *"the shape of it"* — both the ordinary English noun, both deliberate |
| 6 | Run the sprint's own spec against production | `PLAYWRIGHT_BASE_URL=https://goldenfrijoles.com npx playwright test apps/web/e2e/methodology-vocabulary.spec.ts --project=api` → **3 passed** |

**The walkthrough is baselined, so a pass is evidence rather than a script that would have passed
either way.** The same three specs were run against the *previous* production deployment
(`d0824bc`, `https://golden-beans-q5nfh7ubg-danybgoodes-projects.vercel.app`) and **3 failed / 0
passed**. Against `0751e45` they are **3 passed / 0 failed**. The checks can tell the two builds
apart.

Also verified by looking rather than by asserting: §loop and §methodology screenshotted at 1280px
and 390px, before merge and again on live production. Six chapter titles each sit on one line on a
phone; the loop's three columns fill their card on desktop.

**Owed to the product owner by name:** the judgment in Story 1.2 — does each renamed sentence read
better as *Design*? And is the hero's new micro line (*"Bring an idea. Consider it. Operate it. Exit
on the Evidence."*) the right closing beat? No automated check covers either.
