---
title: "Component-kit adoption sweep — bring the remaining /app routes onto the design system"
slug: app-component-kit-adoption
status: raw
area: "02"
type: chore
priority: null
appetite: null
underwritten_by: null
risk: low
epic: null
build_order: null
updated: 2026-08-05
---

# Seed — pay down the styling debt behind the shell

**Raw. Not shaped.** Fixed-scope lane when it is picked up — a chore, not a shaped bet.

**Source:** `Roadmap/00-ideas/audits/app-ux-audit-2026-08-01.md` §2.2, §6.7, §7 (P0).

## The idea in one paragraph

**2 of 26** route files under `apps/web/app/app` consume `components/ui` (`onboarding`, and
`tasks/task-queue.tsx`). Every other route is raw semantic HTML styled through generic tag selectors
in `globals.css`. That technique is why the product is visually consistent rather than chaotic — but
it means there is no notion of a card, a stat, a sortable data table, or a form section, only "a
list" and "a table." An analytics funnel, a security exercise and a webhook destination all render
as an `<h1>` plus a `<table>`.

## Why this is a chore and not part of the P0 bet

`app-shell-and-agent-rail` deliberately displaced this. A PM who cannot see what their agent did is
not helped by consistently-styled tables of the same illegible data. The say-do gap is the expensive
problem; this is incremental debt that can be paid down route by route behind it — and it gets
cheaper once that bet has added `StatCard`, `ActivityFeedItem` and `FunnelBars` to the kit.

## Also missing from the kit (audit §6.7)

- `ConfirmDialog` for destructive/hard-to-reverse actions (revoke, kill switch, deactivate) — already
  named as a requirement in `references/ux-guidelines.md`, never built.
- `DataTable` with sort/filter/empty-state built once, instead of a bespoke `<table>` per page.
- `RuleBuilderRow` — but that belongs to `flags-visual-rule-builder`, which is where it earns its
  design.

## Rail note

`check-design-drift` already walks all of `apps/web/app`, so this sweep is guarded as it lands. If
`app-shell-and-agent-rail` ships first, the guard will also cover `components/ui` and
`components/product` by then.
