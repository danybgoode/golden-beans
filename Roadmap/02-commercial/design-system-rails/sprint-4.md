# One design system, every surface — Sprint 4: Ship and Setup, finished

**Status:** ⬜ not started

> **Ship and Setup are the two sections that already have approved states**, so this sprint is
> execution against pixels rather than design. Six of the ten approved renders are here, and
> **three of Daniel's five named complaints** are closed by Stories 4.4 and 4.5.
>
> **The flag is ON from Sprint 3.** Every story here lands the replacement and retires the original
> **in the same commit** (`console-ia-overhaul` A3) — never as a cleanup story, because with the
> shell live there is no dark period in which a missing control goes unnoticed.

## Stories

### Story 4.1 — Ship › Features
**As a** person operating a project, **I want** the features list to read as the approved design,
**so that** what Production is serving is legible on one screen.
**Acceptance:** matches reference state **01** and **02** — the answer line with its gold left
border, four stat tiles, the search/filter/group row, the header row at 11/600 uppercase Archivo
(**never mono**), feature rows, and the dormant group as **one summary line replacing forty**.
- At 1440×960 with the dormant group collapsed: **no vertical page scroll, 2 rows plus one summary
  line, and no horizontal scroll.** Those three numbers are the assertion that would have caught the
  whole failure on day one; the shipped page was ~2400px tall with 25 rows and clipped tables.
- **Wide content scrolls inside its own `overflow-x: auto` container** (Do-not #6).
- The **compare-environments** view (reference state **10**) ships with the list, since the button is
  already in state 01 and a control that goes nowhere is worse than no control.
**Risk:** high

### Story 4.2 — The feature destination and its tabs
**As a** person, **I want** one page that answers the whole loop for one feature, **so that** value,
environments, funnel and impact are tabs rather than routes I type a key into.
**Acceptance:** matches reference states **03**, **04** and **05** — Value, Environments, Funnel.
- The three-state switch renders **38 × 21** with its **dashed empty "never"** state.
- ⚠️ **A tab must never call `notFound()`.** `funnel/[projectSlug]/[featureKey]/page.tsx:26` does
  exactly that on `feature_not_found`, and the two registries have **zero overlap** — 42 of 42
  registry features have no TARS row. The empty state **names which absence it is** and is the
  deliverable, not a fallback.
- The funnel-renders-numbers spec belongs on a feature that **has** a funnel (`setup_guide`);
  asserting numbers on a flag's tab is a test that cannot pass.
**Risk:** high

### Story 4.3 — Ship › Activity and Scheduled changes
**As a** person, **I want** to see who changed what, where and why, **so that** the section's other
two surfaces are on the system too.
**Acceptance:** Activity matches reference state **09**. Scheduled changes renders the same row
language with its honest empty state (the rail shows `0` today).
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
**Risk:** high

### Story 4.6 — Destinations and Share links
**As a** person, **I want** Setup's remaining two surfaces on the system, **so that** the section is
finished rather than mostly finished.
**Acceptance:** both render from `design-system/` with the shared data table, its row menu and its
empty state; both have reference states in the manifest. Coverage reaches **13/29**.
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
   → The page **fits without scrolling**. You see 2 feature rows and one line reading *"40 features
   have never been turned on in Production"*. No sideways scrollbar.
2. Click **Show them**.
   → The 40 expand in place. Row height and chrome are unchanged.
3. Click `checkout.stripe_enabled`, then the **Funnel** tab.
   → You get a sentence naming *why* there is no funnel — not a zero, and **not a 404 on the whole
   feature page**.
4. Go to https://goldenfrijoles.com/app/setup/connect/miyagisanchez.
   → Connector URL with a **Copy** button, a status pill, and three numbered steps ending in
   **Add to Claude**.
5. (Owed to Daniel by name — money/credential path) Click **Add to Claude**, paste the URL into
   Claude's connector settings, then ask Claude for this project's funnel.
   → Claude returns **miyagisanchez** data, not the demo project's.
6. Go to https://goldenfrijoles.com/app/setup/keys/miyagisanchez and click **+ New key**.
   → You can mint each of the four kinds **here**. The value appears **once**, on its own screen,
   with a copy button. Revoke the one you just made.
7. Go to https://goldenfrijoles.com/app/keys/miyagisanchez.
   → It is gone (404 or a redirect to Setup › Keys). Same for `/app/flag-credentials` and
   `/app/agent-keys`. If any still mints, the replacement and the retirement did not ship together.

If any step fails, note the step number + what you saw — that's the bug report.
