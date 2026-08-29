---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: design-system-rails
build_order: 26      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: One design system, every surface — the rails that make a design outlive an epic

> **Area:** 02-commercial · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/design-system-rails.md`](../../00-ideas/seeds/design-system-rails.md)
> **Appetite:** L (multi-wave — re-bet at each wave boundary) · **Underwritten by:** _null — not yet bet_
> **Audit:** [`00-ideas/audits/app-ux-audit-2026-08-01.md`](../../00-ideas/audits/app-ux-audit-2026-08-01.md) — §2.2, §2.3, §6.7, §7 (P0), §10.5.
> **Design — APPROVED, 32 states:** [`design/console-prototype.html`](design/console-prototype.html) · [`design/APPROVED.md`](design/APPROVED.md) · [`design/render-reference.mjs`](design/render-reference.mjs) — **moved to `apps/web/design-system/` by Story 1.1.** Nine states inherited from [`../console-ia-overhaul/design/CONSOLE-CONTRACT.md`](../console-ia-overhaul/design/CONSOLE-CONTRACT.md), twenty-three added and approved 2026-08-29.
> **Finishes:** `console-ia-overhaul` (#25) — whose retrospective names the visual result as the thing it got wrong.
> **Builds on:** `design-system-lift` (#9), `app-shell-and-agent-rail` (#12), `app-component-kit-adoption` (#13) — their tokens, shell and component kit are extended, never rewritten.

## Why

**The last epic shipped a correct information architecture and a rejected visual result.** Its own
`CONSOLE-CONTRACT.md` opens by saying why: every acceptance criterion in Sprints 1–2 was
*structural* — *"the header renders one project switcher and four sections"* — the build satisfied
**all** of them, and it looked like a different product. A builder cannot hit a visual target
described in prose, and nothing in the plan could go red on a page that looked wrong.

That is not this epic's premise, though. It is the *symptom*. The premise is one level down:

> **The design has no home that outlives the work that produced it.** The approved prototype, the
> contract, the reference renders and the extracted CSS all live in
> `Roadmap/02-commercial/console-ia-overhaul/design/` — a folder named after an epic now marked
> `shipped`. Nothing in it describes `/hub`, `/login`, Experiments, Journeys, Tasks, Scenarios,
> Destinations or Shares. The next epic opens its own `design/` folder, and the cycle restarts.

Three prior design epics ended the same way. `design-system-lift` (#9) produced the brand.
`app-component-kit-adoption` (#13) swept routes onto a component kit. `app-shell-and-agent-rail`
(#12) built the shell. Each was correct, each shipped, and **each scoped its design to itself** —
which is why the audit could still find *one route in twenty-six* using the component kit, and why
`console-ia-overhaul` had to re-derive a visual contract from scratch eleven build-orders later.

**The outcome, stated as the test it must pass.** Today, exactly one route in the product can fail
CI on the way it looks, and the design that route is measured against lives in a closed epic's
folder. **When this epic is done, all 29 in-scope routes render from one design system in
`apps/web/design-system/`, each has an approved reference state derived from that system, the
visual gate is blocking for all of them, and coverage is a generated number that cannot go down.**

## Platform-first note

**No new table, no new SQL, no new auth boundary, and no IA change.** Every route keeps the gate it
has today. The four sections, the per-feature destination and `⌘K` are inherited from
`console-ia-overhaul` and are not revisited. The palette is already loaded in the signed-in app —
`globals.css` imports `references/design/assets/tokens.css` first, and the drift guard asserts that
import. The coverage manifest extends `lib/project-route-inventory.ts`; it adds no second list.

Two things this epic **does** add to shared surface, both architect-owned and both done first:

1. **A new top-level source directory**, `apps/web/design-system/`, which every route will import.
2. **A widened CI guard** — `check-design-drift.mjs` extended to `components/ui` and
   `components/product`, the two directories the audit named (§10.5) as its blind spot and the exact
   directories every new primitive lands in.

Per AGENTS rule #1 every read stays on existing `lib/` seams. Per rule #2 `/install` keeps serving
the demo project's token — it is a public route and that is correct.

## What already exists (reuse, don't rebuild)

**Golden — move or use directly, do not rebuild:**

- `Roadmap/02-commercial/console-ia-overhaul/design/` — `flags-console-prototype.html` (the approved
  language), `console-reference.css` (its stylesheet, extracted verbatim), `CONSOLE-CONTRACT.md`,
  `measure-contract.mjs`, `render-reference.mjs`, `_harness.mjs`. **All three scripts verified
  running 2026-08-29.** Story 1.1 *moves* this; nothing here is re-authored.
- `references/design/assets/tokens.css` — imported first by `apps/web/app/globals.css`; the drift
  guard asserts that import. The palette is already in the signed-in app.
- `apps/web/components/ui/` — `Panel`, `Button`, `Badge`, `Icon`, `DataTable`, `StatCard`,
  `FunnelBars`, `RolloutBar`, `ConfirmDialog`, `ActivityFeedItem`, `FormSection`, `AgentWindow`,
  `ContextCard`, `ChatThread`, `SectionDivider`. Audit §2.2: *"the primitives already exist and are
  reasonably built. The work is mostly adoption and a handful of new primitives."*
- `apps/web/components/product/` — `ProductShell`, `ConsoleRail`, `CommandPalette`, `CommandCenter`,
  `AgentRail`, `RailDisclosure`, `ShellErrorBoundary`, `SignOutButton`.
- `apps/web/lib/project-route-inventory.ts` — every surface with label, audience, gate, description,
  unit-tested. The coverage manifest and the rail's icon field both extend **this one list**.
- `apps/web/lib/flags.ts` — 20+ `=== 'true'` gates and its own 17 comments on polarity and *set ≠
  live*. `CONSOLE_SHELL_ENABLED` is the direct precedent for D6's flag and its mid-epic flip.
- `apps/web/app/app/flags/[projectSlug]/flag-vocabulary.ts` — the one module owning user-facing flag
  words. The product vocabulary **generalises** this; it does not replace it.
- `apps/web/e2e/console-visual.authed.spec.ts` — the existing visual gate and the shape the
  manifest-driven one grows from. Its five deferred rows are named with reasons.
- `scripts/check-design-drift.mjs` + `.github/workflows/design-drift-guard.yml` +
  `.githooks/pre-commit` — a working, wired guard against raw hex, inline styles and pictographs.
- `references/ux-guidelines.md` — the behaviour layer, including the full state taxonomy. **Drafted
  2026-07-23, never applied to a primitive.** Sprint 2 is largely this document, executed.

**Design — the contract.** The approved prototype and `CONSOLE-CONTRACT.md` are **binding for every
signed-in route**, per `console-ia-overhaul` A22. That epic's withdrawal of *"a reference end-state
is inspiration, never signed-off scope"* is generalised here into a WAYS-OF-WORKING amendment
(Story 1.0), so the next epic inherits the correction instead of rediscovering it.

## The design is approved, and committed — read this before D1–D8

⚠️ **AMENDED 2026-08-29, after the epic was scaffolded.** As scaffolded, this epic pushed the
*production* of the remaining mockups into Sprints 4–6, as builder work. The product owner named the
consequence exactly: a builder shows twenty-three unreviewed screens deep into an expensive run, and
the answer is no. **Designing is the planning lane's job, and it is done.**

**All 32 states are designed, approved and committed** — `design/console-prototype.html`, with
`design/APPROVED.md` recording the approval, its content hash, and five design decisions
(**DD1–DD5**) that the architecture lock **does not reopen**: where Tasks lives, where the hub sits,
the three-frame rule, the computed chart-colour rules, and one-design-two-mounts. Every story in
Sprints 2–6 now cites a state id instead of a sentence.

```bash
node Roadmap/02-commercial/design-system-rails/design/render-reference.mjs   # 32 states, verified
```

`design/APPROVED.md` also carries **three findings for the lock to settle** — F1: the approved design
uses `↗`, a glyph `check-design-drift.mjs` bans inside `/app`. F2: `/s/[token]` has no expired state
by design, which corrected `sprint-6.md`. F3: one epic has no `build_order`, so the sequence runs to
26 across 27 epics.

## Decisions — ⚠️ NOT YET LOCKED. The architect locks D1–D8 against live code and live data before any builder starts.

> **This block is scaffolded, not verified.** Per WAYS-OF-WORKING §5 (*Lock the architecture before
> any builder starts*), the coordinating agent must verify every row below against **the live code on
> `main`** and **the live production database**, and **disprove scope** where a criterion describes a
> guard, a table or a flag state the live system does not have. `console-ia-overhaul` locked nine
> decisions this way and **three came back disproved** — that is the outcome this pass is for, not a
> formality. Builders then *cite* these; they never re-derive one, and never widen one because a
> paraphrase read permissively.

| # | Decision — to be locked | What the lock must verify |
|---|---|---|
| **D1** | **`apps/web/design-system/` is the single source of truth. The app imports it; the prototype renders from it.** Porting stops existing. | That a Next.js app dir can import from a sibling top-level dir under the current `tsconfig` paths and build config — and that the prototype's harness can import the same modules outside Next's bundler. **If it cannot, say so and pick the seam that can, before Story 1.1.** |
| **D2** | **One token file.** `references/design/assets/tokens.css`, the prototype's inlined `:root`, and `console.css`'s own set collapse to one. | Diff all three. Any token that differs between them is a **finding**, not a merge conflict to resolve quietly — one of them is what is on screen today. |
| **D3** | **The design system's classes are namespaced.** Landing rules reached the console through shared class names three times in one epic (`.tag`, `.note`). | That the chosen prefix collides with nothing in `globals.css` or `tokens.css`. Confirm the `font:` shorthand trap is understood: it resets family, weight and style, so restating `font-size` under it leaves the rest in place. |
| **D4** | **Rail icons are SVG `Icon` components, and `iconKey` is a field on `ProjectSurfaceLink`.** | `check-design-drift.mjs` **bans pictographs inside `/app`** — which is why no icons were ever added. Verify the ban's exact codepoint ranges, and that `Icon` is the permitted route. **Do not disable the rule** (audit §10.5). |
| **D5** | **The visual gate is driven by the coverage manifest, not a hand-written route list.** | That every assertion can be **observed failing on a deliberately mutated page**. The epic's own closing lesson: counting `querySelectorAll('[role="columnheader"]')` passes under `display: none`. A gate that cannot fail is worse than no gate. |
| **D6** | **`console.design_v2_enabled` — enablement polarity, default `false`, created DISABLED in every env, flipped ON at the end of Sprint 3.** Seam: `ProductShell`. | ⚠️ **The seam covers 20 of 29 routes.** `/hub/*`, `/login`, `/signup`, `/install` and `/s/[token]` do **not** render through `ProductShell`. **The second seam is an open question this lock must answer** — root `layout.tsx`, a new `PublicShell`, or a carve-out — not a settled "one flag covers everything". |
| **D7** | **The charting primitive is hand-rolled SVG on the token set, unless the lock beats it.** | Audit §6.7 leaves Observable Plot / visx / hand-rolled open, and §2.3 confirms **no chart library is installed**. Hand-rolled is the default: no dependency, no bundle cost, no second theming system, and the guard's inline-style ban is landing-only so dynamic bar widths are legal in `/app`. A dependency here is shared surface — architect-owned, decided before Sprint 5, never mid-sprint. |
| **D8** | **`measure-contract.mjs` emits the spec file; the spec is generated output.** | That a regeneration on `main` today reproduces the size/weight column exactly and **corrects the two box numbers** — switcher `122×30` (written `140×30`), feature row `71` (written `78`). Re-measured 2026-08-29. **These must arrive from a regenerated table, never a hand-edit**, or the fix repeats the defect it is fixing. |

### The six mechanisms this epic exists to kill

Each is evidenced from `console-ia-overhaul`'s own retrospective and contract. Every sprint below
names which one it closes, so no story is here on taste.

| # | Mechanism | Closed by |
|---|---|---|
| **A** | Nothing could go red on an ugly page — every criterion was structural | S1 (the gate), S2 (the spec) |
| **B** | The design was explicitly demoted to *"inspiration, never signed-off scope"* | **S1, Story 1.0** — one paragraph in WAYS-OF-WORKING |
| **C** | The contract claimed *"measured, not described"* and two numbers do not reproduce | S1 Story 1.4 / D8 — the spec becomes generated output |
| **D** | The regenerator was never committed; both scripts died on a fresh clone for four days | S1 — harness and scripts under CI |
| **E** | The gate was born with five deferred rows, covering one route of twenty-nine | S1 (manifest-driven gate), S6 (coverage 100%) |
| **F** | **The design lives inside an epic, and epics close** | **S1, Story 1.1** — the move to `apps/web/design-system/` |

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | The rails — make a bad-looking page fail the build | high |
| 2 | The language, systematised | high |
| 3 | The shell | high |
| 4 | Ship and Setup, finished | high |
| 5 | Measure and Today — the pages nobody designed | high |
| 6 | The doors, the hub, and deleting the old world | high |

## Deploy order

**Stack the branches** — `feat/design-system-rails` → `-s2` → `-s3` → `-s4` → `-s5` → `-s6`, each cut
from the previous, one PR per sprint, merged in order. Six sprints in one epic share
`globals.css`, `console.css`, `ProductShell` and the token file by construction; siblings cut off one
base pay a per-merge conflict tax.

**Shared surface first, by the architect, in Sprint 1:** the `design-system/` directory, the token
collapse, the widened drift guard and the manifest. Every later branch inherits them, so a mistake
there breaks all five.

**The flag flips ON at the end of Sprint 3, not at epic close.** Sprints 4–6 are then built in the
light, with a live rollback, and a missing control is noticed the day it goes missing. This is the
last epic's own recorded lesson, applied deliberately: *"with the console LIVE since Sprint 2 there
was no dark period in which a missing control would have gone unnoticed."*

**Two visual systems live between S3's flip and S6's deletion.** That is what makes rollback
possible, and it means every S4–S6 story pays a two-branch cost. **Land the replacement and retire
the original in the SAME story** (`console-ia-overhaul` A3) — never as a cleanup sprint.

**Preview does not mirror Production's gates** (`console-ia-overhaul` A2, `vercel env ls`
2026-08-27): a member sees **9** surfaces on a branch preview, not 13. Every sprint walkthrough must
say which environment each step is for, per step — a gate-on step run on Preview renders a correct
page that reads exactly like a broken one.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] **All 29 in-scope routes have an approved reference state, derived from `apps/web/design-system/`**
- [ ] **The visual gate is blocking for all 29, with zero deferred rows carrying no owner and no date**
- [ ] **Coverage manifest reports 29/29 and the ratchet is wired** (coverage may not decrease)
- [ ] **`globals.css`'s `.product-shell` rules and `console.css`'s compensations for them are deleted** — until this happens the redesign is a layer on top of the thing it replaced
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch (planned at grooming — Stage 6b):** the D6 flag slice shipped + `console.design_v2_enabled` exists **in every Vercel env** with the stated polarity, and the second seam for the nine non-`ProductShell` routes is resolved as the lock decided. *Verify-only — not a new gate.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
