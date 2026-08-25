---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: flags-console-parity
build_order: null    # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: The flag console a human can operate — Flagsmith-grade IA, terminology and list ergonomics

> **Area:** 01-growth-engine · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/flags-console-parity.md`](../../00-ideas/seeds/flags-console-parity.md)
> **Appetite:** M (one wave) · **Underwritten by:** _null — not yet bet_
> **Audit:** [`00-ideas/audits/app-ux-audit-2026-08-01.md`](../../00-ideas/audits/app-ux-audit-2026-08-01.md) — §0, §1, §2.4, §3.3, §6.3, §6.7, §7 (P1).
> **Builds on:** `flags-visual-rule-builder` (#15) — its builder, diff, rollout bar and preview are moved, not rewritten.

## Why

`/app/flags/[projectSlug]` renders the engine's shape rather than the operator's job: one page
stacking a JSON authoring textarea, three credential-minting forms, an `<article>` per flag (each
with its own rule builder, insight block, preview and version table), then three more tables. At
Miyagi Sánchez's ~42 definitions nobody reaches the bottom, and the vocabulary — *immutable
definition version*, *activation*, *snapshot revision*, *mint a scoped snapshot key* — describes
storage, not work.

This epic buys **information architecture, list ergonomics and language**. It buys no new flag
capability, because there is none missing: the visual rule builder, rollout bars, plain-language
version diff and preview-as-a-user all shipped in `flags-visual-rule-builder` and
`FLAG_RULE_BUILDER_ENABLED=true` has been live in Production and Preview since **2026-08-10**.

The target design language is **Flagsmith's**, deliberately — parity before innovation, on a
vocabulary and IA already tested and validated at scale.

**The outcome, stated as the test it must pass.** During this epic's groom the product owner was
given a correct, evidenced explanation of which Miyagi Sánchez flags were on and why three were not,
and answered: *"I didn't understand the explanation… perhaps after the UX/UI work I will."* Answering
that question today takes three paragraphs of SQL archaeology across two repositories. **When this
epic is done it takes one screen, and that explanation becomes unnecessary.**

## Platform-first note

**Nothing new is modelled and no query is added.** The flag registry, its immutable versions, the
per-environment activations and the credential taxonomy all already exist and are already read by
this page through `getFlagRegistryView()`. This epic re-presents what that call returns and moves two
groups of controls to their own routes. The SQL, the wire contract, the snapshot semantics and the
write path are all untouched — the same A4 line `flags-visual-rule-builder` held.

Per AGENTS rule #1, every read stays on the existing `lib/` seams; per rule #2 nothing here is
public; the two new routes sit behind the same `requireProjectMembership` path as the current one.

## What already exists (reuse, don't rebuild)

**Golden — use directly:**
- `apps/web/lib/flag-registry.ts` → `getFlagRegistryView()` — every definition, version and
  per-environment activation. **The list needs no new query.**
- `apps/web/lib/flag-environment-view.ts` → `summariseFlagEnvironments()` — per-environment state and
  rollout reach; pure, unit-tested.
- `apps/web/lib/flag-definition-diff.ts` → `diffFlagDefinitions()` — the plain-language version diff.
- `apps/web/lib/data-table.ts` — pure `sortRows` / `filterRows` / `nextSortState` / `compareCellValues`
  (**no paginate** — see D4).
- `apps/web/components/ui/` — `DataTable`, `RolloutBar`, `StatCard`, `Badge`, `Panel`, `Icon`,
  `ConfirmDialog`, `FormSection`/`Field`.
- `app/app/flags/[projectSlug]/{rule-builder,flag-insight,flag-preview}.tsx` — **move, don't rewrite.**
- `apps/web/lib/project-route-inventory.ts` + `lib/shell-nav.ts` + `components/product/ProductShell.tsx`
  — the registration path for the two new routes.
- `apps/web/lib/flags.ts` — 16 existing `=== 'true'` gates (counted 2026-08-25); the new one goes here.
- `apps/web/lib/positioning.ts` — the precedent for one imported vocabulary module (D7).
- `apps/web/lib/dashboard-auth.ts` → `requireProjectMembership`, `lib/roles.ts` → `isOwner`.

**Miyagi Sánchez (`medusa-bonsai`) — port the semantics, never the file:**
- `apps/miyagisanchez/lib/flags-admin-view.ts` — `sortFlags` (five sorts, every branch tie-breaking
  alphabetically), `filterFlagsByQuery` (key **or** description), `filterFlagsByStatus`,
  `filterFlagsByPolarity`, `paginate` (clamps an out-of-range page instead of returning empty), and
  an allow-listed `URLSearchParams` builder. Framework-free on purpose so the math is gate-testable
  with zero DOM — the same constraint `lib/data-table.ts` was built under. **This shape has been
  running against this exact flag data since the `admin-flags-cleanup` chore.**
- `app/(shell)/admin/flags/FlagsFilterBar.tsx` — a zero-JS filter bar: status chips as `Link`s plus a
  plain GET `<form>`, URL-driven so filters are shareable, bookmarkable and survive a refresh, with
  the client bundle carrying only the toggle interactivity.
- ⚠️ **Both files are es-MX.** Golden is English-only by explicit policy (WAYS-OF-WORKING →
  Conventions → Language). **Copy the shape, never the copy.**

**Flagsmith — the reference IA** (product owner's own live dashboard, screenshots 2026-08-24): an
environment switcher above a left rail; a Features list with Search plus Tags/Value/Users/Groups/View/Sort
controls, a toggle and a kebab per row; an Edit Feature modal tabbed
Value · Segment Overrides · Identity Overrides · Usage · Health · History · Settings, carrying
Enabled, Value, *Compare across environments*, and Schedule Update / Update Feature Value.

## Decisions — ⚠️ NOT YET LOCKED

These are **groom-stage candidates**, derived from reading the code but **not** verified against live
data. Per WAYS-OF-WORKING §5 the architect locks `D1…Dn` against live code **and live data** before
any builder starts, and **the locking pass must disprove scope** — an acceptance criterion describing
a guard, table or flag state the live system doesn't have is fiction, and gets corrected out loud.
Two of this epic's own ancestors had a locked decision disproved this way (`app-component-kit-adoption`
D5; `flags-visual-rule-builder` D4/D5). Expect the same here.

| # | Candidate decision | What the lock pass must verify |
|---|---|---|
| D1 | The console reads only `getFlagRegistryView()`; no query is added. | That its return shape actually carries description, polarity and criticality for the list columns — **the seed assumes this and it is unconfirmed.** |
| D2 | List math lives in a new pure `lib/flag-list-view.ts`, unit-tested, ported from Miyagi Sánchez's semantics. | Whether it belongs there or as an extension of `lib/data-table.ts`. |
| D3 | The environment selector is flags-scoped; `ProductShell` is untouched. | Product owner's decision, 2026-08-25. Locked as scope, not architecture. |
| D4 | `DataTable` gains **no** pagination prop. | Its D3 comment forbids quiet prop growth. Either the list is a different component, or this becomes a written, argued exception. |
| D5 | Not every registry row is a Miyagi Sánchez static boolean. | Two disposable `breaker.*` proof flags from a 2026-07-29 circuit-breaker test sit in production, and definitions may carry non-empty `rules`. **Read the live registry.** |
| D6 | With `FLAG_CONSOLE_ENABLED` off, the page is byte-for-byte pre-epic. | The D6 promise `flags-visual-rule-builder` made and nearly broke over one CSS class. |
| D7 | One module owns every user-facing flag word (`lib/positioning.ts` pattern). | That no Flagsmith term is reused for a Golden concept that differs. |
| D8 | "Not created" is a distinct rendered state from "off". | Whether Golden's registry can even express "in a catalog but undefined" for a project other than Miyagi Sánchez. |

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `FLAG_CONSOLE_ENABLED`, created disabled in every environment | high |
| 1 | 1.2 Pure list math in `lib/flag-list-view.ts`, gate-tested | low |
| 1 | 1.3 One feature list — search · filters · sort · pagination, URL-driven | low |
| 1 | 1.4 Environment selector, flags-scoped and deep-linkable | low |
| 2 | 2.1 A per-feature destination (Value · History · Settings) | low |
| 2 | 2.2 One clear enable/disable control, with a confirm that names what stops | high |
| 2 | 2.3 "Not created" as a state distinct from "off" | low |
| 3 | 3.1 Credentials move to their own route | high |
| 3 | 3.2 Lifecycle audit moves to its own route | low |
| 3 | 3.3 One module owns every user-facing flag word | low |
| 3 | 3.4 Guards and specs extended to the new surfaces | low |

## Kill-switch (decided at grooming — Stage 6b)

- **Flag:** `FLAG_CONSOLE_ENABLED` in `apps/web/lib/flags.ts`, same exact `process.env.X === 'true'`
  shape as `isFlagRuleBuilderEnabled()`.
- **Polarity: ENABLEMENT — default `false`, created DISABLED in development, preview and production
  before Sprint 1 merges.** The surface being replaced is how an operator kills a live checkout on
  Miyagi Sánchez; a half-landed redesign must never be the only route to that control. A flag is
  invisible until it exists — Story 1.1 creates it in every environment.
- **Seam:** `isFlagConsoleEnabled()` resolved **server-side in `page.tsx`** and passed down — the same
  boundary `isFlagRuleBuilderEnabled()` uses today. One resolver covers the list, the per-feature
  destination and both new routes.
- **Mechanism:** a Vercel environment variable. Per AGENTS rule #4, **a commit to `main` is what makes
  it live** — Vercel snapshots env values at build time. Never `vercel redeploy`/`--prod`.

## Deploy order

Frontend-only, single repo, no migration. Sprints stack: `feat/flags-console-parity` →
`-s2` → `-s3`, each cut from the previous, one PR per sprint, merged in order (WAYS-OF-WORKING §6 —
these sprints share `flag-manager.tsx` and `page.tsx` by construction, so siblings off one base would
pay a per-merge conflict tax).

`FLAG_CONSOLE_ENABLED` must exist **disabled in all three environments before Sprint 1's PR merges**.
The flip to `true` is a separate, deliberate act after the product owner has walked the surface — and
it needs its own commit to `main`, not an env edit alone.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch:** `FLAG_CONSOLE_ENABLED` exists in all three Vercel environments with the stated
      enablement polarity (born `false`). *Verify-only — not a new gate.*
- [ ] **The outcome test:** the product owner opens `/app/flags/miyagisanchez` cold and answers
      "which of these are on, in which environment, and which aren't created yet" **without asking a
      second question.**
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
