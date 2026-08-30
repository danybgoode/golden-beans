# One design system, every surface — Sprint 1: The rails — make a bad-looking page fail the build

**Status:** ✅ **SHIPPED & LIVE 2026-08-30** — merged as `8bd9167` (PR #128), deployed to
production and verified: the generated token block serves on `goldenfrijoles.com` with all 23 values
identical to the ones `console.css` declared before. That is the "no product pixel moves" contract
proved against the deployed CSS rather than promised.

| Story | | Commit |
|---|---|---|
| 1.0 — the WAYS-OF-WORKING amendment | ✅ | `8e77746` (landed at grooming, planning lane) |
| 1.1 — the design source moves out of a closed epic | ✅ | `582c6f4` |
| 1.2 — one token file | ✅ | `582c6f4` |
| 1.3 — the drift guard learns the rules this epic needs | ✅ | `d6c85bc` |
| 1.4 — the contract becomes generated output | ✅ | `582c6f4` (the emitter + spec file) · `d6c85bc` (CI + deferred-row owners/dates) |
| 1.5 — the coverage manifest | ✅ | `d6c85bc` |
| 1.6 — the gate is driven by the manifest | ✅ | `d6c85bc` |

Architecture locked `20d030f` — D1–D13, five scaffolded decisions changed, five new ones added.

**Review: four rounds.** agy 0 Blocking (one invalid run discounted and re-run), vibe 0 Blocking,
the fresh reviewer's Majors all fixed. ⚠️ Codex quota-capped until 2026-09-16 — rotated to the third
family in the router's order rather than substituting subagents, so two cross-family passes held.

**Every round found a guard that could not fail** — the class this epic exists to eliminate,
arriving inside the machinery built to eliminate it:

| Guard | Why it could not fail |
|---|---|
| `expect(<boolean>).toBeDefined()` | `false` is defined. *(Found by re-reading my own diff.)* |
| the coverage ratchet | an empty `COVERAGE_BASE_REF` made `git show :<path>` read the INDEX, so it compared coverage against itself *(agy, Blocking)* |
| the three new drift rules | a path filter meant they ran on **no PR** that only touched `design-system/` *(fresh reviewer, Blocking)* |
| the contract weld | it tested a hand-retyped COPY, so the disproved `78` was still in the gate *(fresh reviewer, proven by mutation)* |
| the empty-loop guard | twice — a tautology replaced by another tautology *(fresh reviewer, rounds 1 and 2)* |
| the `stylesheetFiles` throw test | passed with the throw reverted; and the suggested fix did not work either, because `sourceFiles` throws first |

**30+ assertions observed failing** under deliberate mutation, each reverted.

> **This sprint writes almost no product CSS.** It builds the machinery that makes every later
> sprint checkable, and it closes four of the six mechanisms in the epic README on its own.
> **Every assertion it adds must be observed failing on the current `main` before the work starts**
> (WAYS-OF-WORKING: *every new spec was observed failing at least once*). They all will — that is the
> point.
>
> **Shared surface, architect-owned, done first.** `design-system/`, the token collapse, the widened
> guard and the manifest are inherited by all five later branches. A mistake here breaks every one.

> **Story 1.0 was landed at grooming, not by a builder.** The WAYS-OF-WORKING amendment (*an
> approved design IS signed-off scope*) is a `Roadmap/` doc change and belongs to the planning lane.
> It shipped in the scaffold commit. It is recorded here because it closes Mechanism B and the
> sprint would otherwise look like it has a gap.

## Build contract (locked by the architect before the builder started)

> Sprint 1 is **not delegated** — it is entirely shared surface (README → *Routing*). This contract
> is written anyway, because the next sprint's builder inherits every line of it and because a
> contract nobody wrote down drifts permissive the first time it is paraphrased.
>
> **Cite a decision. Never re-derive one.** If a line here is wrong, that is an escalation, not a
> judgement call.

**Paths this sprint owns.** `apps/web/design-system/**` (new) · `scripts/check-design-drift.mjs` ·
`apps/web/e2e/design-drift.spec.ts` (new) · `apps/web/e2e/coverage-manifest.spec.ts` (new) ·
`.github/workflows/ci.yml` · `apps/web/lib/project-route-inventory.ts` (import only, no edit yet —
`iconKey` lands in Story 2.4) · `Roadmap/02-commercial/console-ia-overhaul/{README,design/*}.md`
(forward pointers only). **It writes no product CSS and touches no route.**

| # | The contract | Cites |
|---|---|---|
| 1 | `apps/web/design-system/` is a **child of `apps/web`**. `@/design-system/…` resolves under today's `tsconfig` with **no config change**. Do not add a path alias, a `next.config` rewrite or a workspace entry. | **D1** |
| 2 | The prototype and the app share **CSS, not TypeScript**. `_harness.mjs` inlines `design-system/*.css`; it must never import a `.ts`/`.tsx`, which Node 22 cannot load. | **D1** |
| 3 | `references/design/assets/tokens.css` is **not edited**. `globals.css` must still `@import` it **first** — the drift guard asserts that literal string, and the landing renders from it. | **D2** |
| 4 | The product token set is defined **once**, in `design-system/tokens.css`, on the `.ds` scope root. `console.css`'s `.is-console` token block and the prototype's inlined `:root` are both **deleted** in the same commit that adds it. | **D2** |
| 5 | `--roast-2` is a **recorded fork** (`#221b13` landing / `#1c1710` console). It goes in `FORKED_TOKENS` with its reason, and both live values are named in the Story 1.2 findings block. It is **not** renamed and **not** silently unified. | **D2-b** |
| 6 | The two false "no new colours" comments — in `console.css` and in `CONSOLE-CONTRACT.md` — are corrected in this sprint, naming the ten tokens. | **D2-c** |
| 7 | Namespace is `ds-`, scope root `.ds`. Verified free of collisions in all four stylesheets. | **D3** |
| 8 | The manifest **imports** `PROJECT_ROUTE_INVENTORY`; it never re-lists a surface. Its test asserts a row for every inventory surface **and exactly 29 rows**. | **D5-b** |
| 9 | Every new visual assertion lands in the **`authed`** Playwright project. `browser` runs nowhere. | **D5-a** |
| 10 | `measure-contract.mjs` gains `--check` and **emits** the spec file under a do-not-hand-edit header. The two corrected numbers arrive **from a regenerated table** — `122 × 30` and `71`. A hand-edit here repeats the defect it is fixing. | **D8** |
| 11 | Both scripts and `_harness.mjs` run **in CI**. They died on a fresh clone for four days because nothing ran them; a missing import must fail in minutes. | Mechanism **D** |
| 12 | Every new assertion is **observed failing** before the work it guards. Where the thing it guards is already correct, the red is produced by a **mutation check recorded in the PR body**. | **D5**, **D12** |

**The 29 routes, enumerated once so no builder counts them again.** 32 `page.tsx` files exist;
three are out of scope.

| Group | Count | Routes |
|---|---|---|
| Console (`ProductShell`, seam A) | **20** | `/app` · `agent-keys` · `destinations` · `experiments` · `experiments/[experimentKey]` · `flag-audit` · `flag-credentials` · `flags` · `flags/[flagKey]` · `funnel/[featureKey]` · `impact/[featureKey]` · `journeys` · `journeys/[journeyKey]` · `keys` · `onboarding` · `scenarios` · `setup/connect` · `setup/keys` · `shares` · `tasks` |
| Doors + hub (seam B) | **9** | `/login` · `/signup` · `/install` · `/s/[token]` · `/talk` · `/hub/[projectSlug]` · `…/epic/[epicSlug]` · `…/horizon` · `…/report` |
| **Out of scope** | 3 | `/` · `/methodology` · `/methodology/[chapter]` — shipped on the brand system by two earlier epics. Gating them would put those epics behind this epic's kill-switch (**D6**). |

## Stories

### Story 1.1 — The design source moves out of a closed epic ✳ *closes Mechanism F*
**As a** builder on any future epic, **I want** the design system to live at a product-level path,
**so that** it does not expire with the epic that produced it.
**Acceptance:**
- `apps/web/design-system/` exists and holds **this epic's own `design/` folder** — the approved
  32-state `console-prototype.html`, `APPROVED.md`, `render-reference.mjs` and `_harness.mjs` — plus
  `console-reference.css`, `CONSOLE-CONTRACT.md` and `measure-contract.mjs` from
  `Roadmap/02-commercial/console-ia-overhaul/design/`. Both source folders are left as
  forward-pointers, not deleted.
- On a **fresh clone**, both commands run green and `render-reference.mjs` writes all ten states.
  (They died with `ERR_MODULE_NOT_FOUND` for four days because `_harness.mjs` was uncommitted —
  prove the move did not reintroduce that.)
- The old path is gone, and `console-ia-overhaul`'s README + contract link forward to the new one.
  A dangling link from a shipped epic is how the next reader concludes the design was deleted.
- **D1 is answered in writing first:** an app-dir import from a sibling top-level directory either
  builds under the current `tsconfig` paths, or the seam is changed to one that does — before the
  move, not after.
**Risk:** high

### Story 1.2 — One token file ✳ *D2*
**As a** builder, **I want** exactly one definition of every colour, **so that** changing a token
changes the product rather than one of three copies.
**Acceptance:**
- `references/design/assets/tokens.css`, the prototype's inlined `:root` and `console.css`'s own set
  are collapsed to one file, imported once.
- **Every value that differed between the three is written down as a finding**, with which one was
  on screen. A silent merge here hides the answer to "why did it not look like the mockup".
- Deleting a token breaks its consumers **at build time**, not at render time.
- The design system's classes are namespaced per **D3**, and the `font:`-shorthand trap is covered by
  a case in the drift guard or a unit test: the shorthand resets family, weight and style, so
  restating `font-size` under it leaves the rest in place.
**Risk:** high

### Story 1.3 — The drift guard learns the rules this epic needs
> ⚠️ **REWRITTEN AT THE LOCK (D11-1).** As scaffolded this story read *"the guard walks
> `components/ui` and `components/product` … the audit named this gap by hand (§10.5)"*.
> **`SWEPT_ROOTS` already contains both**, plus `components/brand` and `components/methodology` —
> `app-shell-and-agent-rail` S1.4 closed the audit's gap before this epic was scaffolded. Building
> the scaffolded story would have produced a no-op diff and a green tick on work nobody did.
> The gap that IS open is a different one, and it is what this story now builds.

**As a** reviewer, **I want** `check-design-drift.mjs` to hold the rules this epic's new surface
needs, **so that** the guard is not blind to the ways *this* design system can drift.
**Acceptance:**
- **`apps/web/design-system` joins `SWEPT_ROOTS`.** It is the one directory this epic creates and
  the only swept-root gap that is real. A missing root must be LOUD — the guard already throws on a
  non-existent root, so the root is added in the same commit as the directory.
- **The stylesheet sweep stops being `globals.css`-only.** Today exactly one CSS file is read, for
  raw hex alone. Every `apps/web/design-system/*.css` file is swept for raw hex too — the whole
  point of the directory is that it consumes tokens.
- **A `font:`-shorthand rule (D3).** The shorthand resets family, weight, style, size, line-height
  and variant, so an override that restates only `font-size` silently leaves the rest at the
  shorthand's values. Flagged inside `design-system/*.css`.
- **A namespace rule (D3).** A class selector in `design-system/*.css` that is neither `.ds` nor
  `ds-`-prefixed is a violation — that is what keeps landing rules and console rules from reaching
  each other through a shared word, which happened three times in one epic.
- **Each new rule is observed failing first** — plant a raw hex, a `font:` shorthand and an
  unprefixed class, see three reds, remove them. A rule that has never been seen red is not a rule.
- The **pictograph ban is not relaxed.** It is the reason no rail icon was ever added, and Story 2.4
  answers it with SVG `Icon` components (**D4**), not with an exemption. **F1's `Add to Claude ↗`
  becomes `<Icon name="external" />`** — the map already has it.
**Risk:** high

### Story 1.4 — The contract becomes generated output ✳ *closes Mechanisms C and D*
**As a** product owner, **I want** every number in the spec to come from a measurement,
**so that** a number nobody can reproduce cannot be committed and then reasoned about as intent.
**Acceptance:**
- `measure-contract.mjs` **emits** the spec file — every column, including the Box column — under a
  do-not-hand-edit header.
- CI regenerates it and **fails on any diff**. The scripts and the harness are themselves under CI,
  so a missing import fails in minutes rather than four days.
- The two wrong numbers are **corrected by regeneration, never by hand**: project switcher
  `122 × 30` (written `140 × 30`), feature row `71` (written `78`). Re-measured 2026-08-29.
- Any row that stays deferred carries **an owner and a date**, and the gate fails when the date
  passes.
**Risk:** high

### Story 1.5 — The coverage manifest ✳ *closes the rest of Mechanism E*
**As a** product owner, **I want** one generated number for how much of the product is on the
system, **so that** an XXL project has a finish line and an off-system page is visibly a debt.
**Acceptance:**
> ⚠️ **AMENDED AT THE LOCK AND AFTER REVIEW.** Story 1.3 got a *"rewritten"* banner and this one did
> not, so three of its criteria stayed ✅ against wording that had already been superseded (fresh
> reviewer). Corrected here rather than in a retro: a ✅ against a criterion nobody meets any more is
> the shape of a green tick on work nobody did.

- A generated manifest lists every in-scope route — **30 live through Sprint 3, 27 at epic close**,
  per the **D13** ledger. *(Was "all 29". 29 was 32 pages minus 3 out of scope, before this epic's
  own Story 4.5 retired three routes and Story 4.3 added one.)*
- **Two booleans are manifest fields** — has an approved reference state · renders from
  `design-system/`. *(Was "three booleans each".)* The third — *passes the visual gate* — is
  deliberately **not** a field: it is the gate's RESULT, and the gate is blocking, so a field for it
  would be `true` on `main` by construction and would store a fact that cannot be false. That is
  this epic's own definition of a guard that cannot fail.
- It **imports** `lib/project-route-inventory.ts` and is welded to it by a test — no second list of
  surfaces. *(Was "extends". It cannot extend it: that list holds **14** nav surfaces and this epic
  covers 27 routes, and folding them together would put `/login` in a member's navigation — **D5-b**.
  The module itself imports nothing at runtime, so the weld lives in the test.)*
- A new route with no reference state makes the manifest **red**, not silently green.
- **The ratchet is wired: coverage may not decrease.**
- Sprint 1 also captures all 29 routes **as they are today** as the before-baseline. Six defects in
  the last epic were found by opening the page and none by reading a diff.
**Risk:** high

### Story 1.6 — The gate is driven by the manifest ✳ *closes Mechanism A* — **D5**
**As a** product owner, **I want** a page that looks wrong to fail CI on any route,
**so that** "done" and "right" stop being different conditions.
**Acceptance:**
- `console-visual.authed.spec.ts` becomes manifest-driven: it iterates every route the manifest says
  **renders from `design-system/`**, instead of one hand-written route.
  ⚠️ *Corrected after review: this said "every route the manifest says has a reference state", which
  is 27 — and the loop runs on `rendersFromDesignSystem`, which is **0** in Sprint 1 and rises with
  each sprint. Those are different sets, and the difference matters: a route has an approved picture
  of itself long before it renders from the system, and opening it against that picture before the
  work lands would assert a failure the sprint has not been asked to fix yet.*
- **Because that loop is empty in Sprint 1**, its "observed failing" is owed as a **mutation check
  recorded in the PR body**, per the D12 pattern — not as a red run. What IS observed failing here is
  the loop's accounting (a route claiming coverage it has not earned) and every guard around it.
- **Every assertion is observed failing on a deliberately mutated page.** The epic's own closing
  lesson: counting `querySelectorAll('[role="columnheader"]')` passes under `display: none`, which
  removes an element from the accessibility tree and not from the DOM. A gate that cannot fail is
  worse than no gate.
- The three cheap assertions stay and apply per route: no vertical overflow at 1440×960, the
  expected row count, and **no horizontal page scroll, ever**.
**Risk:** high

## Sprint QA
- **unit spec(s)** — ⚠️ *corrected at the lock: these are `node --test` unit specs, not Playwright
  `api` specs. Everything they assert is pure — a stylesheet's bytes, a manifest's rows, a
  generator's output — and none of it needs a server, so putting them in the `api` project would
  have spent a Supabase boot and a `next start` to read files.*
  `scripts/check-design-drift.test.mjs` (+5: the design-system root is swept, its two generated
  files are exempt, the `font:` shorthand, the namespace rule, and the reported line number) ·
  `apps/web/design-system/tokens.test.ts` (+6: the generated files are in sync, the TS union and the
  CSS agree, the override table is exhaustive, no undeclared token fork, the console's values are
  unchanged, and the ten "verbatim" tokens are genuinely absent from the brand file) ·
  `apps/web/design-system/route-manifest.test.ts` (+9: the manifest and the filesystem agree, every
  state id is approved, `APPROVED.md` agrees, every inventory surface has a row, the D13 denominator,
  both-booleans coverage, deferral owner+date, seam↔frame, and sprint sanity).
- **the regenerate-produces-no-diff checks** run in the deterministic gate:
  `extract-css.mjs --check` in the static job, `measure-contract.mjs --check` + a 32-state render in
  the e2e job (they need Chromium), and `design-coverage.mjs --check` with the ratchet.
- **browser smoke owed:** yes, to Daniel — **the before-baseline contact sheet of all 29 routes**
  (authed; a real session is required and no automated smoke can sign it off). One page, 29 shots.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.
  ⚠️ **CORRECTED (D5-a):** the visual gate lives in the **`authed`** project, not `browser`, and
  `ci.yml` already runs it as its own blocking step with all thirteen gate env vars mirrored. The
  `browser` project runs **nowhere** — `landing.browser.spec.ts` is red on `main` for that reason.
  Every new visual row lands in `authed` or it is not in the gate.

## Sprint 1 — Smoke walkthrough (do these in order)

> ⚠️ **REWRITTEN AT THE LOCK (D9).** As scaffolded, steps 1–3 said *"the branch preview"*.
> **A preview deployment of this app cannot serve a signed-in or database-backed page**: Preview
> holds six env vars and **none of the four Supabase ones** (they are Production-only, and
> `vercel integration list` reports no resource injecting them), so `lib/supabase.ts` throws; every
> preview probed also answers **302** at `/` and `/login` behind deployment protection. A step
> written against a preview URL is a step nobody can run — and it reads exactly like a step that
> passed. Steps 1–3 are **local**; step 4 is **production**.

Env: steps 1–3 **local, on a fresh clone of the branch** · step 4
**production · https://goldenfrijoles.com**.

1. On a **fresh clone** of the branch (`git clone`, `npm ci`, nothing else), run
   `node apps/web/design-system/render-reference.mjs`
   → **32** PNGs are written into `apps/web/design-system/reference/`, and the last line reads
   `zero page errors`. No `ERR_MODULE_NOT_FOUND`.
2. Run `node apps/web/design-system/measure-contract.mjs --check`
   → It exits **0**, and the spec file it emits shows the project switcher as **`122 × 30`** and the
   feature row as **`1118 × 71`** — not `140 × 30` and `78`. Now hand-edit one number in the emitted
   file and re-run `--check` → it exits **non-zero** and names the row. A regenerator that cannot
   fail is not a regenerator.
3. Open the PR's CI run, step **Design coverage + ratchet**.
   → It reports:
   ```
     has an approved state          27 / 27  (100%)
     renders from design-system/     0 / 27  (0%)
     COVERED (both)                  0 / 27  (0%)
   ```
   ⚠️ *Corrected at the lock. The scaffold expected `1/29`. Two things changed: the denominator is
   **27**, not 29 (**D13** — Story 4.5 retires three routes, Story 4.3 adds one), and the covered
   count is **0**, not 1 — every route has an approved state because all 32 states are committed,
   and **nothing renders from the design system yet**, which is exactly true of a sprint that
   changes no product pixel.*
   **A covered count above 0 at this point is the bug.**
4. Go to https://goldenfrijoles.com/app/flags/miyagisanchez (signed in).
   → The page looks **exactly as it does today**: 3 feature rows, one line standing for the 39 that
   have never been turned on in Production, the same chrome. **This sprint changes no product
   pixel** — if anything moved, that is the bug report.

If any step fails, note the step number + what you saw — that's the bug report.
