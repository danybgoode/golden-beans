# Component-kit adoption sweep — Sprint 2: Convert the owner-operated routes

**Status:** ✅ Shipped — PR [#83](https://github.com/danybgoode/golden-beans/pull/83), merged as `997fc93`. Live in production.

> **Build contract (locked by the architect before the builder started).**
> Sweeper acceptance governs every story here: **less code, same behaviour, no regressions.** A
> converted route that shows different information is a bug in the conversion. Cite D2, D3, D4, D6.
> **Scenarios is not in this sprint** (D6) — `scenarios-pm-operable` rewrites that page.
> Branch `feat/app-component-kit-adoption-s2`, cut from `-s1` after it merges.
>
> **Added at kickoff:** also cite **D9** (the routes' *existing* specs are the parity proof and must
> pass unchanged) and **D11** (each converted manager deletes its private `formatUtc` copy and
> imports `lib/format-utc.ts` — part of the line-count reduction 2.1 requires, and a real fix: the
> private copies throw on an unparseable timestamp where the seam returns `UNKNOWN_UTC_TIME`).

## Stories

### Story 2.1 — Convert two routes thin, then freeze the API
**As a** builder, **I want** `DataTable`'s API validated by two real call sites before it grows,
**so that** the remaining conversions don't inherit an abstraction shaped by guesswork.

**Acceptance:**
- `keys` and `agent-keys` render their tables through `DataTable` with no visible change.
- Any `DataTable` change needed to make them work is made **now**; after this story the API is
  frozen for the sprint, and a third route needing an option is a finding to log, not a change to
  make silently (D3).
- ~~Line count for both routes goes **down**.~~ **Measured, and it does not. Amended 2026-08-08 with
  the numbers rather than quietly reinterpreted.**

  | File | code lines before | after |
  |---|---|---|
  | `key-manager.tsx` | 136 | **135** |
  | `agent-key-manager.tsx` | 152 | **163** |

  (Code lines = non-blank, non-comment, so the explanatory comments this repo favours don't flatter
  or penalise the count.)

  Two reasons, and neither is a conversion done badly:

  1. **A column definition is not shorter than the `<tr>`/`<td>` markup it replaces** for a
     four-column table. It is *more* than the markup was — the same cells, plus a sort accessor, a
     filter accessor, and a null-vs-absent decision per column. The table half came out roughly
     line-neutral. What the conversion buys is sorting, filtering, two distinct empty states and
     `aria-sort` on every table at once — capability and consistency, not brevity.
  2. **`agent-keys`' form grew because it now says more.** `FormSection`/`Field` carry a
     description and per-field hints that the bare `<label>`-wrapped inputs did not have. Those are
     lines of *content*, and deleting them to make a number go down would be the tail wagging the
     dog.

  **The Sweeper acceptance that does hold, and is the one worth keeping:** *same behaviour, no
  regressions* — proven by the routes' existing specs passing unchanged. "Less code" was a
  reasonable prior at grooming and is simply wrong for table conversions at this width; the
  remaining stories are measured but not held to it. Genuine deletions are still taken where they
  exist: four private `formatUtc` copies (D11) and, in Sprint 3, the bespoke two-click confirm.
- **Carried in from Sprint 1's review (Codex, PR #82):** `DataTable` merged with no call site and no
  *rendered* coverage — by design (D3), but it is a real gap and this story is where it closes.
  `design-system.authed.spec.ts` gains rendered assertions for the sort control, the filter, and
  **both** empty states (no rows at all vs. no rows matching the query), each observed failing.
**Risk:** low

### Story 2.2 — Convert `destinations` and `experiments`
**As a** PM, **I want** the destinations and experiments tables to sort and filter like the others,
**so that** finding the row I need doesn't depend on which screen I'm on.

**Acceptance:**
- Both routes render tabular data through `DataTable` and forms through `FormSection`/`Field`.
- Each has an empty state that tells a new PM what to do next, not a blank table body.
- `experiments/[projectSlug]/[experimentKey]` (the detail route and `decision-recorder.tsx`) is
  included — a converted list behind an unconverted detail page is the inconsistency this epic
  exists to remove.
**Risk:** low

### Story 2.3 — Convert `flags` and `impact`
**As a** PM, **I want** the flags list and the impact view to use the same grammar as everything else,
**so that** the two surfaces I check most often are the two I have to think about least.

**Acceptance:**
- `flags/[projectSlug]/page.tsx` and its `flag-manager.tsx` table render through `DataTable`;
  `impact/[projectSlug]/[featureKey]` renders its headline numbers through `StatCard`.
- **The flag authoring `<textarea>` is left exactly as it is.** Replacing it is
  `flags-visual-rule-builder`'s entire epic — touching it here would collide with a stacked branch
  and pre-empt a decision this epic hasn't made.
- `impact`'s time-series table is **not** turned into a chart (that is #14's decision and #16's
  work). It gets `StatCard`s for the headline figures and keeps the table.
