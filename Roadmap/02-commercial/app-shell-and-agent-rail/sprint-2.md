# App shell and agent rail — Sprint 2: The agent rail

**Status:** ✅ complete — `87f2948` (2.1) · `8ba7438` (2.2 + 2.3) · `36c4e69` (QA)

> **Build contract (locked by the architect before the builder started).** Binding: **D4** (caption
> it *recent activity*, never a complete ledger), **D5** (extract `ActivityFeedItem`; refactor the
> three landing callers onto it in THIS sprint), **D6** (`AGENT_RAIL_ENABLED`, born OFF, does not
> gate the nav), **D7** (`Icon`, never a raw glyph), **D8** (pending list is task-scoped and says so).
>
> **Branch stacks on Sprint 1** — `feat/app-shell-and-agent-rail-s2`, cut from the S1 branch, not
> from `main`. Sprints in one epic share hot files by construction; siblings cut off one base pay a
> per-merge conflict tax.
>
> **This sprint reads seams S1 built. It adds no new query.** If a read you need isn't in
> `agent-activity.ts` / `pending-confirmations.ts`, that is a raised hand — extend the S1 seam with
> its tenancy discipline intact, never issue a query from a component.

## Stories

### Story 2.1 — extract `ActivityFeedItem` and put the landing on it
**As a** builder, **I want** one tool-call line component, **so that** the product and the landing
page cannot drift into two different devices for the same brand promise.
**Acceptance:** `components/ui/ActivityFeedItem.tsx` renders actor · action · target · relative
time; `Hero`, `InvertedLoopSection` and `LiveProofSection` render through it; the landing looks
unchanged (compare screenshots before/after); `npm run check:design-drift` passes with the S1
coverage extension in place.
**Risk:** low
**Notes:** `AgentWindow` stays as-is — it is the 28-line frame, and it keeps taking `{children}`.
This story extracts the *contents* the three callers currently hand-roll. Per D7 the `⚙`/`▸` glyphs
become `Icon` usages; do not disable the pictograph rule to keep them.

### Story 2.2 — the rail, behind `AGENT_RAIL_ENABLED`
**As a** PM, **I want** to see what my agent has been doing without reading JSON, **so that** I can
tell at a glance whether anything happened that I should know about.
**Acceptance:** with the flag unset or `false`, no rail renders anywhere and every `/app` route is
byte-identical to today (dark spec); with it `true`, a real audit row renders as one plain-language
line, correctly attributed agent-vs-human; the panel is collapsible on desktop and a pull-up sheet
on mobile; **its heading and empty state say "recent activity", and nowhere claims completeness.**
**Risk:** high
**Notes:** D4 makes the copy an acceptance criterion, not polish. Add `e2e/agent-rail-dark.spec.ts`
alongside `flag-serving-dark.spec.ts` / `scenario-dark.spec.ts` / `journey-dark.spec.ts` — the
established sibling pattern for a born-OFF gate.

### Story 2.3 — pending agent proposals
**As a** PM, **I want** to see what my agent is waiting on me for, **so that** I can validate or
override it instead of discovering it later.
**Acceptance:** a staged, unspent confirmation for my project appears in the rail with its task, its
action and the parameters frozen at propose time; a confirmation for another project never appears;
the section names what it covers (task actions) rather than implying every pending agent action;
spending still happens through the agent's own path — **the rail never calls
`consume_write_confirmation`**.
**Risk:** high
**Notes:** `CONNECTOR_WRITES_ENABLED` has never been ON in production, so this list is legitimately
empty there. Seed a confirmation against a disposable test project to exercise it, and clean up
after. Per D8, do not invent a generalised "proposal" abstraction over a table that only models task
writes — that is P2.

## Sprint QA
- **api spec(s):** 2.2 → `e2e/agent-rail-dark.spec.ts` (flag OFF ⇒ absent). 2.3 → extend
  `e2e/agent-activity.spec.ts` with the confirmation isolation case.
