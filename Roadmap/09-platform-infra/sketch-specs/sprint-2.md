---
epic: sketch-specs
sprint: 2
title: "The spec becomes the contract"
risk: low
phase: In review
stories_total: 3
stories:
  - id: S2.1
    title: "Approved surfaces feed the state contract"
    as_a: "the product owner"
    i_want: "an approved surface to be the contract CI checks the built route against"
    so_that: "what I approved is exactly what's enforced"
    risk: low
    status: done
  - id: S2.2
    title: "Parity on three approved states"
    as_a: "a maintainer"
    i_want: "proof the format loses nothing"
    so_that: "we trust it before a new state depends on it"
    risk: low
    status: done
  - id: S2.3
    title: "First state built from a spec"
    as_a: "the product owner"
    i_want: "the next new console state approved as a surface and built against it, with no prototype edit"
    so_that: "the arrow runs spec \u2192 build for real"
    risk: low
    status: planned  # ⏭ deferred at the lock — README C5 (no epic adds a console state yet)
---
# Sketch specs — a surface spec renders the grey wireframe and becomes the state contract — Sprint 2: The spec becomes the contract

**Status:** 🟦 In review (2.1, 2.2 built; 2.3 ⏭ deferred — README C5)

## Stories

### Story 2.1 — Approved surfaces feed the state contract
**As** the product owner, **I want** an approved surface to be the contract CI checks the built route against, **so that** what I approved is exactly what's enforced.
**Acceptance:** `state-contract.mjs` also reads `apps/web/design-system/surfaces/*.surface` through the project map, emits their entries with `source: spec`, fails on a state id defined twice, and `--check` fails when a surface's SHA-256 doesn't match its `APPROVED.md` line.
**Risk:** low

### Story 2.2 — Parity on three approved states
**As** a maintainer, **I want** proof the format loses nothing, **so that** we trust it before a new state depends on it.
**Acceptance:** Three of the 33 approved states, chosen from those the grammar covers, written as surfaces produce entries byte-identical to their prototype-derived ones (a test compares them). `console-visual.authed.spec.ts` stays green.
**Risk:** low

### Story 2.3 — First state built from a spec
**As** the product owner, **I want** the next new console state approved as a surface and built against it, with no prototype edit, **so that** the arrow runs spec → build for real.
**Acceptance:** One new state has a surface, an `APPROVED.md` line and a built route that passes the gate. Waits for an epic that adds a console state.
**⏭ Deferred at the lock (2026-09-30, README C5):** no scaffolded or queued epic adds a console state; the first one that does carries this story.
**Risk:** low

## Build contract (locked by the architect before the builder started)

Cites the epic README's C1–C6 and D11–D14; nothing here restates a rule that lives there.

1. **2.1 — `apps/web/design-system/surface-contract.mjs` (D13)**, pure, with a `.d.mts` beside it (as
   `state-contract-core.d.mts`): `readSurfaces(dir)` → `[{ file, name, hash, surface | error }]` *(as built — the hash rides along and a parse error
   is returned, not thrown)*; `approvedSurfaces(designSystemDir, …)` → the same call for this repo's folder, shared by
   the generator and `route-manifest.test.ts` so a route can cite exactly the approved spec ids *(added in review, #211)*; `surfaceEntry(surface, map,
   kinds)` → the entry; `checkApprovals(surfaces, approvedMd)` → a list of problems (D12); `specContract(dir,
   { approvedMd, map, kinds, prototypeIds })` → `{ entries, problems }`, which also refuses a file name that is not
   `<state>.surface` and a duplicate id (D5). It imports `../../../scripts/lib/surface.mjs` (precedent:
   `dialog-position.test.ts`).
2. **`state-contract.mjs`** calls `specContract` on `surfaces/` with `ALL_STATE_IDS`, fails (both modes) on any
   problem, appends the entries after the prototype ones, and updates `_source` (D13). `STATE-CONTRACT.json` is
   regenerated once: the header line is the only diff. `surfaces/` ships holding only a `README.md` (the folder's
   rule, pointing at D12).
3. **`APPROVED.md`** gains the `## Approved surfaces` section with the D12 table and no rows (C4, C5).
4. **Tests — `surface-contract.test.ts`:** each refusal on a temp folder (no row, a wrong hash, a row for a missing
   file, a duplicate of a prototype id, two files with one id, a mis-named file, `steps count`, a `tiles` with no
   count); a converted entry's exact bytes; and `checkApprovals` over the **live** `surfaces/` and `APPROVED.md`, so
   the static job carries the check (D12). Each observed failing once by mutation.
5. **2.2 — parity (D14):** the three fixtures and the three blocks-only comparisons in `surface-parity.test.ts`,
   observed failing once on a changed column word.
6. **Nothing else moves:** `state-contract-core.mjs`, `console-visual.authed.spec.ts`, `approved-states.mjs` and the
   38 prototype entries are byte-unchanged (the diff is the proof).

## Sprint QA
- `state-contract.mjs --check` in CI; `console-visual.authed.spec.ts` unchanged and green; the parity test.
- Browser smoke owed: none (the gate is the check).
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)

*Rewritten at the lock (README C4): the contract holds no spec entries until a real surface is approved, so the
walkthrough exercises the two refusals instead of reading three entries that D5 forbids.*

1. Run `node apps/web/design-system/state-contract.mjs --check`
   → passes: `STATE-CONTRACT.json reproduces … (38 states, 0 approved surfaces)`.
2. Run `cp apps/web/design-system/surface-parity/ship-activity.surface apps/web/design-system/surfaces/` and run step 1 again
   → it fails: `ship-activity` is already defined by the prototype (one source per state id).
3. In that copy, change `state: ship-activity` to `state: ship-activity-spec`, rename the file to
   `ship-activity-spec.surface`, and run step 1 again
   → it fails, naming `surfaces/ship-activity-spec.surface` as having no `APPROVED.md` line, and printing the hash
   the line would need. Delete the copy.
4. After deploy, open https://goldenfrijoles.com/app/flags/<your-project> signed in
   → the page is unchanged from before this epic (nothing on a route moved; the gate reads the same 38 entries).

If any step fails, note the step number + what you saw — that's the bug report.