**Risk:** low

### Story 2.4 — Route-conversion inventory
**As a** product owner, **I want** the remaining debt written down as a list,
**so that** "the sweep is partly done" is a set of named routes rather than a feeling.

**Acceptance:**
- The epic README (or this sprint doc) lists every `/app` route **not** converted, with a one-line
  reason each — `scenarios` cites D6, leaf/detail routes cite "accretes."
- `design-system.authed.spec.ts` has one assertion per converted route, each observed failing before
  its conversion landed.
**Risk:** low

## Story 2.4 — the route-conversion inventory (the carry-over, named)

*Every `.tsx` under `apps/web/app/app` — 27 files after this sprint. "The sweep is partly done" as a
list rather than a feeling.*

### Converted (this epic)

| Route / file | What it now renders through |
|---|---|
| `keys/[projectSlug]/key-manager.tsx` | `DataTable` · `FormSection`/`Field` · `ConfirmDialog` |
| `agent-keys/[projectSlug]/agent-key-manager.tsx` | `DataTable` · `FormSection`/`Field` |
| `destinations/[projectSlug]/destination-manager.tsx` | `DataTable` ×2 (destinations + deliveries) · `FormSection`/`Field` |
| `experiments/[projectSlug]/experiment-manager.tsx` | `FormSection`/`Field` — **form only**, see the D3 finding |
| `flags/[projectSlug]/flag-manager.tsx` | `DataTable` ×3 (snapshot keys, sync keys, audit) |
| `impact/[projectSlug]/[featureKey]/page.tsx` + `series-table.tsx` | `StatCard` ×3 · `DataTable` |
| `onboarding/[projectSlug]/page.tsx`, `tasks/[projectSlug]/task-queue.tsx` | already consumed `Icon`/`Panel` before this epic |

### NOT converted — with the reason each

