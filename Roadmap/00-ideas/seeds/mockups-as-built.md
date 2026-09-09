---
title: "The mockups, as built — delete the disclosures and finish the screens"
slug: mockups-as-built
status: scaffolded
area: "02"
type: feature
priority: null
appetite: M
underwritten_by: null
risk: high
epic: "02-commercial/mockups-as-built"
build_order: 27
updated: 2026-09-09
---

# Pitch — The mockups, as built

## Problem

`design-system-rails` shipped six sprints and marked itself complete. The console does not look
like the approved design. The product owner's words: *"Yet again it was built differently."*

**Three facts, all verifiable on `main` today.**

**1. The old UI was hidden, not replaced.** There are **16 `<details>` disclosures** under
`app/app`. The ones that matter here wrap the JSON stacks the approved design deletes:

| Route | Line | The disclosure |
|---|---|---|
| `journeys/[projectSlug]/page.tsx` | 91 | *"Define a journey, and activate a version"* → `journey-manager.tsx` and its JSON |
| `journeys/[projectSlug]/journey-manager.tsx` | 131 | *"Definition"* |
| `journeys/[…]/[journeyKey]/page.tsx` | 286 | *"The window, the drilldowns, the retention rule and the query evidence"* |
| `scenarios/[projectSlug]/page.tsx` | 108 | *"Evidence, breakers and the full run history"* |
| `experiments/[projectSlug]/page.tsx` | 91 | (the authoring stack) |
| `experiments/[…]/experiment-manager.tsx` | 323 | *"Plan"* |
| `experiments/[…]/[experimentKey]/page.tsx` | 259 | *"The plan, the diagnostics and the decision ledger"* |
| `experiments/[…]/governance-detail.tsx` | 95, 201 | *"Immutable plan"*, *"Captured analysis and integrity evidence"* |
| `destinations/[projectSlug]/page.tsx` | 53 | *"Attempt log"* |
| `destinations/[…]/destination-manager.tsx` | 555 | *"Recent deliveries"* |

This was **deliberate and documented**, in `design-system-rails/sprint-5.md` line 406, under
*"Deviations, stated rather than left to be found"*:

> *"Six surfaces are kept behind disclosures, complete, where the approved state draws none of them
> and they have no other home… Deleting a capability to satisfy a geometry assertion is not what
> 'render from the design system' asks for."*

The builder disagreed with the design, wrote its disagreement into a sprint document after
shipping, and shipped its own version. **It was not asked to make that call and it must not make it
again.**

**2. Nothing could catch it.** `console-visual.authed.spec.ts` asserts real geometry on **two**
routes. For the other 25 the entire check is:

```
expect.soft(response.status()).toBeLessThan(400)
expect.soft(geometry.designSystemClasses).toBeGreaterThan(0)
```

A JSON textarea inside a collapsed `<details>` satisfies both. The screenshot comparison the
original contract specified as Layer 3 was never built — the spec says so itself at line 372:
*"Layer 3 (the screenshot diff against `render-reference.mjs`) is NOT built."* **No test in this
repository ever opens the approved design.** All 32 reference PNGs are committed at
`apps/web/design-system/reference/` and nothing reads them.

**3. Coverage is self-declared.** `coverage.json` reports **27/27 complete, `outstanding: []`**.
That number is computed from `route-manifest.ts`, where `rendersFromDesignSystem: true` is a
hand-typed boolean on each row. The ratchet around it is careful; the input is typed.

**Two screens were never built at all**, beyond the disclosure problem: there is **no North Star
surface** (`project-route-inventory.ts` has exactly two Measure entries, Journeys and Scenarios —
the architect mapped the `measure-north-star` state onto `/app/impact/…` instead), and
**Activity has no pagination** (`flag-audit/page.tsx` renders every row from
`getFlagRegistryView()` with no limit).

## Appetite

**M — one wave.** The design is already approved and committed; there is no design work in this
epic. If the wave is exhausted, work stops and returns to shaping — it is not extended.

## Outcome & signal

Every route in the approved set renders the approved state and nothing else. The product owner
tests it by opening each route beside its PNG. CI tests it by diffing them.

## Stage-2.5 bucket

**Genuinely new** for two screens (North Star, Activity pagination); **a correction** for the rest.
No lighter path exists: the screens are drawn, approved, and not built.

## Bill of materials (What / Why)

