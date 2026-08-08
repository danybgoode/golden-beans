---
title: "Component-kit adoption sweep — bring the remaining /app routes onto the design system"
slug: app-component-kit-adoption
status: scaffolded
area: "02"
type: chore
priority: "wave-2026-08-08"
appetite: M
underwritten_by: "Roadmap/bets/wave-2026-08-08.md"
risk: low
epic: "02-commercial/app-component-kit-adoption"
build_order: 13
updated: 2026-08-08
---

# Pitch — Component-kit adoption sweep

> **Class:** Chore · **Archetype:** Sweeper · **Lane:** fixed scope
> **Source:** `Roadmap/00-ideas/audits/app-ux-audit-2026-08-01.md` §2.2, §6.7, §7 (P0).
> **Verified against live `main`, 2026-08-08** — see *What already exists*.

## Problem

A PM opens Flags, then Scenarios, then Impact, and has to re-learn the page each time. There is no
card, no stat, no sortable table, no form section — only "a list" and "a table," styled by generic
tag selectors in `globals.css`. An analytics funnel, a security exercise and a webhook destination
all render as an `<h1>` plus a `<table>`. The styling technique is why the product looks consistent
rather than chaotic, but consistency of *paint* is not consistency of *meaning*: nothing on the
screen tells the PM which numbers are the headline, which row is actionable, or which button is the
one they cannot undo.

`app-shell-and-agent-rail` deliberately displaced this, and was right to — a PM who cannot see what
their agent did is not helped by consistently-styled tables of the same illegible data. That bet has
now shipped, and it changed the economics of this one: the kit went from 1 component to 9, and the
drift guard now walks the directories the new primitives live in. **The sweep is now the cheap
follow-through on work already paid for, and it is the thing standing between the next two epics and
having to invent their own primitives.**

## Appetite

**M — one wave.** Fixed appetite, variable scope: M buys the two missing primitives plus adoption
across the routes that carry the most PM decision-weight. It explicitly does **not** buy "all 24
remaining routes." If the sweep stalls, the circuit breaker is to ship the primitives and the routes
converted so far, and let the rest accrete behind the drift guard — a half-swept app on a guarded
kit is a fine resting state; a half-built `DataTable` is not.

## Outcome & signal

**What's true after:** a PM can look at any `/app` route and read the same visual grammar — headline
numbers as `StatCard`, tabular data as one `DataTable` with the same sort/filter/empty affordances,
and every irreversible action behind the same confirmation dialog that names what it will stop.

**How the product owner tests it:** open three converted routes in sequence and try to find a
control that behaves differently from its equivalent on the other two. Then click a destructive
action and confirm the dialog names the specific thing being destroyed, not "this item."

## Stage-2.5 bucket

**Light enhancement, at scale.** No new capability, no new data. Every route already renders the
right information; this changes the components it renders *through*. Named as a chore precisely so
it does not get argued about as a feature.

## Bill of materials (What / Why)