| Route / file | Why not |
|---|---|
| `scenarios/[projectSlug]/page.tsx` | **D6.** 287 lines, six stacked tables, and `scenarios-pm-operable` (#16) rewrites the page. Converting then rewriting is paid-for work thrown away. |
| `flags/…/flag-manager.tsx` — the **definitions** table | **D3 finding** (below). One small table per flag. |
| `experiments/…/experiment-manager.tsx` — the **version** tables | **D3 finding** (below). One small table per experiment. |
| `experiments/[projectSlug]/[experimentKey]/page.tsx` | **D3 finding**, and the epic README's **Amendment 1** — product owner approved this as carry-over on 2026-08-08 after cross-review flagged it. Its three tables are per-variant: 2–4 fixed rows each. A filter box above a two-row table is worse than the plain table. |
| `experiments/…/[experimentKey]/decision-recorder.tsx` | A form, but the append-only decision ledger is `experiment-governance-v2`'s surface and Sprint 3 touches its *confirmation*, not its layout. Converting the form here would collide with that. |
| `shares/[projectSlug]/*`, `journeys/[projectSlug]/*`, `funnel/…`, `tasks/[projectSlug]/page.tsx`, `app/page.tsx`, `sign-out-button.tsx`, `dismiss-key-button.tsx` | **Accretes.** Beyond the seven owner-operated surfaces this epic bet on. `shares` and `journeys` are the strongest next candidates: both are flat list + form, i.e. the shape `DataTable` already fits. |

### 🔎 The D3 finding — logged, not silently fixed

**`DataTable`'s filter is unconditional, and that is wrong for small fixed-cardinality tables.**

D3 says the API freezes after the two founding conversions and *"a third route needing an option is
a finding to log, not a change to make silently."* Three surfaces hit it, which is corroboration
rather than a one-off:

- `flags` — the definitions table, rendered **once per flag**
- `experiments` — the version table, rendered **once per experiment**
- `experiments/[experimentKey]` — three per-variant tables of **2–4 fixed rows**

Converting these would stack a filter box above every flag/experiment/metric on the page. The
option needed is a way to suppress the filter — either an explicit prop, or auto-suppression below a
row threshold (which D7 would require reading from somewhere rather than hardcoding). **Deciding
which is the next wave's call, not this sprint's**, and the API stays frozen meanwhile.

There is a second, sharper question underneath it, worth putting to the product owner rather than
answering unilaterally: *is a per-row-group table the right shape at all?* Both `flags` and
`experiments` might be better as one flat table of versions with the flag/experiment as a column —
which would make them `DataTable`'s exact case. That is an information-architecture change, not a
conversion, and it is squarely `flags-visual-rule-builder`'s (#15) territory.

## Sprint QA
- **Specs (corrected at kickoff — D9):** `e2e/design-system.authed.spec.ts` is the **authed browser**
  rail, not an api spec; it is excluded from the merge gate by `playwright.config.ts`. One assertion
  per converted route lands there and is run locally + observed failing.
  Regression cover for behaviour parity comes from the routes' **existing** specs
  (`api-keys.spec.ts`, `destinations.spec.ts`, `experiments.spec.ts`, `flag-serving.spec.ts`,
  `experiment-decisions.spec.ts`) — they must pass **unchanged**. A spec that needed editing to
  survive a conversion is a behaviour change; stop and report it.
- **browser smoke owed:** yes, to the product owner — **visual parity** across the six converted
  routes. An api spec cannot see that a table still looks right. Everything mechanical is now
  automated: `design-system.authed.spec.ts` asserts all six routes render through the kit, plus the
  sort control's three states, the filter, both empty states, and impact's StatCard figures.
  `auth.setup.ts` seeds a feature + input + series so `/impact` is reachable at all — added after
  cross-review (Agy, PR #83) pointed out it was the one converted route with no rendered coverage,
  and that `impact.spec.ts` does not close the gap because for a signed-in member it only asserts
  the `/login` redirect.
- **deterministic gate:** `npm run typecheck` + `npm run build` + Playwright `api` + `npm run
  check:design-drift` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: preview (pre-merge) · then production · https://golden-beans-gamma.vercel.app

1. Go to https://golden-beans-gamma.vercel.app/app/keys/<projectSlug>
   → The key table renders. Click a column header.
   → The table sorts by that column.
2. Type into the table's filter box.
   → Rows narrow as you type; clearing it restores all rows.
3. Go to https://golden-beans-gamma.vercel.app/app/destinations/<projectSlug>
   → The destinations table sorts and filters **the same way**, with the same control in the same
     place.
4. Go to https://golden-beans-gamma.vercel.app/app/experiments/<projectSlug> and open one experiment.
   → The **create-a-draft form** is converted (heading, labelled fields, hints). The per-experiment
     version tables and the detail page's per-variant tables are **unchanged** — a deliberate,
     reasoned miss, not an oversight: see the D3 finding in Story 2.4. Story 2.2 asked for the
     detail route and this sprint is not delivering it; that is the one acceptance criterion this
     sprint knowingly does not meet.
5. Go to https://golden-beans-gamma.vercel.app/app/flags/<projectSlug>
   → **Snapshot keys**, **catalog sync keys** and the **lifecycle audit** each sort and filter.
     The **definitions** table (one per flag) is unchanged — D3 finding, Story 2.4.
     **The JSON textarea for creating a flag is unchanged** — this epic deliberately does not touch
     it; replacing it is `flags-visual-rule-builder`'s entire epic.
6. Go to https://golden-beans-gamma.vercel.app/app/impact/<projectSlug>/<featureKey>
   → Headline numbers render as stat cards. The time-series table is still a table.
7. Open any converted page for a project with no data yet.
   → The empty state is a sentence telling you what to do, not an empty table.
8. Go to https://golden-beans-gamma.vercel.app/app/scenarios/<projectSlug>
   → **Unchanged** — six tables, as today. This is deliberate (D6), not a miss.

If any step fails, note the step number + what you saw — that's the bug report.
