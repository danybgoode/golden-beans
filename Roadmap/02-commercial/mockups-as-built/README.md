---
status: in-progress   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: mockups-as-built
build_order: 27      # integer position in the ONE global build sequence.
---

# Epic: The mockups, as built — delete the disclosures and finish the screens

> **Area:** 02-commercial · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/mockups-as-built.md`](../../00-ideas/seeds/mockups-as-built.md)
> **Appetite:** M (one wave) · **Underwritten by:** _null — not yet bet_
> **Design — ALREADY APPROVED, nothing to design:** [`console-prototype.html`](../../../apps/web/design-system/console-prototype.html) · [`APPROVED.md`](../../../apps/web/design-system/APPROVED.md) · **33** approved states (D8), rendered to `apps/web/design-system/reference/*.png` by CI on every run — **derived and gitignored, never committed** (D1-b).
> **Corrects:** `design-system-rails` (#26) — which shipped six sprints, marked itself complete, and did not build the approved screens.

---

## ⛔ THE ONE RULE

> **Build the approved state exactly. Nothing else.**
>
> Every screen this epic touches is already drawn and already approved in
> `apps/web/design-system/console-prototype.html`, and rendered to
> `apps/web/design-system/reference/*.png` by CI. There is **no design work in this epic** and
> **nothing is open to interpretation**.
>
> One state was added to the approved set by Daniel on 2026-09-09 — the New feature wizard,
> `console-prototype.html:1992`, as the **33rd**. It is an approval, not a design decision, and it
> is recorded in D8. Nothing else was added and nothing may be.
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
repository opens the approved design**, and all 32 reference PNGs are rendered by CI on every run and read by nothing. (They are **not** committed — they are gitignored and derived; the scaffolded plan said committed and was wrong. See D1-b.)

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

- `apps/web/design-system/reference/*.png` — all 32 approved states, **rendered by CI, gitignored,
  never committed** (D1-b). They stay: they are the human evidence uploaded with every run. The
  gate reads the **prototype** (D1/D2), not these.
- `apps/web/design-system/` — the prototype, `APPROVED.md` (the approval, its content hash, and
  DD1–DD5), `render-reference.mjs`, `_harness.mjs`. All verified running.
- `apps/web/e2e/console-visual.authed.spec.ts` — extend it. It is already in CI, in the **`authed`**
  project (D10 — the plan said `browser`), with all thirteen gate env vars lit.
- `apps/web/design-system/route-manifest.ts` — the route list and its `referenceState` mapping.
- `scripts/design-coverage.mjs` — the ratchet is sound once its input stops being typed.
- Every `ds-*` primitive from Sprints 2–3, and `Frame.tsx`, `bands.tsx`, `charts/`.

## Decisions — locked by the architect before any builder started (2026-09-09)

The builder **cites** these; it never re-derives them. Every one was checked against the running
code, the running database or a real browser — the source of each check is named. Where a
grooming decision did not survive that check it is marked **AMENDED** with the evidence, because
correcting a doc quietly is the defect this epic is named after.

### The two amendments, and what disproved them

**D2 was disproved by measurement before a line of it was written.** The gate D2 specified — a
per-route screenshot diff against the approved PNG, with a threshold settled by making Journeys
red and Ship › Features green — cannot exist, because on this codebase the two routes come out in
the wrong order. Measured 2026-09-09, local `authed` rail, 1440×960, both pages rendered from the
same build against the same fixture tenant:

| approved state | route | raw pixel diff vs its PNG | Δ structural band count |
|---|---|---|---|
| `ship-features` | `/app/flags/…` — **D2 says GREEN** | **6.9 %** | **2** |
| `measure-journeys` | `/app/journeys/…` — **D2 says RED** | **6.4 %** | **0** |
| `measure-scenarios` | `/app/scenarios/…` | 8.9 % | 0 |
| `setup-destinations` | `/app/destinations/…` | 5.7 % | 1 |
| `today` | `/app` | 7.0 % | 3 |
| `setup-keys` | `/app/setup/keys/…` | 5.6 % | 2 |
| `ship-activity` | `/app/flag-audit/…` | 5.2 % | 0 |

The page the epic calls correct is **farther** from its picture than the page the epic calls
wrong, on both metrics, and the structural metric scores the canonical wrong page a **perfect
match**. No threshold separates them. Four measured causes, none of them fixable by a better
metric:

1. **The content column differs by construction on every route.** The prototype's `<main>` is
   `x=236 w=1180`; the product's is `x=278 w=1120`. Every glyph on every route is displaced
   before any real difference is considered.
2. **The PNGs paint things that must never be product UI.** A `PROTOTYPE` badge and a `D` avatar
   in the header, and one `.callout.info` designer annotation inside the body of most states
   (~1120×68 px) — *"Deliberately the same list as Ship › Features…"*. Blanking the annotation
   makes the distance **worse** on four of eight routes, because the reference then has a hole the
   build correctly does not.
3. **The PNGs are 960 px clips of designs up to 1711 px tall.** `today` is 1711 px, so its picture
   shows 56 % of the approved state — and the Medusa-truth disclosure Story 2.4 asks us to delete
   is below that fold and **invisible to the contract**. `measure-scenarios` (1103 px) and
   `ship-activity` (1274 px) are clipped too.
4. **Live data is not fixture data.** 42 features against the fixture's few, three journeys
   against one.

**Daniel chose the replacement on 2026-09-09** (option: *structural contract from the prototype*).

**D3/D7 were confirmed and turned out worse than groomed, and Daniel widened the scope.** Every
primary authoring action in the approved design is a **stub**: `+ New journey` (`:2503`),
`+ New experiment` (`:2953`), `▸ Run a drill` (`:2618`), `+ New destination` (`:3111`),
`+ New key` (`:2313`) and `+ New share link` (`:3163`) each fire a `toast()` describing what would
happen, and the wizard they all point at — *"the same wizard shape as New feature"* — is
`console-prototype.html:1992`, which was **not** one of the 32 approved states. Meanwhile every
server action on the four surfaces Sprint 2 rebuilds has exactly one consumer, and that consumer
is inside a disclosure Sprint 2 deletes (traced 2026-09-09, `grep` from each `actions.ts` export
to its importers). **Daniel's ruling, 2026-09-09, verbatim:** *"The New feature wizard at
console-prototype.html:1992 is now an approved state — treat it as the 33rd. Every + New … and
▸ Run a drill opens that shape, as a modal, wrapping the existing manager component underneath.
… Two hard rules: no capability is lost, and no `<details>` survives. If those two ever conflict
again, the answer is a modal, not a disclosure."*

### The decisions

| # | Decision | Verified against |
|---|---|---|
| **D1** | **AMENDED — the contract is the approved PROTOTYPE, read by machine; the reference PNGs are human evidence, not the assertion.** `console-prototype.html` is the artifact `APPROVED.md` hashes and the artifact the PNGs are rendered *from*, so nothing moves further from the approval — it moves closer to it. The PNGs keep their job: they are uploaded as a CI artifact and put in front of a person. | `APPROVED.md` records the approval as the prototype's content hash; `render-reference.mjs` derives every PNG from it. |
| **D1-b** | **The 32 PNGs are NOT committed, and the epic's premise sentence was wrong.** `.gitignore:67` ignores `apps/web/design-system/reference/`; `git ls-files` on that directory returns **zero**. The capability the premise assumed is nevertheless present: `ci.yml`'s *"The measured spec reproduces, and all 32 approved states render"* step runs `render-reference.mjs` on the runner **before** the gate step, so the PNGs exist in CI when the gate runs. No change needed beyond deleting the false claim. | `git ls-files apps/web/design-system/reference/` → empty; `.gitignore:61-67`; `ci.yml` step order. |
| **D2** | **AMENDED — the gate is a STRUCTURAL STATE CONTRACT, generated from the prototype, per route, blocking.** `apps/web/design-system/state-contract.mjs` opens the prototype, applies each approved state, and emits `STATE-CONTRACT.json` — for each state, the ordered sequence of content blocks in the content column by KIND, with the facts that survive a change of dataset: the tile count, the list's column labels, the primary action's label, the chart count, and **the number of `<details>`, which is always 0**. `console-visual.authed.spec.ts` extracts the same signature from the built route and asserts equality. It is generated + `--check`ed in CI exactly like `MEASURED-SPEC.md` and `reference.css`, so a hand-edit is reverted rather than argued about. | The pattern already exists: `extract-css.mjs --check` and `measure-contract.mjs --check` are both blocking CI steps. |
| **D2-b** | **The block vocabulary is ONE module with BOTH selectors side by side.** `.page-head`↔`.ds-page-head`, `.answer`↔`.ds-answer`, `.tiles`/`.tile`↔`.ds-tiles`/`.ds-tile`, `.listcard`/`.listhead`↔`.ds-listcard`/`.ds-listhead`, `.empty`↔`.ds-empty`, `.card`↔`.ds-card`, `details`↔`details`. Declared as one table so the pairing is visible and testable — never two lists in two files that currently agree (CODE-QUALITY #2). Only 81 of 360 `ds-` classes share a name with a prototype class, so a name-derived mapping would have been a guess. | `system.css` is a hand-written port, not a generated one; counted with a script over both files. |
| **D2-c** | **`.callout.info` is EXCLUDED from the signature and COUNTED beside it.** All 22 occurrences in the prototype carry the same `◆` icon and 20 of them explain the design to a reviewer; **two are genuine product copy** (`:2600`, the journey-version immutability note the built page already renders, and `:1967`'s non-dangerous branch). The markup cannot tell them apart, so the contract treats every one as an annotation, does not assert product callouts, and **reports the count** so nothing is dropped silently. This is a named gap, not a hidden one. | Read all 22 occurrences. |
| **D2-d** | **A route may BORROW a state instead of matching it — named, owned and dated, exactly like `Deferral`.** Two routes already do: `/app/scheduled/…` carries `ship-activity` while rendering the `unbuilt` empty state (Daniel's call, 2026-08-29), and `/app/onboarding/…` carries `setup-connect` while being a different flow. They cannot match those signatures and never could. This makes an existing implicit exemption explicit rather than inventing one. | `route-manifest.ts` rows for `/app/scheduled` and `/app/onboarding`. |
| **D3** | **Unchanged in substance, sharpened by Daniel: a disclosure is never the answer, and where a capability has no home the answer is a MODAL.** No `<details>` survives on a rebuilt surface, and no capability is lost. The two rules bind together; when they conflict, modal. | Daniel, 2026-09-09. |
| **D4** | **No flags.** `CONSOLE_SHELL_ENABLED` is deleted, not repurposed, and no new flag replaces it. Rollback is `git revert` of a sprint PR — sound because this epic ships no migration, no schema change and no auth change (D13). | Confirmed: no `supabase/migrations/` file is touched by any story in this epic. |
| **D5** | **`rendersFromDesignSystem` becomes derived from the gate's result**, not a hand-typed boolean. A route is covered when its structural signature matches its state's, and by no other means. `coverage.json`'s number drops on the way in; the drop is the fix working. | `coverage.json` reads `27/27` with `outstanding: []` today; `coverageOf()` counts a typed boolean. |
| **D6** | **CORRECTED — the `flags/…` exclusions are SIX, not four.** The groomed list named `flag-insight.tsx:141`, `flag-manager.tsx:631`, `rule-builder.tsx:466` and `[flagKey]/page.tsx:390`. Two more exist and are the same class: `[flagKey]/feature-panes.tsx:218` (*"Every reading · {input}"*) and `environment-picker.tsx:42` (`<summary className="ds-env">`, the environment control the approved design **draws**). A DoD that names four would have failed on a correct repository. | `grep -rn "<summary" apps/web/app apps/web/components` → 21 hits, classified individually. |
| **D6-b** | **The DoD's grep was pointed at the wrong tree.** `grep -rn "<summary>" apps/web/app/app` cannot see `components/product/CommandCenter.tsx:238` — the Medusa-truth disclosure Story 2.4 explicitly asks us to delete — nor `ProductShell.tsx`'s two. The DoD grep covers `apps/web/app` **and** `apps/web/components`. | Same grep. |
| **D6-c** | **Three `<summary>`s in the chrome are CONTROLS the approved design draws and they stay:** `ProductShell.tsx:310` (the project switcher, drawn as `miyagisanchez ▾`), `ProductShell.tsx:342` (the account menu, drawn as the `D` avatar) and `RailDisclosure.tsx:40` (the agent rail, which `ProductShell:426` does **not** render on console routes). Deleting a `<details>` because it is a `<details>` would delete the switcher. | `ProductShell.tsx`; the reference PNGs' header. |
| **D7** | **CONFIRMED, and it is five capabilities, not one.** Every export of each surface's `actions.ts` has exactly one consumer, and each consumer sits inside a disclosure Sprint 2 deletes: journey create + activate (`journey-manager.tsx`, the **only** creation path in the product — no API route, no SDK path); experiment create/transition/bind (`experiment-manager.tsx`); scenario launch + stop (`scenario-workspace.tsx`); delivery replay and the five other destination actions (`destination-manager.tsx`). Only `recordExperimentDecisionAction` is safe — `decision-recorder.tsx` is outside any disclosure and the approved design draws it. | `grep` from each `actions.ts` export to its importers, 2026-09-09. |
| **D8** | **NEW (Daniel, 2026-09-09) — `wizard-new-feature` is the 33rd approved state.** `console-prototype.html:1992` (`wizardModal()`), reached by `openWizard()`. Every `+ New …` and `▸ Run a drill` opens **that shape, as a modal**, wrapping the existing manager component underneath. It covers all six surfaces at once — journeys, experiments, scenarios, destinations, keys, shares — and no story asks per surface. The state is added to `approved-states.mjs` **and** to `APPROVED.md`'s batch table, which `route-manifest.test.ts` welds together. | Daniel, 2026-09-09; `approved-states.mjs` ↔ `APPROVED.md` weld in `route-manifest.test.ts`. |
| **D9** | **The reference render becomes FULL-PAGE.** `render-reference.mjs` shoots the viewport today, so eleven of the states are clipped and the contract cannot see the bottom of its own design. `fullPage: true` makes the picture the whole approved state. Free: the PNGs are derived and gitignored (D1-b), so there is no baseline to migrate. | `measure-journeys.png` is 2880×1920 = 1440×960@2×; `MEASURED-SPEC.md`'s chrome table lists heights to 1711. |
| **D10** | **The gate lives in the `authed` Playwright project, not `browser`,** and CI already runs the **whole** `authed` project (`--project=authed`, no file list) after installing Chromium and rendering the references. The epic README said `browser`; nothing needed to change but the sentence. | `playwright.config.ts`; `ci.yml` *"Console visual gate"* step. |
| **D11** | **The product's content column is NOT moved to the prototype's 1180.** The product's `max-width` **is** `1180px` and already asserted; it measures 1120 at 1440 because the grid column bounds it. This is a measurement difference, not a defect, and the existing assertions own it. Nothing in this epic changes page geometry. | `console-visual.authed.spec.ts` assertion `[3b]`, green today. |
| **D12** | **The two `<details>` inside `flag-manager.tsx`/`rule-builder.tsx`/`flag-insight.tsx`/`[flagKey]` stay dark to this epic (D6) and their routes still get a structural signature.** A route can be asserted without its excluded sub-tree: the signature walks the content column's block sequence, and a `<details>` inside a `.ds-pane` on the feature page is counted against `flags-console-parity`'s states, not this epic's. | `route-manifest.ts` rows for the two flags routes. |
| **D13** | **No migration, no new table, no new SQL, no new auth boundary — verified against the LIVE database, not the migration folder.** `supabase migration list --linked` shows local and remote in sync with nothing pending (last applied `20260827120000`). Live row counts, read 2026-09-09 with `supabase db query --linked`: `projects` 4 · `journey_registries` **1** · `journey_definition_versions` 1 · `experiment_registries` 3 · `scenario_registries` 2 · `event_destinations` 1 · `event_delivery_attempts` 6 · `flag_lifecycle_audit` **148** · `north_star_metrics` 2 · `leading_inputs` **3**. Nothing this epic does needs a column, and nothing needs a backfill. | `supabase migration list --linked`; `supabase db query --linked`, 2026-09-09. |
| **D13-b** | **Those counts decide two stories.** (a) Story 3.2's Activity page holds **148** real audit rows and renders every one — pagination is a genuine need and, at 148, it slices a list already fully in memory, so it needs no query change and no index (D13). (b) Story 3.1's North Star has exactly **3** `leading_inputs` live, which is the number the approved state draws as three separate plots — the design is buildable against real data rather than against the prototype's fixture. | Same query. |
| **D13-c** | **The Journeys screen will never resemble its picture in DATA, and that is not a defect.** Production holds **one** journey; `measure-journeys` draws three, `10,906` people counted and `1,238` reaching the end. The built page also renders a dash in the People column on purpose — `projectJourneyRows` refuses to run one bounded cohort scan per row on a list page, and *"we did not read how many"* and *"nobody"* are different answers. The structural contract asserts that the **column exists and is labelled `People`**; it never asserts a value. A builder who "fixes" the dash to match the picture is adding N cohort queries to a list page. | `journeys/page.tsx` and its `projectJourneyRows` comment; live counts above. |
| **D14** | **`measure-north-star` stops being mapped onto `/app/impact/[projectSlug]/[featureKey]`.** That mapping is real in `route-manifest.ts` today and is the architect's substitution the epic README describes. Story 3.1 gives North Star its own Measure surface and `/app/impact/…` keeps its own state. The denominator moves 27 → 28. | `route-manifest.ts`; `lib/project-route-inventory.ts` has exactly two Measure entries. |

## Routing — who builds what, and why

| Sprint | Model | Why |
|---|---|---|
| **1 — the gate** | **Architect (Opus 5), not delegated** | It is the shared seam every later story is measured by, and WAYS-OF-WORKING puts shared surface on the strongest model, done first. A gate delegated to the tier that will be judged by it is a gate written to pass. |
| **2 — the screens** | **Architect builds the modal seam (D8) FIRST; the four per-surface stories go to a Sonnet-class builder over the locked contract** | The modal is shared surface imported by four stories; the surfaces themselves are mechanical once the contract and the seam exist. |
| **3 — the two screens + the flag** | **Architect** | 3.1 adds a nav surface and moves a state mapping (shared surface); 3.3 deletes a flag from `lib/flags.ts` and four gating files plus every Vercel environment (shared infra). Neither is delegable under the routing table. |

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | The gate that can fail | high |
| 2 | Delete the disclosures, build the screens | high |
| 3 | The two missing screens, and no flags | high |

## Build contract (locked by the architect before the builder started)

Three contracts, one per sprint. A builder cites a `D`; it never restates one, because a
paraphrased contract drifts permissive.

### Sprint 1 — the gate that can fail

**Where the contract lives, once:** `apps/web/design-system/state-contract.mjs` (the block
vocabulary and the extractor) and the file it generates, `apps/web/design-system/STATE-CONTRACT.json`.
Nothing restates either. `console-visual.authed.spec.ts` imports the extractor and runs it against a
built page; it does not re-implement the walk.

- Build `state-contract.mjs` per **D2**, **D2-b**, **D2-c**, **D2-d**. It exports `BLOCK_KINDS`
  (both selectors per kind, one table) and `signatureIn(scope)` — a function that runs **inside a
  page** and is therefore usable unchanged against the prototype and against a built route. One
  implementation, two consumers.
- Generate + `--check` in CI beside `extract-css.mjs --check` and `measure-contract.mjs --check`,
  in the **static** job, because the generator needs a browser — so it joins the e2e job's
  *"The measured spec reproduces"* step instead. Same step, one more line.
- `render-reference.mjs` gains `fullPage: true` (**D9**) and the 33rd state (**D8**).
- Story 1.2's proof is: the gate RED on `/app/journeys/…` naming *which* blocks disagree, GREEN on
  `/app/flags/…`, and a **deliberate mutation** on the flags page (delete a tile) turning it red.
  The mutation is the half that proves the assertion is general rather than aimed. Post all three
  outputs in the PR.
- Story 1.3: `rendersFromDesignSystem` derives from the signature comparison (**D5**). The number
  drops. `coverage.json`'s `outstanding` names real routes.
- **Do not** touch a page under `apps/web/app/app`. This sprint builds no product UI.

### Sprint 2 — delete the disclosures, build the screens

**Where the contract lives, once:** the modal seam is `apps/web/components/product/NewThingDialog.tsx`
(the D8 shape) plus the `ds-dialog`/`ds-wizard` primitives that already exist in
`design-system/primitives.tsx`. Every surface imports it. No surface writes its own dialog.

- **The architect builds the modal seam FIRST**, before any per-surface story opens. It is imported
  by four stories; a mistake in it breaks all four.
- Each surface story then: deletes its `<details>`, mounts the surface's existing manager component
  **inside the modal**, and wires the approved primary action to open it (**D3**, **D8**).
  `journey-manager.tsx`, `experiment-manager.tsx`, `scenario-workspace.tsx` and
  `destination-manager.tsx` are **moved, not rewritten** — the capability is the component, and
  rewriting it is how a capability quietly changes.
- The route is done when its structural signature matches its state (**D2**) and every existing
  behavioural spec for it is still green — that pair is what proves a deletion removed UI and not a
  capability.
- **Nothing here is open to interpretation.** If a screen cannot be built without losing something,
  the answer is a modal (**D3**); if that is not enough, the story stops and asks. It does not
  record a deviation and ship.

### Sprint 3 — the two missing screens, and no flags

**Where the contract lives, once:** `lib/project-route-inventory.ts` for the Measure rail;
`lib/flags.ts` for the flag being deleted.

- 3.1 adds a North Star surface under `section: 'measure'` as the section's **default**, unmaps
  `measure-north-star` from `/app/impact/…` (**D14**), and draws the three leading inputs as
  **three separate plots** — live data has exactly three (**D13-b**). The denominator moves 27 → 28.
- 3.2 paginates Activity over a list already fully in memory; no query change, no index (**D13-b**).
  The page is in the URL.
- 3.3 deletes `CONSOLE_SHELL_ENABLED` from `lib/flags.ts`, the four gating files, `ci.yml`, and
  **every Vercel environment** — the last of those is a live environment change and is **owed to
  Daniel by name**; it is not covered by the merge pre-authorization.
- 3.4 closes it honestly, including what `design-system-rails` reported versus what shipped, and
  **does not rewrite that epic's docs**.

## Deploy order

**Sprint 1 first, and it must be red before Sprint 2 opens.** A gate written after the work it is
meant to check is a gate written to pass. Stack the branches:
`feat/mockups-as-built` → `-s2` → `-s3`.

## Definition of Done (epic)
- [ ] Every route in the approved set **matches its state's structural signature**, checked by CI (D2)
- [ ] `grep -rn "<summary" apps/web/app apps/web/components` returns **only** the six `flags/…`
      disclosures (D6) and the three chrome controls (D6-c) — the grep covers **both** trees (D6-b)
- [ ] The gate was **observed failing on Journeys** — and on a deliberately mutated Ship › Features —
      before Sprint 2 started
- [ ] **No capability was lost**: journey create+activate, experiment create/transition/bind,
      scenario launch+stop and delivery replay all still work, from a modal (D8)
- [ ] `CONSOLE_SHELL_ENABLED` appears nowhere in the repository **and in no Vercel environment**
- [ ] `coverage.json`'s numbers are derived from the gate, not typed (D5)
- [ ] North Star is a Measure surface in `project-route-inventory.ts` and is the section's default
- [ ] Activity paginates, and the page is in the URL
- [ ] `wizard-new-feature` is in `approved-states.mjs` **and** `APPROVED.md` (D8)
- [ ] `RETROSPECTIVE.md` written — including what `design-system-rails` reported vs. what shipped,
      and the measurement that disproved D2
- [ ] Product poster updated; `status: shipped`; `node scripts/build-order.mjs`
