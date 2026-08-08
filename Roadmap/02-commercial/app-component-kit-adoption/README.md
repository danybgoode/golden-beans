---
status: in-progress   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: app-component-kit-adoption
build_order: 13
---

# Epic: Component-kit adoption sweep — bring the remaining /app routes onto the design system

> **Area:** 02-commercial · **Risk:** low · **Class:** Chore · **Archetype:** Sweeper · **Scope seed:** [`00-ideas/seeds/app-component-kit-adoption.md`](../../00-ideas/seeds/app-component-kit-adoption.md)
> **Appetite:** M (one wave) · **Underwritten by:** [`bets/wave-2026-08-08.md`](../../bets/wave-2026-08-08.md)
> **Audit:** [`00-ideas/audits/app-ux-audit-2026-08-01.md`](../../00-ideas/audits/app-ux-audit-2026-08-01.md) — §2.2, §6.7, §7 (P0).

## Why

A PM opens Flags, then Scenarios, then Impact, and has to re-learn the page each time. There is no
card, no stat, no sortable table, no form section — only "a list" and "a table." The paint is
consistent; the *meaning* is not. Nothing on screen says which number is the headline, which row is
actionable, or which button cannot be undone.

`app-shell-and-agent-rail` shipped a nine-component kit and a shell to render it in. Adoption did
not follow: **2 of 26** route files under `apps/web/app/app` consume `components/ui`. This epic
closes that gap for the seven surfaces a PM actually operates, and — the part that makes it urgent
rather than tidy — ships the three primitives that the next two epics both need. Without them,
`flags-visual-rule-builder` and `scenarios-pm-operable` each build half a confirmation dialog and
half a form system, in two different shapes, and the product owner reviews both.

## Platform-first note

**Nothing new is modelled.** No new data, no new route, no new `lib/` seam, no new runtime
dependency. Every route already fetches and renders the right information; this epic changes the
components it renders *through*. Sweeper acceptance applies throughout: **less code, same behaviour,
no regressions.** A route that displays different information after conversion is a bug in the
conversion, not a feature.

## What already exists (reuse, don't rebuild)

*Written at grooming. **Re-verified against live `main` (`aead6bf`) by the architect at kickoff,
2026-08-08** — two rows were wrong and are corrected in place, struck through, with the reasoning.*

| Need | Already in the repo | What's actually missing |
|---|---|---|
| The component kit | `components/ui/` — 9 components: `ActivityFeedItem`, `AgentWindow`, `Badge`, `Button`, `FunnelBars`, `Icon`, `Panel`, `SectionDivider`, `StatCard` | `DataTable`, `ConfirmDialog`, `FormSection`/`Field` — **all of Sprint 1** |
| Page chrome | `components/product/` — `ProductShell`, `CommandCenter`, `AgentRail`, `RailDisclosure` | Nothing. Converted routes render *inside* `ProductShell` and do not re-declare chrome |
| The drift guard | `scripts/check-design-drift.mjs` — `SWEPT_ROOTS` covers `apps/web/app`, `apps/web/components/ui`, `apps/web/components/product` | Nothing. The sweep is guarded as it lands (D4) |
| Design tokens | `references/design/assets/tokens.css`, imported first by `apps/web/app/globals.css`; the guard asserts that import | Nothing — but tokens.css is a **byte-mirrored handoff artifact** and must not be edited. See **D8** |
| A conversion precedent | `app/app/onboarding/[projectSlug]/page.tsx` and `app/app/tasks/[projectSlug]/task-queue.tsx` — the only two consumers today (verified: 2 of 26 `.tsx` files under `app/app`) | Nothing. **Read both before converting a third.** Note both consume only `Icon`/`Panel` — neither is a table or form precedent |
| Confirmation guidance | `references/ux-guidelines.md` states the **requirement** — "a second, explicit confirmation naming what's about to happen and that it can't be undone — never a bare *Are you sure?*" — ~~names `ConfirmDialog`~~ | The component. The guidelines never name a component; they name the behaviour. Building `ConfirmDialog` is this epic's reading of that requirement, not a name it inherits |
| Spec home | `e2e/design-system.authed.spec.ts`, `e2e/design-system.browser.spec.ts` | One assertion per converted route — but see **D9**: `*.authed.spec.ts` is **not** in the deterministic gate |
| ~~An existing confirm affordance~~ **The actual pre-existing UI confirmation** | ~~`components/product/AgentRail.tsx` — pending-proposal actions already confirm~~ → **false.** `AgentRail.tsx` is a read-only server component with **zero interactive controls** (no `<button>`, no `onClick`, not `'use client'`). Its own header comment says so: *"It never calls `consume_write_confirmation` … The rail reads."* The real one is `destinations/[projectSlug]/destination-manager.tsx` — a two-click *"Click again to confirm"* on Remove | The convergence. See the corrected **D5** |
| Table / form / dialog styling | **Nothing.** `globals.css` and `tokens.css` contain no `table`, `th`, `td`, `form`, `label` or `dialog` rule; every `/app` table renders at browser defaults | The primitives ship their own classes (**D8**) |
| A UTC formatting seam | `lib/format-utc.ts` — fail-safe (`UNKNOWN_UTC_TIME` on unparseable input) | Nothing. Four managers (`keys`, `agent-keys`, `destinations`, `shares`) each carry a **private, weaker copy** that renders `Invalid Date`. Conversions import the seam (**D11**) |