| What | Why |
|---|---|
| `DataTable` in `components/ui` — sort, filter, empty state, built once | 20+ bespoke `<table>` blocks; the empty state is missing on most, so a new project looks broken rather than new |
| `ConfirmDialog` in `components/ui` | Named as a requirement in `references/ux-guidelines.md` and never built. Revoke, kill-switch and deactivate currently fire on one click |
| `FormSection` / `Field` | Every manager component hand-rolls label + input + error. This is where the Flags rule builder (#15) would otherwise start from zero |
| Route conversion, highest decision-weight first | Flags, Scenarios, Experiments, Impact — the four a PM actually operates. The rest accrete |
| One `design-system.authed.spec.ts` assertion per converted route | The spec file already exists; adoption without a spec is adoption that silently reverts |

## Scope

**In v1:** `DataTable`, `ConfirmDialog`, `FormSection`/`Field` added to `components/ui`. Conversion
of the manager + page files for **flags, scenarios, experiments, impact, destinations, keys,
agent-keys** (the owner-operated surfaces). `ConfirmDialog` wired to every currently-unconfirmed
destructive action on those routes. Drift-guard coverage confirmed over the new components.

**Out of v1 (no-gos):**
- **No visual redesign.** Same information, same layout, same tokens — different components. A
  route that looks different after conversion is a bug in the conversion.
- **No charts.** That is #14's decision to make and #15/#16's work to spend. A `DataTable` that
  grows a sparkline column here would pre-empt a dependency call we have not made.
- **No `RuleBuilderRow`.** It belongs to `flags-visual-rule-builder` (#15), where it earns its
  design against the real clause schema. Building it speculatively here is how it ends up wrong.
- **No `globals.css` teardown.** The generic tag selectors stay until the *last* route is converted;
  removing them mid-sweep breaks every unconverted route at once.
- **No route behaviour change.** Sweeper acceptance: less code, same behaviour, no regressions.

## Rabbit holes

- **`DataTable` generality.** The trap is building a table abstraction rich enough for all 20 call
  sites before converting any of them. Convert **two** routes with a deliberately thin table, then
  generalise from the friction — not from imagination.
- **Server vs client components.** Most `/app` pages are server components; sort/filter state is
  client. `DataTable` must be a client island that receives already-fetched rows, never a component
  that fetches. Getting this backwards turns a styling chore into a data-fetching refactor.
- **`ConfirmDialog` and the agent rail.** The rail's pending-proposal actions already have their own
  confirm affordance from `app-shell-and-agent-rail`. Do **not** re-wrap them — check
  `components/product/AgentRail.tsx` first. Two confirmation patterns is worse than one plus a gap.
- **Scenarios has six tables on one page.** Converting it is disproportionately expensive and #16
  is going to rewrite that page anyway. Convert it **last**, or accept it as the deliberate carry-over.

## What already exists (reuse, don't rebuild)

*Verified against live `main`, 2026-08-08.*

| Need | Already in the repo | What's actually missing |
|---|---|---|
| The component kit | `components/ui/` — **9 components**: `ActivityFeedItem`, `AgentWindow`, `Badge`, `Button`, `FunnelBars`, `Icon`, `Panel`, `SectionDivider`, `StatCard` | `DataTable`, `ConfirmDialog`, `FormSection`/`Field`. The audit's "1 of 26" is now **2 of 26** consuming routes (`onboarding`, `tasks/task-queue.tsx`) against a **9-component** kit — the kit grew, adoption did not |
| Shell + rail primitives | `components/product/` — `AgentRail`, `CommandCenter`, `ProductShell`, `RailDisclosure` | Nothing. Converted routes render *inside* `ProductShell`; they do not re-declare chrome |
| The drift guard | `scripts/check-design-drift.mjs` — `SWEPT_ROOTS` now covers `apps/web/app`, **`apps/web/components/ui` and `apps/web/components/product`** (added by `app-shell-and-agent-rail`) | Nothing. The sweep is guarded as it lands, exactly as the raw seed predicted |
| Design tokens | `references/design/assets/tokens.css`, imported first by `globals.css` (the guard asserts the import) | Nothing. No raw hex — the guard forbids it in `apps/web/app` |
| A conversion precedent | `app/app/tasks/[projectSlug]/task-queue.tsx` and `app/app/onboarding/[projectSlug]/page.tsx` | Nothing. These two are the worked pattern; read them before converting the third |
| A UI spec home | `e2e/design-system.authed.spec.ts`, `e2e/design-system.browser.spec.ts` | One assertion per newly-converted route |
| Confirmation guidance | `references/ux-guidelines.md` names `ConfirmDialog` as a requirement | The component |

**Route inventory:** 26 `.tsx` files under `apps/web/app/app`; 2 consume `components/ui`. The
remaining 24 split into 7 owner-operated surfaces (in scope) and 17 detail/leaf files (accrete).

## UX heuristics & rails check

- **CI guards covering this surface:** `npm run check:design-drift` (raw-hex ban + token-import
  assertion, over `app`, `components/ui`, `components/product`); `npm run typecheck` across four
  projects; the `api` Playwright project as the deterministic gate.
- **Audits-lens findings that apply:** app-ux-audit-2026-08-01 §2.2 (2-of-26 adoption), §6.7 (the
  missing-components list this pitch implements), §7 P0.
- **Design-language debt:** generic tag selectors in `globals.css` doing component-level work; no
  empty state on most tables; destructive actions without confirmation. The first is paid down only
  when the sweep completes — explicitly *not* in this appetite.

## Acceptance criteria

1. `DataTable`, `ConfirmDialog` and `FormSection`/`Field` exist in `components/ui`, and
   `check:design-drift` passes over them.
2. Each of the seven named routes renders its tabular data through `DataTable` and its forms through
   `FormSection`/`Field`, with **no visible change to the information shown**.
3. Every destructive action on those routes (revoke, deactivate, kill, delete) opens `ConfirmDialog`,
   and the dialog names the specific object by key or label.
4. Each converted route's empty state renders a sentence a new PM can act on — not a blank table body.
5. `design-system.authed.spec.ts` has one added assertion per converted route, and each was observed
   failing before the conversion landed.
6. No route lost a capability: the sweep is verified by diffing behaviour, not by the build passing.

## Open risks / research

- **Risk: the sweep reveals real bugs.** Converting a hand-rolled table to a shared one routinely
  surfaces columns that were never sortable, states that were never handled. Those are findings, not
  scope — log them as new seeds; do not fix them inside the sweep.
- **Risk: it un-blocks nothing if it lands late.** #15 and #16 both consume `ConfirmDialog` and
  `FormSection`. If this slips, they either wait or build their own — and the second outcome is the
  expensive one. **Ship the three primitives first, as their own sprint, before any route conversion.**
