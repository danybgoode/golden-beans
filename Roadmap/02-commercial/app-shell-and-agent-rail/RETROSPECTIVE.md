# App shell and agent rail — make the signed-in product show the agent it sells — Retrospective

_Closed: 2026-08-07_

## What shipped

Three sprints, three squash-merges to `main`, **no migration** — every read is over a table that
already existed.

| Sprint | PR | What is now live |
|---|---|---|
| 1 | [#71](https://github.com/danybgoode/golden-beans/pull/71) → `3b99fed` | `lib/agent-activity.ts` + `lib/pending-confirmations.ts` (the two read seams), the section nav rendering `PROJECT_ROUTE_INVENTORY`, `check:design-drift` extended to `components/{ui,product,brand}` |
| 2 | [#75](https://github.com/danybgoode/golden-beans/pull/75) → `883a37b` (review record on [#72](https://github.com/danybgoode/golden-beans/pull/72)) | `ActivityFeedItem` extracted and the three landing callers moved onto it, `AGENT_RAIL_ENABLED` born OFF, the rail on every `/app` route, pending agent proposals |
| 3 | [#73](https://github.com/danybgoode/golden-beans/pull/73) → `102f494` | `StatCard`, `FunnelBars`, Command Center replacing the bare `<ul>` |

Plus [#74](https://github.com/danybgoode/golden-beans/pull/74) → `a488616`, a tooling fix the epic
forced out of hiding (see below).

**59 files, +3867 / −707.** Six new components, ten new `lib/` modules, four new spec files.
Unit tests 869 → **903**. `check:design-drift` 67 → **73 files swept**.

`apps/web/package.json` is untouched. The bet's headline constraint held.

## What went well

**The plan's ten locked decisions were worth the grooming time.** D1–D10 were cited, not
re-derived, and only one of them turned out to be wrong (D6, below) — which is a good rate for ten
architectural calls made before a line of code existed. D2's allow-list, D3's `metadata.via`
attribution and D10's ordering were implemented literally and each has a spec that dies without it.

**Reuse beat rebuilding, twice, and both times it was the reviewer's own repo history that said so.**
Sprint 1's nav renders an inventory that already existed and was already unit-tested; the audit had
read `/app`'s bare `<ul>` as *"there is no information architecture"* when the truth was that one
existed and had never been presented. Sprint 3 wrote **no new query at all**: `readOutcome` in
`lib/pod-report-query.ts` already did the exact per-project rollup Command Center needed, hardened
by two rounds of cross-review on PR #33. Exporting it as `getProjectOutcome` means the number an
owner sees on the front door and the number a client sees in a shared report cannot drift.

**Mutation checks did their job five times.** Every one was observed red, reverted, and re-verified:
the two tenancy filters, the rail's flag polarity, the pending chip's three states, and the rate
rounding. One of them — the D2 SQL filter — was only *found* to be untested because a reviewer
asked which mutation would go undetected.

**The parallel builder worked exactly as the routing table predicts.** Story 2.1 (a well-specified
extraction with a clear acceptance check) went to a Sonnet-tier agent against a locked component API
and a four-file allow-list, while the architect built the rail. It came back a clean 1:1 extraction
with zero `▸` characters left, and the verification cost was one `git diff`.

## What we learned

**A UI sprint needs someone to open the page.** This is the epic's headline lesson. Two real defects
shipped past a full green gate — typecheck, lint, 883 unit tests, build, drift guard, 435 api specs
and 14 authed browser specs — and were found by *looking at a screenshot*:

1. the fixed rail sat on top of the project card from ~1080px, because the page reserved the rail's
   **width** but not the **gutter it is inset by** — two numbers where there should have been one;
2. `tokens.css`' `section { padding: 36px 0 }` (written for the landing's page bands) opened **72px
   of dead air per rail section** inside a 320px sidebar, which reads as a rendering failure rather
   than a quiet day.

The overlap now has a geometry assertion in the authed smoke. The padding does not, and that is
stated rather than pretended. **Assertions cover the properties you thought to name; a screenshot
covers the ones you did not.**

**"Not currently reachable" is not a property to rest an honesty guarantee on.** `StatCard`'s
docblock said the caveat was *"REQUIRED alongside a null value at the type level"*. `ReactNode`
includes `undefined`, so `caveat: ReactNode` accepted `caveat={undefined}` and rendered an empty
`<span>` — a number-shaped nothing, in the one component whose entire subject is that distinction.
Tightening it to `NonNullable<ReactNode>` failed the build immediately at the one call site that
could reach the hole. **The comment asserted a property the type did not have; the type is what
changed.**

**The same class again, on the surface that could least afford it.** The rail's summary chip was
`pending?.length ?? 0`, rendered only when `> 0`. A failed proposals read therefore produced the
same silent summary as an empty one — and because `RailDisclosure` server-renders the panel
*closed*, on a phone that chip is the **only** thing a reader sees. The honest sentence existed; it
was behind a disclosure nobody has a reason to open. **An honest empty state that is not visible in
the collapsed view is not an honest empty state.**

**A spec can defend half of the rule it is named after.** `e2e/agent-activity.spec.ts` claimed to
cover D2. Deleting `.in('action', …)` from the *query* left every test green, because the `flatMap`
re-applies the allow-list in JS — so the rows stayed right and only the **limit** was wrong. The
failure that hid there is concrete: a destination outage writes one excluded row per undelivered
event, a page of those consumes the limit, and the rail renders *"Nothing recorded on this project
recently"* while real activity sits one row below the cut.

**A tooling gate can fail closed and look like a policy.** `agy-doctor.mjs` reported all three
configured models as `NOT LISTED` and refused to bless the pin — while `agy models` was listing
every one of them. agy 1.1.11 had added a `\t<Human Label>` column and a `Fetching…` preamble, and
the parser kept whole lines. The review layer was blocked on a live epic by a cosmetic CLI change.
It cost one PR (#74) to fix, and the parse is now pinned by a test.

**Stacked PRs die when their base branch is deleted.** Merging #71 with `--delete-branch`
auto-**closed** #72, and GitHub will not reopen or retarget a PR closed that way. #72's review
record — two cross-family rounds and the responses — is still the authoritative one for Sprint 2;
#75 exists only to carry the same diff to `main` and links back to it. Merge a stack **without**
`--delete-branch` until the last one, or retarget each PR to `main` before merging the one below.

## Gaps / follow-ups

**Owed to the product owner:**

- **`AGENT_RAIL_ENABLED` does not exist in Vercel.** Absent reads as OFF (exact `=== 'true'`), so
  the polarity is correct and the rail is dark in production right now — but the DoD's *"exists in
  every env with the stated polarity"* line is not literally satisfied. Creating it born `false` is
  pre-authorized; **flipping it ON in production is a separate decision and needs its own deployment**
  (Vercel snapshots env vars at build time — AGENTS rule #4). Verify by exercising the rail, never
  by `vercel env ls`.
- **The production smoke walkthroughs have not been run.** Every sprint's walkthrough was exercised
  against a local server with a real database and a real signed-in session, and the authed browser
  suite passes 14/14 — but nobody has opened `golden-beans-gamma.vercel.app` and read the pages.

**Known and deliberate:**

- **No agent strip on Command Center.** D6 promised one; Sprint 3 shipped without it, because the
  rail already answers *what did my agent do* on every `/app` route including that one, and a second
  copy would be two devices for one promise (D5). Recorded as dated **Amendment 1** on the epic
  README rather than silently reinterpreted.
- **Pending proposals are task-scoped** (D8), because `task_write_confirmations.task_id` is
  `NOT NULL REFERENCES tasks(id)` and that is all the table models. Generalising the mechanic is P2.
- **The rail's pending list is legitimately empty in production**, because `CONNECTOR_WRITES_ENABLED`
  has never been ON there. The copy says what it covers rather than implying otherwise.

**Coverage stated rather than implied:**

- The rail's `catch`-to-null on a *throwing* read has **no spec** — the failure needs a broken
  service-role client, which the harness cannot produce without breaking every other spec in the run.
- The 72px section-padding fix has **no assertion**. It was found by eye and could regress by eye.

**Review layer, for the record:** Codex was out of quota for the whole epic (until Aug 8) and vibe
hit turn limits mid-review twice. Every PR still got a cross-family pass plus the mandatory
fresh-reviewer subagent, and every PR ended on a **clean** round — Sprint 3 took four. The
fresh-reviewer pass alone produced nine real findings after two external rounds had already run,
which is the strongest argument yet for keeping context independence mandatory on HIGH tier.

The retro prose rail (`scripts/prose-draft.mjs`) was rate-limited at close, so this was written by
the coordinating agent rather than the dedicated writer.