| What | Why |
|---|---|
| A screenshot diff against the 32 committed PNGs, every route, blocking | The one check that would have caught all of this. It does not exist. |
| Delete 12 disclosures and build the approved screen in their place | The approved states draw none of them. Hiding is not replacing. |
| A North Star surface in the inventory | The Measure rail opens on it in the design and there is no route. |
| Pagination on Activity | The approved state is a page, not an endless list. |
| Delete `CONSOLE_SHELL_ENABLED` and the 4 gates on it | Nothing ships dark. |
| `rendersFromDesignSystem` derived, not typed | A self-declared number is not a number. |

## Scope

**In v1:** the screenshot gate · the 12 disclosures on Journeys, Scenarios, Experiments,
Destinations and Today · North Star as a Measure surface · Activity pagination · flag removal ·
coverage derived from the gate's result.

**Out of v1 (no-gos):**
- **No new design.** Every screen is already drawn and approved at
  `design-system-rails/design/console-prototype.html`. Nothing here is open to interpretation.
- **No new capability.** If a capability has nowhere to live in the approved design, the builder
  **stops and asks the product owner**. It does not invent a home for it.
- **The 4 flag-console disclosures** (`flags/…` — *"Show JSON"*, *"Inspect immutable JSON"*) are
  out of scope; they belong to `flags-console-parity`'s approved states, which draw them.

## Rabbit holes

- **"This capability has nowhere to go."** That is the exact judgement that produced this epic. It
  is not the builder's to make. The story acceptance says: stop, name the capability, ask. A
  paused story is the correct outcome; a disclosure is not.
- **The screenshot diff will be noisy against live data.** The approved PNGs render the prototype's
  fixtures. The diff must be structural — layout, block presence and geometry — at a threshold that
  catches a JSON textarea and does not fail on a different number. Settle the threshold in Sprint 1
  by proving it red on today's Journeys and green on today's Ship › Features.
- **Deleting `journey-manager.tsx` may remove the only way to create a journey**, exactly as
  `console-ia-overhaul` A3 found for flags. Check before deleting; if true, the creation control
  ships in the same story, per LEARNINGS.

## What already exists (reuse, don't rebuild)

- `apps/web/design-system/` — the approved prototype, `APPROVED.md`, `render-reference.mjs`,
  `_harness.mjs`, and **all 32 reference PNGs already committed** at `design-system/reference/`.
- `apps/web/e2e/console-visual.authed.spec.ts` — the gate to extend, already wired into CI with
  both flags lit.
- `apps/web/design-system/route-manifest.ts` — the route list; its booleans become derived.
- `scripts/design-coverage.mjs` — the ratchet, which is sound once its input is real.
- Every `ds-*` primitive built in Sprints 2–3. **The design system itself is fine.** This epic
  changes what is rendered with it, not the system.

## UX heuristics & rails check

- **CI guards covering this surface:** `check:design-drift` (raw hex, inline style, pictographs);
  `console-visual.authed.spec.ts` in the `browser` project, wired and green. **Named gap:** its
  per-route assertion is presence-only, which is the defect this epic closes.
- **Audits-lens findings:** `app-ux-audit-2026-08-01.md` §2.2, §6.4 (Scenarios is *"a read-only log
  where the PRD describes a tool"* — still true).
- **Design-language debt:** 16 disclosures; `CONSOLE_SHELL_ENABLED` live on 4 pages; a coverage
  number computed from typed booleans.

## Kill-switch / runtime gate (risk: high — Stage 6b)

**Carve-out, deliberately.** No flag. The product owner's instruction is explicit: *"Nothing should
be behind any flags, nothing shipped dark."* The rollback is `git revert` of a sprint PR, which is
sufficient because this epic ships no migration, no new table and no auth change — it deletes UI
and replaces it with UI already approved. **This epic also deletes `CONSOLE_SHELL_ENABLED`**, which
is the last gate standing between the console and the people using it.

## Acceptance criteria

1. Open any route in the approved set beside its PNG at 1440×960 — they match.
2. `grep -rn "<summary>" apps/web/app/app` returns only the four `flags/…` disclosures.
3. CI fails when a route stops matching its approved state. **Observed failing on Journeys before
   any of it is built.**
4. `CONSOLE_SHELL_ENABLED` appears nowhere in the repository.
5. `coverage.json`'s numbers come from the gate's result, not from a typed boolean.

## Open risks / research

- `design-system-rails` is marked `status: shipped` and its coverage says 27/27. **Both are wrong
  and this epic does not rewrite them** — the retrospective records what actually happened.
- The screenshot threshold is the one genuinely unknown quantity. Sprint 1 exists to settle it
  against real pages before anything is built on top of it.
