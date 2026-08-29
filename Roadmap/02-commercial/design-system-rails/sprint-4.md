# One design system, every surface — Sprint 4: Ship and Setup, finished

**Status:** ⬜ not started

> **Ship and Setup are the two sections that already have approved states**, so this sprint is
> execution against pixels rather than design. Six of the ten approved renders are here, and
> **three of Daniel's five named complaints** are closed by Stories 4.4 and 4.5.
>
> **The flag is ON from Sprint 3.** Every story here lands the replacement and retires the original
> **in the same commit** (`console-ia-overhaul` A3) — never as a cleanup story, because with the
> shell live there is no dark period in which a missing control goes unnoticed.

## Build contract (locked by the architect before the builder started)

> Sprint 4 is **delegated per story** over this contract — except **Story 4.5, which stays with the
> architect**: it moves credential minting and retires three live credential routes, and credentials
> are the never-delegated row (README → *Routing*). **Cite a decision; never re-derive one.**

**Paths this sprint owns.** `apps/web/app/app/flags/**` · `apps/web/app/app/funnel/**` ·
`apps/web/app/app/impact/**` · `apps/web/app/app/flag-audit/**` · `apps/web/app/app/setup/**` ·
`apps/web/app/app/{keys,flag-credentials,agent-keys}/**` (retirement) ·
`apps/web/app/app/{destinations,shares}/**` · `apps/web/lib/credential-inventory.ts` ·
`apps/web/design-system/**` · the three specs in Sprint QA.