## Architecture decisions — locked before any builder starts

*Verified against live `main` (`aead6bf`) by the architect at kickoff, 2026-08-08 — not inherited
from this doc. Builders **cite** these; they do not re-derive them. D1–D4, D6 and D7 survived
verification unchanged. **D5 was found to rest on a false premise and is rewritten below.** D8–D11
are new: each records something the live code says that the grooming docs did not.*

**D1 — Sprint 1 ships the three primitives and nothing else, and it merges before Sprint 2 starts.**
Two downstream epics consume `ConfirmDialog` and `FormSection`. If this sweep stalls mid-wave, the
primitives must already exist on `main`. This is the one ordering constraint the epic cannot trade.

**D2 — `DataTable` is a client island that receives rows; it never fetches.**
Most `/app` pages are server components; sort/filter state is client-side. A `DataTable` that fetches
turns a styling chore into a data-fetching refactor and crosses a tenancy boundary this epic has no
business touching. Rows are resolved server-side through the existing `lib/dashboard-auth.ts` path
and passed down.

**D3 — Generalise from two conversions, not from imagination.**
Convert two routes with a deliberately thin table before adding a single option to `DataTable`'s
API. The failure mode is a table abstraction rich enough for 20 call sites and right for none.

**D4 — No `globals.css` teardown in this epic.**
The generic tag selectors stay until the *last* route is converted. Removing them mid-sweep breaks
every unconverted route simultaneously. The debt is paid when the sweep completes — which is
explicitly beyond this appetite.

**D5 (CORRECTED at kickoff) — the rail has no confirmation to preserve; the pattern that must
converge is `destinations`'s two-click Remove.**

The grooming premise — *"`AgentRail.tsx` already has a confirm affordance for pending proposals"* —
is false, and I checked the file rather than the sentence. `AgentRail.tsx` is an `async` server
component with no `'use client'`, no `<button>` and no `onClick`. What it renders is a **read-only
list** of staged agent proposals; the proposal is spent by the *agent* calling
`consume_write_confirmation` under its own credential, on its own path. The file's header comment
states the boundary explicitly: *"It never calls `consume_write_confirmation`. Reading a proposal
here does not spend it … The rail reads."*

So the original D5 protected a component that cannot be re-wrapped, because there is nothing on it
to wrap. What it should have protected is the distinction, and one it missed entirely:

1. **The staged-write ledger is not a UI confirmation and `ConfirmDialog` is never wired to it.**
   A `task_write_confirmations` row is a *durable authorization record* consumed by an agent across
   sessions; a `ConfirmDialog` is a *transient in-page question* asked of the human at click time.
   They answer different questions for different actors. The rail keeps its read-only list. This is
   the true content of D5 and it stands.
2. **`destination-manager.tsx` already ships an in-UI confirmation** — a two-click
   *"Click again to confirm"* on Remove, with a consequence sentence, added by Codex cross-review
   round 12. Its comment records the reasoning we would otherwise rediscover: *"An in-UI confirm
   rather than `window.confirm`: a browser dialog blocks the page and the automation harness."*
   **Sprint 3 replaces it with `ConfirmDialog` rather than adding a second pattern beside it.**
   Leaving it would ship exactly the two-patterns-for-one-job outcome the original D5 was written to
   avoid — it just named the wrong file. `window.confirm` remains banned, for the reason already
   recorded there.

