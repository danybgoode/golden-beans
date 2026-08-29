---
title: "One design system, every surface — the rails that make a design outlive an epic"
slug: design-system-rails
status: scaffolded
area: "02"
type: feature
priority: null
appetite: L
underwritten_by: null
risk: high
epic: "02-commercial/design-system-rails"
build_order: 26
updated: 2026-08-29
---

# Pitch — One design system, every surface

> **Approved scoping review (2026-08-29):** the ten approved states re-rendered, the five gaps, the
> six failure mechanisms and the four rails were put to the product owner as a visual document and
> **approved**. Three decisions were locked there and are carried into this pitch as given, not
> re-opened: **in-repo shared code** as the design source of truth; **the approved prototype IS the
> design language**; **scope is 29 routes**.

## Problem

**The console-ia-overhaul epic shipped a correct information architecture and a rejected visual
result, and the reason is structural rather than anyone's carelessness.** Its own
`CONSOLE-CONTRACT.md` says so in the first paragraph: every acceptance criterion in Sprints 1–2 was
*structural* — "the header renders one project switcher and four sections" — the build satisfied
**all** of them, and it looked like a different product.

Five concrete gaps remain on screen today, all traced to a specific line:

| What the design shows | What is on the screen | Where |
|---|---|---|
| One environment **button**, `● Production ▾`, opening a menu | All three environments as a permanently-expanded list of lowercase links | `app/app/flags/[projectSlug]/environment-picker.tsx` |
| Active rail item as a **raised card** — lighter fill, 1px border, gold icon, full-strength text | Fill only — `--card-2` `#2b2318` on the `--roast` `#16120d` ground. No border, no icon, no accent | `app/console.css:319` |
| A **leading icon** on every rail item | The label and nothing else; `ProjectSurfaceLink` has no icon field, so there is nowhere for one to come from | `components/product/ConsoleRail.tsx` |
| Connector URL + status + a numbered **three-step card** ending in **Add to Claude ↗** | The credential half only. No steps, no button, no copy field | `app/app/setup/connect/[projectSlug]/page.tsx` |
| One page that **owns** credentials, with **+ New key** | A list that links back out to the three legacy routes to mint | `app/app/setup/keys/[projectSlug]/page.tsx` |

**Six mechanisms produce that gap, and they compound.** Each is evidenced from the epic's own
retrospective and contract, not inferred:

- **A — nothing could go red on an ugly page.** Structural criteria only; "done" and "right" were
  different conditions and only one was checked.
- **B — the design was explicitly demoted.** WAYS-OF-WORKING's *"reference end-states are
  inspiration, never signed-off scope"* was applied to a design the product owner had personally
  approved. Withdrawn only after two sprints shipped (epic A20/A22).
- **C — the contract claimed to be measured and was partly typed.** Two of its numbers do not survive
  re-measurement: the project switcher is **122×30, not 140×30**; the feature row is **71px, not
  78px**. `78` was then reasoned about downstream as declared design intent.
- **D — the regenerator was never committed.** Both `measure-contract.mjs` and
  `render-reference.mjs` import `_harness.mjs`, which was absent from the repo for four days: on a
  fresh clone both died with `ERR_MODULE_NOT_FOUND`, through the entire build. Nothing in CI ran them.
- **E — the gate was born with exemptions.** `console-visual.authed.spec.ts` is real and wired into
  CI, and it covers **one route** with **five deferred rows** — two of which defer to the numbers
  Mechanism C shows are unreproducible.
- **F — the design lives inside an epic, and epics close.** The prototype, the contract, the
  reference renders and the extracted CSS all sit in
  `Roadmap/02-commercial/console-ia-overhaul/design/`, a folder named after work now marked
  `shipped`. Nothing in it describes `/hub`, `/login`, Experiments, Journeys, Tasks, Scenarios,
  Destinations or Shares. **The next epic opens its own `design/` folder and the cycle restarts.**