| # | The contract | Cites |
|---|---|---|
| 1 | ⚠️ **THE LIVE DATASET IS NOT THE PROTOTYPE'S.** Production `miyagisanchez`, 2026-08-29: **42 flags, 3 active in Production, 39 never activated, 0 deliberately off.** The design's *"42 → 2 rows + 1 line"* is the prototype's data. On the real page it is **3 rows + one line standing for 39**. Assert the *shape* — rows plus at most one summary, and the summary standing for rows that are not also listed — never the literal 2. | **D10** |
| 2 | The three cheap assertions apply per route at 1440×960: **no vertical page scroll**, the expected row count, **no horizontal page scroll, ever**. Wide content scrolls inside its own `overflow-x: auto` container (Do-not #6). | Do-not #6 |
| 3 | ⚠️ **A tab must never call `notFound()`.** `funnel/[projectSlug]/[featureKey]/page.tsx:26` does exactly that on `feature_not_found`. Verified live: `miyagisanchez` holds **42 flag registries and exactly ONE TARS feature (`setup_guide`)** — so 42 of 42 flags have no funnel, and today clicking Funnel on any of them 404s the whole feature page. The empty state **names which absence it is** and is the deliverable. | **D10** |
| 4 | The funnel-renders-numbers spec belongs on **`setup_guide`**, the one feature that has a funnel. Asserting numbers on a flag's tab is a test that cannot pass. | **D10** |
| 5 | ⚠️ **`lib/credential-inventory.ts` carries a FALSE claim about a live bearer credential.** Its comment and its `CREDENTIAL_KINDS_NOT_LISTED` entry both say `flag_admin` *"has no minting surface and no live rows"*. Production holds **one unrevoked `flag_admin` key** — *"Miyagi Cloud Run flag administration"*, created 2026-07-28, project `miyagi`. On the page whose whole job is an accurate access inventory, that is a live credential omitted under an untrue justification. **Story 4.5 corrects it.** | **D11-3** |
| 6 | The **four** mint kinds are correct and are `ingest` · `flag_read` (needs an environment) · `flag_sync` (needs a source) · `agent_write` (needs an expiry from an allow-list). `share`, `connector` and `flag_admin` are deliberately elsewhere and the page **says so**. The schema's `CHECK` allows all six — do not widen the page to match the schema. | `credential-inventory.ts` |
| 7 | **The key value is shown once, on a screen of its own, with a copy button.** Never a value read off a table. | Story 4.5 |
| 8 | `requireProjectOwnership` is called **at the route**, and every mint and revoke action re-asserts ownership **independently**. Identical to today, **never looser**. A member gets a flat 404. | AGENTS |
| 9 | Setup › Connect: **keep the shipped credential half** — status, the multi-token warning, and **server-side filtering of `tokens` before they cross the client boundary**. A member must not be able to read a bearer URL out of View Source. | Story 4.4 |
| 10 | The connector status line says **only what the data supports**: `connector_tokens` records no use, so the page says a URL exists and says out loud that existing is not the same as being used. Verified: `miyagisanchez` has exactly **1** connector token. | **D10** |
| 11 | **Land the replacement and retire the original in the SAME commit.** With the shell live from Sprint 3 there is no dark period in which a missing control goes unnoticed. Never a cleanup story. | `console-ia-overhaul` A3 |
| 12 | Coverage reaches **13/29** by the end of this sprint, and the manifest is what says so. | **D5** |

## Stories

### Story 4.1 — Ship › Features
**As a** person operating a project, **I want** the features list to read as the approved design,
**so that** what Production is serving is legible on one screen.
**Acceptance:** matches reference state **01** and **02** — the answer line with its gold left
border, four stat tiles, the search/filter/group row, the header row at 11/600 uppercase Archivo
(**never mono**), feature rows, and the dormant group as **one summary line replacing forty**.
- At 1440×960 with the dormant group collapsed: **no vertical page scroll, no horizontal scroll,
  and the feature rows plus at most ONE summary line.** ⚠️ **CORRECTED AT THE LOCK (D10):** the
  scaffolded *"2 rows"* is the prototype's dataset. Live on `miyagisanchez` it is **3 rows and one
  line standing for 39** (42 flags, 3 active in Production, 0 deliberately off — queried
  2026-08-29). Assert the shape, not the literal 2; the arithmetic is pinned exhaustively in
  `lib/flag-list-view.test.ts` where the dataset is controlled. The shipped page was ~2400px tall
  with 25 rows and clipped tables — that is what these three assertions catch.
- **Wide content scrolls inside its own `overflow-x: auto` container** (Do-not #6).
- The **compare-environments** view (reference state **10**) ships with the list, since the button is
  already in state 01 and a control that goes nowhere is worse than no control.
**Approved states:** `ship-features`, `ship-features-dormant`, `ship-compare` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 4.2 — The feature destination and its tabs
**As a** person, **I want** one page that answers the whole loop for one feature, **so that** value,
environments, funnel and impact are tabs rather than routes I type a key into.
**Acceptance:** matches reference states **03**, **04** and **05** — Value, Environments, Funnel.
- The three-state switch renders **38 × 21** with its **dashed empty "never"** state.
- ⚠️ **A tab must never call `notFound()`.** `funnel/[projectSlug]/[featureKey]/page.tsx:26` does
  exactly that on `feature_not_found`, and the two registries have **zero overlap** — verified live
  2026-08-29: `miyagisanchez` holds **42 flag registries and exactly one TARS feature**
  (`setup_guide`), so 42 of 42 flags have no funnel row. The empty state **names which absence it is** and is the
  deliverable, not a fallback.
- The funnel-renders-numbers spec belongs on a feature that **has** a funnel (`setup_guide`);
  asserting numbers on a flag's tab is a test that cannot pass.
**Approved states:** `feature-value`, `feature-environments`, `feature-funnel` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 4.3 — Ship › Activity and Scheduled changes
**As a** person, **I want** to see who changed what, where and why, **so that** the section's other
two surfaces are on the system too.
**Acceptance:** Activity matches reference state **09**. Scheduled changes renders the same row
language with its honest empty state (the rail shows `0` today).
**Approved states:** `ship-activity` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 4.4 — Setup › Connect gets its teaching half ✳ *Daniel's complaint*
**As a** person connecting an agent, **I want** the page to teach the job and then hand me the
control, **so that** setup is a task rather than a credential screen.
**Acceptance:** matches reference state **07** — the connector URL in a mono field **with Copy**, the
status pill, and the **numbered three-step card ending in `Add to Claude ↗`**.
- The credential half already shipped and shipped well — status, the multi-token warning, and
  **server-side filtering of `tokens` before they cross the client boundary**. *Keep all of it.*
  A member must not be able to read a bearer URL out of View Source.
- The status line keeps saying **only what the data supports**: `connector_tokens` records no use, so
  the page says a URL exists and says out loud that existing is not the same as being used.
**Approved states:** `setup-connect` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 4.5 — Setup › Keys mints, and the three legacy routes retire ✳ *Daniel's complaint*
**As an** owner, **I want** one page that owns credentials, **so that** the page named for the job
can do the job.
**Acceptance:** matches reference state **08** — four rows, a *what it may do* column, environment
and expiry chips, a row menu, and **`+ New key`**.
- **Minting moves onto the page in the same commit that retires `/app/keys`,
  `/app/flag-credentials` and `/app/agent-keys`.** The four mint forms genuinely differ —
  `flag_read` needs an environment, `flag_sync` a source, `agent_write` an expiry from an
  allow-list, ingest keys none — and that is the work, not a reason to defer again.
- **The key value is shown once, on a screen of its own, with a copy button.** Never a value read
  off a table.
- `requireProjectOwnership` is called **at the route**, and every mint and revoke action re-asserts
  ownership independently — identical to today, never looser.
**Approved states:** `setup-keys` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 4.6 — Destinations and Share links
**As a** person, **I want** Setup's remaining two surfaces on the system, **so that** the section is
finished rather than mostly finished.
**Acceptance:** both render from `design-system/` with the shared data table, its row menu and its
empty state; both have reference states in the manifest. Coverage reaches **13/29**.
**Approved states:** `setup-destinations`, `setup-shares` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

## Sprint QA
- **api spec(s):** `e2e/console-visual.authed.spec.ts` extended to the eight routes this sprint lands
  (manifest-driven, so this is data not code) · `e2e/setup-keys.spec.ts` (a member gets 404; each
  kind mints and revokes; the value renders once) · `e2e/feature-tabs.spec.ts` (the Funnel tab
  renders the named empty state and **does not 404** for a registry-only feature).
- **browser smoke owed:** yes, to Daniel — **minting a real connector URL** and **minting and
  revoking one real key of each kind** in Production. A real credential mint is never covered by a
  merge authorization. Also outstanding from `console-ia-overhaul` Sprint 2.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 4 — Smoke walkthrough (do these in order)
Env: **production · https://goldenfrijoles.com** — the flag is live from Sprint 3.

1. Go to https://goldenfrijoles.com/app/flags/miyagisanchez in a 1440×960 window.
   → The page **fits without scrolling**. You see **3** feature rows and one line standing for the
   **39** that have never been turned on in Production. No sideways scrollbar.
   ⚠️ *Corrected at the lock (D10): the scaffold said "2 rows … 40 features", which is the
   prototype's data. Production was re-counted 2026-08-29 — 42 flags, 3 on, 39 never, 0 off.*
2. Click **Show them**.
   → The 39 expand in place. Row height and chrome are unchanged.
3. Click `checkout.stripe_enabled`, then the **Funnel** tab.
   → You get a sentence naming *why* there is no funnel — not a zero, and **not a 404 on the whole
   feature page**.
4. Go to https://goldenfrijoles.com/app/setup/connect/miyagisanchez.
   → Connector URL with a **Copy** button, a status pill, and three numbered steps ending in
   **Add to Claude**.
5. (Owed to Daniel by name — money/credential path) Click **Add to Claude**, paste the URL into
   Claude's connector settings, then ask Claude for this project's funnel.
   → Claude returns **miyagisanchez** data, not the demo project's.
6. Go to https://goldenfrijoles.com/app/setup/keys/miyagisanchez.
   → The page lists what has access **now** and names what it deliberately does not list —
   connector URLs, share links, and flag admin keys. ⚠️ The "flag admin keys" line must **no longer
   claim there are no live rows**: production has one unrevoked `flag_admin` key on the `miyagi`
   project (D11-3). Then click **+ New key**.
   → You can mint each of the four kinds **here**. The value appears **once**, on its own screen,
   with a copy button. Revoke the one you just made.
7. Go to https://goldenfrijoles.com/app/keys/miyagisanchez.
   → It is gone (404 or a redirect to Setup › Keys). Same for `/app/flag-credentials` and
   `/app/agent-keys`. If any still mints, the replacement and the retirement did not ship together.

If any step fails, note the step number + what you saw — that's the bug report.
