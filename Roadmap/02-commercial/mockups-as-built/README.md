---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: mockups-as-built
build_order: 27      # integer position in the ONE global build sequence.
---

# Epic: The mockups, as built — delete the disclosures and finish the screens

> **Area:** 02-commercial · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/mockups-as-built.md`](../../00-ideas/seeds/mockups-as-built.md)
> **Appetite:** M (one wave) · **Underwritten by:** _null — not yet bet_
> **Design — ALREADY APPROVED, nothing to design:** [`../design-system-rails/design/console-prototype.html`](../design-system-rails/design/console-prototype.html) · [`../design-system-rails/design/APPROVED.md`](../design-system-rails/design/APPROVED.md) · 32 reference PNGs committed at `apps/web/design-system/reference/`
> **Corrects:** `design-system-rails` (#26) — which shipped six sprints, marked itself complete, and did not build the approved screens.

---

## ⛔ THE ONE RULE

> **Build the approved state exactly. Nothing else.**
>
> Every screen this epic touches is already drawn, already approved, and committed at
> `apps/web/design-system/reference/*.png`. There is **no design work in this epic** and **nothing
> is open to interpretation**.
>
> **If you believe a mockup is wrong, or that building it would lose a capability: STOP and ASK
> the product owner. Do not decide.** A paused story is the correct outcome. Hiding the old UI
> behind a disclosure is not. Neither is an improvement, an optimisation, a flag, or a dark ship.
>
> This rule exists because the previous epic's builder made exactly that call, on six surfaces,
> and recorded its disagreement in `design-system-rails/sprint-5.md` line 406 **after shipping**:
>
> > *"Six surfaces are kept behind disclosures, complete, where the approved state draws none of
> > them and they have no other home… Deleting a capability to satisfy a geometry assertion is not
> > what 'render from the design system' asks for."*
>
> That judgement was not the builder's to make. The product owner's instruction is verbatim:
> *"I don't want the builder to suggest or take any other actions at all, except implement the
> mockups exactly. Nothing should be behind any flags, nothing shipped dark, nothing optimized."*

---

## Why

`design-system-rails` shipped all six sprints, marked itself `shipped`, and reports **27/27
coverage with zero outstanding**. The console does not look like the approved design. Three facts
explain the whole gap, and all three are verifiable on `main` today.

**The old UI was hidden, not replaced.** Sixteen `<details>` disclosures under `app/app`. Twelve of
them wrap the JSON stacks the approved design deletes — *"Define a journey, and activate a
version"*, *"Evidence, breakers and the full run history"*, *"The plan, the diagnostics and the
decision ledger"*. Clicking one expands the exact interface the redesign was commissioned to
remove.

**Nothing could catch it.** `console-visual.authed.spec.ts` asserts real geometry on **two** of 27
routes. For the other 25 the complete assertion is `status < 400` and
`designSystemClasses > 0` — the `<main>` contains at least one `ds-` class. A JSON textarea inside
a collapsed disclosure satisfies both. The screenshot comparison specified as Layer 3 of the
original contract was never built; the spec says so itself at line 372. **No test in this
repository opens the approved design**, and all 32 reference PNGs sit committed and unread.

**Coverage is self-declared.** `coverage.json`'s 27/27 is computed from `route-manifest.ts`, where
`rendersFromDesignSystem: true` is a hand-typed boolean literal on each row. The ratchet around
that number is careful and its input is typed.

**And two screens were never built at all.** There is no North Star surface —
`project-route-inventory.ts` has exactly two Measure entries, Journeys and Scenarios, and the
architect mapped the `measure-north-star` state onto `/app/impact/…` instead. Activity renders
every audit row with no limit, no pagination.

## Platform-first note

**No new table, no new SQL, no new auth boundary, no migration, and no new design.** This epic
deletes UI and replaces it with UI that is already drawn. The design system built in
`design-system-rails` Sprints 2–3 is sound and is reused wholesale — this epic changes what is
rendered with it, not the system itself.

**One thing is deleted from shared surface:** `CONSOLE_SHELL_ENABLED`, and the four pages that
gate on it. Nothing ships dark.

## What already exists (reuse, don't rebuild)

- `apps/web/design-system/reference/*.png` — **all 32 approved states, already committed.** The
  gate reads these. Nothing generates or approves anything new.
- `apps/web/design-system/` — the prototype, `APPROVED.md` (the approval, its content hash, and
  DD1–DD5), `render-reference.mjs`, `_harness.mjs`. All verified running.
- `apps/web/e2e/console-visual.authed.spec.ts` — extend it. It is already in CI, in the `browser`
  project, with `CONSOLE_SHELL_ENABLED` and `FLAG_CONSOLE_ENABLED` lit.
- `apps/web/design-system/route-manifest.ts` — the route list and its `referenceState` mapping.
- `scripts/design-coverage.mjs` — the ratchet is sound once its input stops being typed.
- Every `ds-*` primitive from Sprints 2–3, and `Frame.tsx`, `bands.tsx`, `charts/`.

## Decisions — locked at grooming. The builder cites these; it does not re-derive them.

| # | Decision |
|---|---|
| **D1** | **The 32 committed PNGs are the contract.** Not the prototype's source, not `MEASURED-SPEC.md`, not a sprint doc's prose. The PNG. |
| **D2** | **The gate is a screenshot diff, per route, blocking.** Structural threshold — it must go red on today's Journeys and green on today's Ship › Features. Both proved in Story 1.2 before anything else is built. |
| **D3** | **A disclosure is never the answer.** If a capability has nowhere to live in the approved design, the story **stops and asks**. No `<details>`, no "kept behind a disclosure, complete", no second home invented for it. |
| **D4** | **No flags.** `CONSOLE_SHELL_ENABLED` is deleted, not repurposed. No new flag is introduced. Rollback is `git revert` of a sprint PR, which is sufficient — no migration, no schema, no auth change. |
| **D5** | **`rendersFromDesignSystem` becomes derived from the gate's result.** A route is covered when its screenshot matches, and by no other means. |
| **D6** | **The four `flags/…` disclosures are out of scope** — *"Show JSON"*, *"Inspect immutable JSON"* on `flag-insight.tsx`, `flag-manager.tsx`, `rule-builder.tsx`, `[flagKey]/page.tsx`. Those belong to `flags-console-parity`'s own approved states, which draw them. |
| **D7** | **Before deleting `journey-manager.tsx`, check it is not the only way to create a journey.** `console-ia-overhaul` A3 found exactly this for flags — the authoring form was the only creation path. If it is, the creation control ships in the **same** story. |

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | The gate that can fail | high |
| 2 | Delete the disclosures, build the screens | high |
| 3 | The two missing screens, and no flags | high |

## Deploy order

**Sprint 1 first, and it must be red before Sprint 2 opens.** A gate written after the work it is
meant to check is a gate written to pass. Stack the branches:
`feat/mockups-as-built` → `-s2` → `-s3`.

## Definition of Done (epic)
- [ ] Every route in the approved set matches its PNG at 1440×960, checked by CI
- [ ] `grep -rn "<summary>" apps/web/app/app` returns **only** the four `flags/…` disclosures (D6)
- [ ] The gate was **observed failing on Journeys** before Sprint 2 started
- [ ] `CONSOLE_SHELL_ENABLED` appears nowhere in the repository
- [ ] `coverage.json`'s numbers are derived from the gate, not typed (D5)
- [ ] North Star is a Measure surface in `project-route-inventory.ts`
- [ ] Activity paginates
- [ ] `RETROSPECTIVE.md` written — including what `design-system-rails` reported vs. what shipped
- [ ] Product poster updated; `status: shipped`; `node scripts/build-order.mjs`