Mechanism F is the answer to *"I have tried this many times and it has always failed."* Three prior
design epics — `design-system-lift` (#9), `app-component-kit-adoption` (#13),
`app-shell-and-agent-rail` (#12) — each produced a design scoped to itself. **A design system scoped
to an epic expires with the epic.**

## Appetite

**L — a multi-wave epic, re-bet at each wave boundary.**

The product owner's words were *"the appetite is XXL"*, and the enforced enum is `S | M | L`
(`build-order.mjs` hard-fails an unrecognised value). **L is the honest encoding, not a shrink:**
WAYS-OF-WORKING defines L as *a multi-wave epic* whose circuit breaker is *per-wave re-betting*.
XXL is delivered as six sprints across two or three waves, each wave re-bet at its boundary — not
as one unbounded run.

**What the appetite buys, and what it forbids.** It buys the system and full coverage of 29 routes.
It forbids growing scope mid-flight: if a wave exhausts its appetite, work stops and returns to
shaping. Sprint 5's charting primitive is the most likely place that happens, and it is named as a
rabbit hole below for exactly that reason.

## Outcome & signal

**After this ships:** every one of the 29 in-scope routes renders from one shared design system,
each has an approved reference state, and the visual gate is blocking for all of them. Coverage is
a generated number that cannot go down.

**How the product owner tests it, in one sentence per claim:**

1. Open any in-scope route beside its approved state — they match.
2. Hand-edit a padding value in a page's CSS, push — **CI goes red**, naming the route and the row.
3. Add a new route without a reference state — **the coverage manifest goes red**, not silently green.
4. Delete `--card-2` from the token file — **every consumer breaks at build time**, because there is
   only one place it was defined.

## Stage-2.5 bucket

**Genuinely new — with an unusually large reuse list.** The lighter paths were tested and rejected
on evidence, not skipped:

- *Already possible?* **No.** There is no mechanism that can fail a build on the way a page looks
  beyond one route, and no source of truth outside a closed epic's folder.
- *Light enhancement?* **No, and this is the trap that produced the current state.** Fixing the five
  gaps in the table above is roughly a two-day story and would leave every one of the six
  mechanisms in place — which is precisely what the last three attempts did.

## Bill of materials (What / Why)

| What | Why |
|---|---|
| `apps/web/design-system/` — tokens, primitives, states | A home that no epic can close. Kills Mechanism F. |
| The app imports it; the prototype renders **from it** | Deletes the hand-porting step. `console-reference.css` is extracted verbatim then hand-mapped onto `.product-shell__*` — the contract calls that mapping "the work", and it is where the design dies. Identity, not comparison. |
| One token file, three copies retired | `references/design/assets/tokens.css`, the prototype's inlined `:root`, and `console.css`'s own set are three sources for one palette. |
| Reference states as **named renderable states**, not stored PNGs | A checked-in baseline drifts from the design it claims to represent. Derive it. |
| `measure-contract.mjs` **emits** the spec file | A number that cannot be regenerated cannot be committed. Kills Mechanism C. |
| Coverage manifest, generated, ratcheted | Makes 29 routes finishable, and makes an off-system page visibly a debt. Kills the rest of E. |
| Visual gate driven by the manifest, not one hand-written route | One route gated out of 29 is a sample, not a gate. |
| `check-design-drift.mjs` extended to `components/ui` + `components/product` | The audit named this gap by hand (§10.5): the guard walks all of `apps/web/app` and **not** the two directories new primitives land in. |
| `Icon` set for the rail and every surface | The guard **bans pictographs inside `/app`** — which is why no icons were ever added. SVG `Icon` components are the only permitted route, and that is a build task, not a CSS one. |
| Charting primitives (funnel bar, sparkline, comparison bar, rollout ring) | Audit §2.3: **zero data visualization anywhere in an analytics product**, and no chart library installed. The approved states show stat numbers and funnel figures. |
| WAYS-OF-WORKING amendment: an **approved** design is signed-off scope | Kills Mechanism B at its source. One paragraph, and it is the cheapest item here. |
| `console.design_v2_enabled` kill-switch | See the Stage-6b block. |

## Scope

**In v1 — 29 routes.**

- **Signed-in console (20):** `/app`; `flags` list + `[flagKey]`; `funnel`, `impact`; `journeys`
  list + `[journeyKey]`; `experiments` list + `[experimentKey]`; `tasks`, `scenarios`,
  `destinations`, `shares`, `flag-audit`; `keys`, `flag-credentials`, `agent-keys`; `onboarding`;
  `setup/connect`, `setup/keys`.
- **Roadmap hub (4):** `/hub/[project]`, `/hub/[…]/epic/[epicSlug]`, `/hub/[…]/horizon`,
  `/hub/[…]/report`.
- **The doors (5):** `/login`, `/signup`, `/install`, `/s/[token]`, `/talk`.

**Out of v1 (no-gos) — each is a deliberate exclusion so the appetite holds:**

- **The marketing landing (`/`) and `/methodology`.** Both carry recent, separately-approved design
  epics (`landing-frijoles-rebrand`, `methodology-experience`). Reopening them doubles the surface
  and re-litigates approved work. They adopt the shared tokens as a follow-on, not here.
- **No new visual language.** Locked at the scoping review: the approved prototype **is** the
  language. This epic systematises and extends it; it does not re-explore it.
- **No IA changes.** The four sections, the per-feature destination and `⌘K` were settled by
  `console-ia-overhaul` and are inherited, not revisited.
- **No new data, no new tables, no new auth boundary.** Every route keeps its current gate.
- **No light theme.** The product commits to `color-scheme: dark`; a second theme is a separate bet.

## Rabbit holes

- **The charting primitive can eat the whole appetite (Sprint 5).** Audit §6.7 leaves the choice
  open — Observable Plot, visx, or hand-rolled SVG on the token set. **Patch it in advance: the
  architecture lock picks one, in writing, before Sprint 5 opens, and hand-rolled SVG is the default
  unless a lock finding beats it** — it is the only option with no dependency, no bundle cost and no
  second theming system, and the guard already permits inline styles outside `components/landing`
  so dynamic bar widths are legal.
- **The `ProductShell` seam does not reach the doors.** `/hub/*`, `/login`, `/signup`, `/install`
  and `/s/[token]` do **not** render through `ProductShell`, so the one-resolver kill-switch below
  covers 20 of 29 routes and not the other 9. Decide the second seam at the architecture lock — do
  not discover it in Sprint 6.
- **Two visual systems live at once between S3's flip and S6's deletion.** That is deliberate (it is
  what makes rollback possible), and it means every S4–S6 story pays a two-branch cost. **The
  mitigation is the epic's own prior lesson:** land the replacement and retire the original in the
  *same* story (A3), never as a cleanup sprint.
- **Landing rules leak into the console through shared class names.** This already happened three
  times in one epic — `tokens.css`'s `.tag` and `.note` are landing rules, and a `font:` shorthand
  resets family and weight, so overriding only `font-size` leaves the rest in place. Namespacing the
  design system's classes is a Sprint 1 decision, not a Sprint 6 discovery.
- **A "no horizontal scroll" assertion can pass under `display: none`.** The epic's closing lesson:
  counting `querySelectorAll('[role="columnheader"]')` passes on hidden elements. **Every assertion
  in the new gate must be observed failing on a deliberately mutated page**, not merely observed
  passing.
- **Do not rewrite the contract's two wrong numbers by hand.** 122×30 and 71px must arrive from a
  regenerated table, or Mechanism C is being repeated in the act of fixing it.

## What already exists (reuse, don't rebuild)

**Golden — use directly:**

- `references/design/assets/tokens.css` — imported first by `apps/web/app/globals.css`, and the
  drift guard asserts that import. **The palette is already loaded in the signed-in app.**
- `Roadmap/02-commercial/console-ia-overhaul/design/` — the approved prototype, `console-reference.css`
  extracted verbatim, `CONSOLE-CONTRACT.md`, `measure-contract.mjs`, `render-reference.mjs` and
  `_harness.mjs`. **Move it, do not rebuild it.** All three scripts verified running 2026-08-29.
- `apps/web/components/ui/` — `Panel`, `Button`, `Badge`, `Icon`, `DataTable`, `StatCard`,
  `FunnelBars`, `RolloutBar`, `ConfirmDialog`, `ActivityFeedItem`, `FormSection`, `AgentWindow`,
  `ContextCard`, `ChatThread`. **The primitives largely exist and are reasonably built** (audit §2.2);
  several §6.7 asks have since landed.
- `apps/web/components/product/` — `ProductShell`, `ConsoleRail`, `CommandPalette`, `CommandCenter`,
  `AgentRail`, `RailDisclosure`, `ShellErrorBoundary`.
- `apps/web/lib/project-route-inventory.ts` — every surface with label, audience, gate, description,
  unit-tested. **The coverage manifest extends this; it needs no second list.**
- `apps/web/lib/flags.ts` — 20+ existing `=== 'true'` gates; `CONSOLE_SHELL_ENABLED` is the direct
  precedent for the new flag's shape and its mid-epic flip.
- `apps/web/app/app/flags/[projectSlug]/flag-vocabulary.ts` — the one module owning user-facing flag
  words. **The product vocabulary generalises this; it does not replace it.**
- `apps/web/e2e/console-visual.authed.spec.ts` — the existing visual gate, and the shape the
  manifest-driven one grows from.
- `scripts/check-design-drift.mjs` + `.github/workflows/design-drift-guard.yml` + `.githooks/pre-commit`
  — a working guard against raw hex, inline styles and pictographs across `apps/web/app`.
- `references/ux-guidelines.md` — the behaviour layer, including the full state taxonomy
  (idle · hover · focus · pressed · loading · success · error · empty · disabled). **Drafted, never
  applied to a primitive.** Sprint 2 is largely this document, executed.

## UX heuristics & rails check

- **CI guards covering this surface:** `npm run check:design-drift` (raw hex · inline style ·
  pictographs) across `apps/web/components/landing` and **all of `apps/web/app`**, wired into
  `design-drift-guard.yml` and `.githooks/pre-commit`; `console-visual.authed.spec.ts` in the
  Playwright `browser` project. **Named gap (audit §10.5):** the drift guard does **not** cover
  `apps/web/components/ui` or `components/product` — the exact directories every new primitive lands
  in. Closing that is Sprint 1.
- **Audits-lens findings that apply:** `00-ideas/audits/app-ux-audit-2026-08-01.md` — **§2.2** (one
  route in twenty-six used the component kit), **§2.3** (zero data visualization in an analytics
  product; no chart library installed), **§6.7** (the new primitives needed), **§7 P0** (adopt the
  kit across all routes; add a charting primitive), **§10.5** (the rails already covering this
  surface, and the guard's directory gap).
- **Design-language debt:** three copies of one palette; `globals.css`'s `.product-shell main > h1`
  forcing `clamp(30px, 7vw, 48px)` against an approved 23px/700 (contract Do-not #1); generic tag
  selectors doing the work of components across ~25 routes; landing rules reaching the console
  through shared class names; five deferred rows in the only visual gate.

## Kill-switch / runtime gate (risk: high — Stage 6b)

**A runtime seam exists for 20 of 29 routes. Recommended as a story, for the product owner to
evaluate at this gate.**

- **Flag:** `console.design_v2_enabled`, extending `DEFAULT_FLAGS` in `apps/web/lib/flags.ts`.
- **Polarity: enablement / dark-launch — default `false`, created DISABLED in every env,** flipped
  ON deliberately at the **end of Sprint 3** (the shell). After the flip it serves as the
  kill-switch for Sprints 4–6. This mirrors `CONSOLE_SHELL_ENABLED`'s mid-epic flip, and it is what
  the last epic's own retrospective recommends: *"with the console LIVE since Sprint 2 there was no
  dark period in which a missing control would have gone unnoticed."*
- **Seam:** `components/product/ProductShell.tsx` — one resolver, `isDesignV2Enabled()`. Every
  `/app` route renders through it, so one check covers all 20 by construction.
- **⚠️ Stated gap, not assumed away:** `/hub/*`, `/login`, `/signup`, `/install` and `/s/[token]`
  do **not** render through `ProductShell`. **The second seam for those nine routes is an open
  question for the architecture lock** (the root `layout.tsx`, or a `PublicShell` introduced in
  Sprint 6), not a settled "one flag covers everything".
- **Mechanism:** env-var gates read `=== 'true'` per `lib/flags.ts`'s own 17 comments — *set ≠ live*
  — and created in **every** Vercel scope. Per epic A2, Preview does not mirror Production's gates;
  each sprint walkthrough must say which environment each step is for.

## Acceptance criteria

Per sprint, in the epic README and sprint files. The four the product owner runs personally are the
four numbered checks under **Outcome & signal** above.

## Open risks / research

- **The two unreproducible contract numbers must arrive from a regenerated table** (Mechanism C), not
  a hand-edit, or the fix repeats the defect. Re-measured 2026-08-29: switcher `122×30`, feature row
  `71`.
- **No chart library is installed** (`apps/web/package.json`, confirmed 2026-08-29). Adding one is a
  shared-surface change with a bundle cost — architect-owned, done first, or avoided entirely by
  hand-rolled SVG.
- **Preview does not mirror Production's gates** (epic A2, `vercel env ls` 2026-08-27): a member sees
  **9** surfaces on a branch preview, not 13. A gate-on walkthrough step written for Preview renders
  a correct page that reads exactly like a broken one.
- **The `authed` Playwright project is still not the blocking gate** — one file of it is; the other
  84 specs run in no pipeline. This epic makes the visual half blocking for 29 routes; it does not
  fix that wider gap, and says so rather than implying it.
- **`landing.browser.spec.ts:630` is red on `main`** (`expected > 3, received 2`), inherited and
  belonging to a landing epic. Reported, not adopted.
