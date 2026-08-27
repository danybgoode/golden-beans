---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: console-ia-overhaul
build_order: 25      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Four destinations — an information architecture for the signed-in console

> **Area:** 02-commercial · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/console-ia-overhaul.md`](../../00-ideas/seeds/console-ia-overhaul.md)
> **Appetite:** M (one wave) · **Underwritten by:** _null — not yet bet_
> **Audit:** [`00-ideas/audits/app-ux-audit-2026-08-01.md`](../../00-ideas/audits/app-ux-audit-2026-08-01.md) — §0, §1, §2.4, §3.3, §6.3, §6.7, §7.
> **Design (approved 2026-08-27):** [`design/ia-audit.html`](design/ia-audit.html) · [`design/flags-console-prototype.html`](design/flags-console-prototype.html)
> **Builds on:** `app-shell-and-agent-rail` (#12) — its shell and route inventory are extended, not rewritten.
> **Finishes:** `flags-console-parity` (#24) — whose Sprint 3 left the JSON authoring stack on the page.

## Why

The signed-in product has **seventeen destinations and no information architecture.** Fifteen live in
`lib/project-route-inventory.ts`; four more — `Home`, `Sections`, `Connect`, `Agent notes` — are
bolted into `ProductShell`'s header outside the inventory entirely. They are presented as one flat
list inside a `<details>` disclosure, ordered by the sprint that built each. Nobody decided to have
seventeen.

**The defect underneath the navigation is that the product has no unit of work.** Golden Beans is a
growth engine: ship a thing, switch it on for some people, watch whether it moved the number — one
loop, about one object, a **feature**. There is no page for a feature. There are five pages that each
hold one aspect of one, and two of them can only be reached by typing a key into the address bar.
So the nav lists *containers*, because there is nothing else to list.

This is the same defect `flags-console-parity` fixed one level down. That page showed the storage
model instead of the job. The navigation shows the route table instead of the work.

**The outcome, stated as the test it must pass.** Today, reaching a feature's funnel requires knowing
that `/app/funnel/<project>/<key>` exists and hand-editing a placeholder the nav itself supplies.
**When this epic is done, every surface in the product is reachable in three clicks or one `⌘K`, and
no navigation entry anywhere tells anyone to edit a URL.**

## Platform-first note

**No new table, no new query, and no new auth boundary.** The nav is generated from an inventory that
already exists and is already unit-tested; the funnel and impact pages already work and are re-pointed
rather than rewritten; the per-project connector URL already renders inside `ProductShell` at a route
the nav filters out; the three credential pages already enforce owner checks that move with them.

Per AGENTS rule #1 every read stays on the existing `lib/` seams. Per rule #2 `/install` is untouched —
it is a public page and serving the demo project's token there is *correct*; the defect was linking a
signed-in user to it. All new routes sit behind the same `requireProjectMembership` path as today's.

## What already exists (reuse, don't rebuild)

**Golden — use directly:**
- `apps/web/lib/project-route-inventory.ts` — every surface with label, audience, gate, description,
  unit-tested. **The nav needs no second list.**
- `apps/web/lib/shell-nav.ts` → `getShellNav()` — the active project, the project list, the entitled
  links. The project switcher's data is already resolved here.
- `apps/web/components/product/ProductShell.tsx` — the shell, already below the auth guard.
- `apps/web/app/app/onboarding/[projectSlug]/page.tsx` — **already renders the correct per-project
  connector URL inside `ProductShell`.** Story 2.1 is a registration plus a status line.
- `apps/web/lib/connector-tokens.ts` → `getActiveConnectorUrl(projectSlug)`.
- `apps/web/app/app/{funnel,impact}/[projectSlug]/[featureKey]/page.tsx` — both work today.
- `apps/web/lib/tars-query.ts` → `getFeatureFunnel()`, plus the North Star / impact query libs.
- `apps/web/lib/flag-list-view.ts` → `buildFlagListView` — per-environment projection, sort, filter
  and paginate, all pure and unit-tested. The dormant collapse is a grouping over its output.
- `apps/web/app/app/flags/[projectSlug]/flag-console.tsx` — extended, not replaced.
- `apps/web/app/app/flags/[projectSlug]/[flagKey]/page.tsx` — the per-feature destination that
  already carries insight, preview, versions and per-environment on/off. **It is what makes
  deleting the JSON stack safe** (see D6).
- `apps/web/app/app/flags/[projectSlug]/flag-vocabulary.ts` — the one module that owns user-facing
  flag words (D7 of `flags-console-parity`). Every word this epic renders goes through it.
- `apps/web/lib/flags.ts` — 20+ existing `=== 'true'` gates; the new one goes here.
- `apps/web/app/app/{keys,flag-credentials,agent-keys}/[projectSlug]/page.tsx` — all three already
  `audience: 'owner'`; their checks move with them, unchanged.

**Design — the reference IA** (product owner approved 2026-08-27): `design/ia-audit.html` places all
19 surfaces with the code evidence for each claim; `design/flags-console-prototype.html` is clickable.
Per WAYS-OF-WORKING, **a reference end-state is inspiration, never signed-off scope** — the acceptance
criteria below are the contract, not the pixels.

## Decisions — ⬜ TO BE LOCKED BY THE ARCHITECT BEFORE ANY BUILDER STARTS

Per WAYS-OF-WORKING §5, the coordinating agent verifies every row below **against the live code and
the live production registry**, corrects what is wrong *out loud* as a dated amendment, and only then
dispatches builders. Builders **cite** these; they never re-derive them.

**The locking pass must try to disprove scope.** Two candidates are flagged in advance.

| # | Decision to lock | What to verify against |
|---|---|---|
| D1 | **Tier 1 is one project switcher. Golden Beans has no organisation layer and this epic does not add one.** | `lib/membership.ts` → `getUserProjects(user.id)` returns a flat list of `MemberProject`. Confirm no org/tenant-group table exists in `supabase/migrations/`. **This corrects a first-draft design that drew a Flagsmith-style two-level breadcrumb; the second level does not exist in this data model.** |
| D2 | **The four sections are a `section` field on the existing inventory, not a second list.** A closed union `'today' \| 'measure' \| 'ship' \| 'setup'`, so a new surface is a compile error until it chooses one — the same technique `ProjectSurfaceGate` already uses and for the same reason. | `lib/project-route-inventory.ts` (the `ProjectSurfaceGate` union's own comment explains why widening it is deliberately a compile error at every caller) and `lib/shell-nav.ts`'s D1 comment, which explicitly forbids a hardcoded list in `ProductShell`. |
| D3 | **`funnel` and `impact` leave the inventory; `DEFAULT_FEATURE_HINT` is deleted from both call sites.** The *routes* are not deleted — they keep working and become what a feature's tabs link to. | Both are `topLevelProjectRoute: false` and exist only to be linked with a placeholder. `DEFAULT_FEATURE_HINT` is exported from `lib/shell-nav.ts` and consumed by `app/app/page.tsx` — **both callers must go in the same story** or the constant survives with one user. |
| D4 | **`CONSOLE_SHELL_ENABLED` stays OFF until Sprint 3 closes.** The new nav names destinations (`Setup › Connect`, `Setup › Keys`, a feature's Funnel tab) that do not exist until Sprints 2 and 3. | **This is the epic's single largest risk and it has a precedent.** `flags-console-parity` Amendment 1 records a mid-build change that would have hidden the legacy stack a sprint before its replacement landed — leaving no way to kill a live flag, `checkout.stripe_enabled` included. *"A half-landed redesign must never be the only route to that control."* The same hazard, one level up. |
| D5 | **The credential merge widens no boundary.** All three source routes are already `audience: 'owner'`; the merged page is owner-only and **each section re-asserts its own check** rather than inheriting one page-level guard. | `app/app/{keys,flag-credentials,agent-keys}/[projectSlug]/page.tsx` and the inventory's `audience` field. Confirm a member still gets a 404, not an empty page. |
| D6 | **Deleting the JSON stack removes a duplicate, not a capability.** | `app/app/flags/[projectSlug]/[flagKey]/page.tsx` must be verified to carry — today, on `main` — the insight, the preview, the version list, per-environment on/off and serve-any-version. If any of those is missing, D6 fails and the deletion moves behind the story that lands it. |
| D7 | ⚠️ **The `⌘K` feature index is an OPEN either/or — decide it here, with a number.** The shell does not load the flag registry, and reading `getFlagRegistryView()` on every `/app` route to index 42 keys is a real cost for a rarely-used control. **(a)** lazy-fetch on first `⌘K`, or **(b)** seed from the pages that already hold the registry. | Measure the query cost before choosing. Sprint 1 ships the palette over surfaces only, which needs no data at all, so this decision does not block Sprint 1. |
| D8 | ⚠️ **Candidate for disproof: "seventeen destinations".** The count is 15 inventory surfaces + 4 header links, minus `onboarding` (`flow-only`, filtered out) — and several are gate-dependent, so the number a *given* user sees is smaller. | Recount against `getProjectSurfaceLinks()` with the production gate values for `miyagisanchez`. If the lived number is materially different, **correct the Why section rather than keeping a better-sounding figure.** |
| D9 | ⚠️ **Candidate for disproof: the two feature registries.** TARS features (`setup_guide`, with `enabled`/`syncedAt`) and flag definitions (`checkout.stripe_enabled`) look like different tables with different naming conventions. | `lib/tars-query.ts` → `getFeatureFunnel()` versus `lib/flag-registry.ts`. **If they are in fact the same registry, the Funnel/Impact tabs are simpler than planned and Story 3.2 shrinks. If they are genuinely separate, the tabs must state honestly that a flag has no funnel** — and that empty state is itself the useful finding. Do not guess; read both. |

## Deploy order

**Frontend-only; no migration.** The sequence that is never an outage:

1. **Sprint 1 merges dark.** `CONSOLE_SHELL_ENABLED` unset ⇒ `ProductShell` renders today's header,
   byte-for-byte, auditable by `git diff` rather than promised in prose.
2. **Sprint 2 merges dark.** The two Setup routes follow the established
   `if (!isConsoleShellEnabled()) notFound()` pattern — *dark means nonexistent, before auth or
   project lookup* (`app/app/journeys/[projectSlug]/page.tsx`). An unauthenticated GET returns a flat
   **404** while dark and a login redirect once open; both are assertable by the Playwright `api`
   project, which is what Sprint 1 and 2's gate specs actually test.
3. **Sprint 3 merges dark**, then Story 3.5 flips the var — **preview first, verified, then
   production**. Per AGENTS rule #4, setting the var is half the job: a **commit to `main`** is what
   makes it live. Never `vercel deploy`.
4. **Only after the flip is verified** are the dead header links and the `<details>` disclosure
   deleted (Story 3.5's second half).

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 The gate — `CONSOLE_SHELL_ENABLED`, born OFF | high |
| 1 | 1.2 `section` on the route inventory; funnel/impact leave it; `DEFAULT_FEATURE_HINT` deleted | high |
| 1 | 1.3 The shell: project switcher + four sections | high |
| 1 | 1.4 The per-section rail | low |
| 1 | 1.5 `⌘K` over surfaces | low |
| 2 | 2.1 `Setup › Connect` — your own connector URL, with a status | high |
| 2 | 2.2 The signed-in Connect link stops pointing at `/install` | low |
| 2 | 2.3 One `Setup › Keys` — four credential kinds, one page | high |
| 3 | 3.1 The features list: the answer line and the dormant collapse | low |
| 3 | 3.2 Funnel and Impact as tabs on a feature | low |
| 3 | 3.3 Delete the JSON authoring stack and the rule builder | high |
| 3 | 3.4 `⌘K` indexes feature keys (resolves D7) | low |
| 3 | 3.5 Flip the gate; delete the dead header nav | high |

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated — the **02 · Commercial** section
- [ ] **Landing backfill check:** this epic changes no public offer (`/install` is untouched, D-note
      above), so no landing section moves. State that explicitly at close rather than skipping it.
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch:** `CONSOLE_SHELL_ENABLED` exists in **every env**, created **DISABLED**
      (enablement polarity), and Story 3.5's flip is verified live. *Verify-only — decided at
      grooming, not a new gate here.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — run `node scripts/build-order.mjs`)
