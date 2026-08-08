---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
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

*Verified against live `main`, 2026-08-08.*

| Need | Already in the repo | What's actually missing |
|---|---|---|
| The component kit | `components/ui/` — 9 components: `ActivityFeedItem`, `AgentWindow`, `Badge`, `Button`, `FunnelBars`, `Icon`, `Panel`, `SectionDivider`, `StatCard` | `DataTable`, `ConfirmDialog`, `FormSection`/`Field` — **all of Sprint 1** |
| Page chrome | `components/product/` — `ProductShell`, `CommandCenter`, `AgentRail`, `RailDisclosure` | Nothing. Converted routes render *inside* `ProductShell` and do not re-declare chrome |
| The drift guard | `scripts/check-design-drift.mjs` — `SWEPT_ROOTS` covers `apps/web/app`, `apps/web/components/ui`, `apps/web/components/product` | Nothing. The sweep is guarded as it lands (D4) |
| Design tokens | `references/design/assets/tokens.css`, imported first by `apps/web/app/globals.css`; the guard asserts that import | Nothing. Raw hex is already banned in all three swept roots |
| A conversion precedent | `app/app/onboarding/[projectSlug]/page.tsx` and `app/app/tasks/[projectSlug]/task-queue.tsx` — the only two consumers today | Nothing. **Read both before converting a third** |
| Confirmation guidance | `references/ux-guidelines.md` names `ConfirmDialog` as a requirement | The component. It has been a documented requirement and never built |
| Spec home | `e2e/design-system.authed.spec.ts`, `e2e/design-system.browser.spec.ts` | One assertion per converted route |
| An existing confirm affordance | `components/product/AgentRail.tsx` — pending-proposal actions already confirm | Nothing — and it must **not** be re-wrapped (D5) |

## Architecture decisions — locked before any builder starts

*To be verified against live `main` by the architect at kickoff, not inherited from this doc.
Builders **cite** these; they do not re-derive them.*

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

**D5 — The agent rail's existing confirmation is not re-wrapped.**
`AgentRail.tsx` already has a confirm affordance for pending proposals. `ConfirmDialog` is for the
seven owner-operated routes. Two confirmation patterns is a worse outcome than one plus a known gap;
if they should converge, that is a follow-up seed with its own reasoning.

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