**D8 — new CSS lands in `apps/web/app/globals.css`, and only there; the primitives ship their own
classes.**
Two verified facts force this. First, `references/design/assets/tokens.css` is one half of a
**byte-identical handoff mirror** that `check-design-drift.mjs` enforces against
`references/golden-beans-design-system-proposal/` — editing it fails the guard, so tokens are
consumed, never extended. Second, there is **no table, form or dialog styling anywhere in the
codebase**: every `/app` table today renders at browser defaults. The epic's "the paint is
consistent; the *meaning* is not" therefore understates it — for tables there is no paint either.
Adding `.data-table*`, `.confirm-dialog*` and `.form-section*` classes is **additive** and is not
the `globals.css` teardown D4 forbids; D4 bans *removing* the generic tag selectors mid-sweep.

**D9 — the deterministic gate is `typecheck + lint + build + test:unit + Playwright api +
check:design-drift`. `design-system.authed.spec.ts` is NOT part of it, and the sprint docs calling it
an "api spec" is wrong.**
`playwright.config.ts` gives the `api` project `testIgnore: /.*\.(browser|authed)\.spec\.ts/` — the
authed rail is an opt-in Chromium project depending on `auth-setup`, deliberately outside the
blocking gate. Three consequences, and builders follow all three:
- Assertions about **rendered** behaviour (sort, filter, focus trap, `Esc`) go in
  `design-system.authed.spec.ts` and are **run locally against local Supabase** and observed
  failing. They are real coverage, and per WAYS-OF-WORKING they *discharge* a browser smoke
  otherwise owed to the product owner — they are simply not the merge gate.
- The **gate-eligible** part of `DataTable` is its sort/filter logic, extracted to
  `apps/web/lib/data-table.ts` and unit-tested (`npm run test:unit` already globs
  `apps/web/lib/**/*.test.ts`). Free coverage, no browser, blocking.
- **Behaviour parity is proven by the routes' existing specs passing unchanged** — `api-keys`,
  `destinations`, `experiments`, `flag-serving`, `experiment-decisions`. A spec that needs editing
  to survive a conversion is a behaviour change: stop and report it.

**D10 — routing: the architect builds this epic inline; the review layer is external.**
Recorded so the choice is auditable. Every story here is a presentation refactor over one locked
contract, in files that overlap heavily (four managers, one `globals.css`, one spec file) — the
shared-surface condition under which WAYS-OF-WORKING says the architect works first and alone. Fan-
out would buy parallelism the file layout cannot use, and pay the verification tax LEARNINGS records
(a subagent's final message is not evidence; one left a security mutation in the tree). Judgment
independence is bought where it actually pays: **two cross-family external passes per PR**, routed
by `scripts/review-route.mjs`, never hand-picked. Risk tier is LOW throughout, so per the updated
policy no reviewer subagent is spawned on top.

**D11 — the conversions delete four private `formatUtc` copies and import `lib/format-utc.ts`.**
`keys`, `agent-keys`, `destinations` and `shares` each carry a private four-line copy that predates
the seam. They are not merely duplicated, they are **worse**: each does
`new Date(iso).toISOString()`, which throws `RangeError` on an unparseable timestamp, while the seam
returns `UNKNOWN_UTC_TIME`. Importing it is both the "less code" half of Sweeper acceptance and a
real robustness fix — and it is behaviour-preserving on every valid timestamp, which is every row
these routes have. `shares` is not otherwise in scope (see the carry-over list) and is **not**
touched.

**D6 — Scenarios is converted LAST, or not at all.**
`app/app/scenarios/[projectSlug]/page.tsx` is 287 lines with six stacked tables, and
`scenarios-pm-operable` (#16) rewrites that page. Converting then rewriting is paid-for work thrown
away. Treat it as the deliberate carry-over and say so in the PR.

**D7 — Every new limit or constant is read, never hardcoded.**
Applies weakly here and strongly downstream; stated so the habit starts in this epic.

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | The three missing primitives | low |
| 2 | Convert the owner-operated routes | low |
| 3 | Confirm every destructive action | low |

## Deploy order

Frontend-only; no migration, no backend change, no flag. **Sprint 1 merges first and alone** (D1).
Sprints 2 and 3 stack behind it — `feat/app-component-kit-adoption` → `-s2` → `-s3`, one PR per
sprint, merged in order (WAYS-OF-WORKING → *Stack the branches*).

**No kill-switch.** Carve-out reason: this epic adds no runtime seam and changes no behaviour — it
is a presentation refactor of already-gated surfaces. Each converted route keeps whatever gate it
already had. Risk tier is low throughout; the reviewer may auto-merge on a green gate and a clean
review.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch:** n/a — carve-out recorded above (no runtime seam; presentation only)
- [ ] **Carry-over stated:** which routes were *not* converted, named individually, so the remaining
      debt is a list rather than a feeling
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