- **browser smoke owed:** yes, one — the rail's rendered collapse/expand and the mobile sheet are
  client-island behaviour an API spec can't see. `design-system.browser.spec.ts` is the existing
  home for this and works anonymously; the authed variant reads test-account secrets and skips
  gracefully when unset.
- **deterministic gate:** as Sprint 1 — CI's own npm scripts, in CI's order.
- **mutation check:** break the flag polarity (make the rail render when the gate is OFF), confirm
  the dark spec goes red, revert, re-verify clean. A dark spec that passes against a broken gate is
  the exact false-positive this repo has been burned by.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: the branch preview (pre-merge) · production once merged and the flag flipped

1. With `AGENT_RAIL_ENABLED` unset, sign in and open any `/app` route.
   → No rail anywhere. The section nav from Sprint 1 is still fully present.
2. Set `AGENT_RAIL_ENABLED=true` **and deploy** (a commit to `main` — Vercel snapshots env vars at
   build time, so setting the var alone changes nothing). Reload `/app`.
   → The rail appears, headed as recent activity.
3. Do something that writes an audit row — mint then revoke a test API key on the Keys page.
   → Both actions appear in the rail as plain-language lines, attributed to you (human), newest
     first. Neither line claims to be part of a complete record.
4. Collapse the rail, reload the page, open a different `/app` route.
   → The rail is present on every route and its collapsed state is not jarring between navigations.
5. On a phone width, open the rail.
   → It presents as a pull-up sheet, not a squeezed desktop rail; no horizontal overflow.
6. Sign in as a member of a different project.
   → The rail shows that project's activity only.

If any step fails, note the step number + what you saw — that's the bug report.

## Sprint 2 — what actually happened

**The dark spec cannot be what this sprint's brief assumed, and says so out loud.** The rail renders
on signed-in `/app` routes only. The always-on `api` project has no session, so with the gate ON
*or* OFF an anonymous request sees no rail — there is no resolved membership to render one for. A
spec asserting "absent while dark" there would pass for the wrong reason and would keep passing if
the flag were hardwired to `true`. The work is split four ways instead:

| Property | Where |
|---|---|
| Flag polarity (born OFF, exact `=== 'true'`, near-miss matrix) | `lib/flags.test.ts` — added to the SHARED table so it inherits the whole matrix |
| The render decision | `lib/agent-rail-visibility.ts` + its unit test — **mutation-checked** |
| The anonymous boundary (a real security property, genuinely reachable) | `e2e/agent-rail-dark.spec.ts` |
| Rendered behaviour, copy, geometry | `e2e/agent-rail.authed.spec.ts` (opt-in) |

**Mutation check:** making `shouldRenderAgentRail` ignore the gate turns BOTH the unit test and
`e2e/agent-rail-dark.spec.ts` red. Restored, re-verified green.

**Two existing authed specs went red, and both were real.** `design-system.authed` asserted the
static "Engine ready" pill, which for a signed-in member is now the project the nav is showing —
updated to assert the stronger thing. `project-navigation.authed` hit a strict-mode violation
because `/app` now has two links to the task queue (the inventory link and the rail's shortcut); the
ambiguity was in the locator, so it got `exact: true` rather than renaming a legitimate entry point.

**Two layout defects were found by LOOKING at a screenshot, not by an assertion.** The fixed rail
sat on top of the project card from ~1080px (the page reserved the rail's width but not the gutter
it is inset by — now one custom property feeds both), and `tokens.css`' `section { padding: 36px 0 }`
opened 72px of dead air per rail section. The overlap now has a geometry assertion; the padding does
not. **A UI sprint needs someone to open the page.** That is the durable lesson.

**Story 2.1 was delegated** to a Sonnet-tier agent against a locked component API and a file
allow-list, and verified here by diffing the tree — a clean 1:1 extraction, zero `▸` left.

**Gate:** unit 883 · typecheck · lint · build · `check:design-drift` (70 files) · api **435 passed /
36 skipped / 0 failed** (rail flag unset, as CI runs it) · authed **14/14** with
`AGENT_RAIL_ENABLED=true`.

