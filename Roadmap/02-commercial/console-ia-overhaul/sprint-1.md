# Four destinations — an information architecture for the signed-in console — Sprint 1: The shell

**Status:** ⬜ not started

> **Build contract (to be locked by the architect before the builder starts).** Cite `D1`, `D2`,
> `D3` and `D4` from the epic README. Do not re-derive them. In particular: the nav is generated
> from the inventory (D2) and **the gate stays OFF for the whole epic** (D4) — this sprint merges
> dark by construction, and that is what makes the rest of it safe to build.
>
> **This sprint touches the shared surface every other branch inherits** — `ProductShell` wraps every
> signed-in route, and `project-route-inventory.ts` is imported by the shell *and* `/app`. Per
> WAYS-OF-WORKING → *Assembly line, not a relay*, shared-surface work is done **first and by the
> architect**, not fanned out.

## Stories

### Story 1.1 — The gate
**As a** product owner, **I want** the whole new console to sit behind one switch that is off until I
say otherwise, **so that** it can merge in pieces without any of it reaching me half-built.
**Acceptance:**
- `CONSOLE_SHELL_ENABLED` is a new `isConsoleShellEnabled()` in `apps/web/lib/flags.ts`, exactly
  `=== 'true'` like its 20 siblings, with the comment naming its **enablement** polarity.
- The flag is **created DISABLED in every environment** (local, preview, production). A flag that
  exists only in code is not created.
- It is resolved **server-side** and passed down. No client reads `process.env`.
- With it unset, `/app` and `/app/flags/miyagisanchez` are unchanged — provable by `git diff` showing
  the gate-off branch untouched, not by a promise in prose.
**Risk:** high (shared infra + the gate the whole epic depends on)

### Story 1.2 — `section` on the route inventory
**As a** builder, **I want** every surface to declare which of the four sections it belongs to,
**so that** the navigation is generated from one list and a new page cannot become another URL only
its author knows.
**Acceptance:**
- `ProjectSurface` gains `section: 'today' | 'measure' | 'ship' | 'setup'` — a **closed union**, so
  adding a surface without choosing a section is a compile error at every caller (the same technique
  and the same reasoning as `ProjectSurfaceGate`).
- All remaining surfaces are assigned: `journeys`/`scenarios` → measure; `flags`/`experiments`/
  `flag-audit` → ship; `keys`/`flag-credentials`/`agent-keys`/`destinations`/`shares`/`onboarding` →
  setup; `tasks` → today.
- **`funnel` and `impact` are removed from the inventory** (D3). Their routes still work and still
  render; they are simply no longer nav destinations.
- **`DEFAULT_FEATURE_HINT` is deleted, and both its call sites go with it** — `lib/shell-nav.ts`
  (which exports it) and `app/app/page.tsx` (which imports it). A grep for `your-feature-key` returns
  nothing outside this epic's docs.
- `lib/project-route-inventory.test.ts` is extended: every surface has a section, and the union is
  exhaustive.
**Risk:** high (shared surface — every branch opened after this inherits it)

### Story 1.3 — The shell: one project switcher, four sections
**As an** operator, **I want** a header that names the project I am in and four places I can go,
**so that** I am not reading a flat list of every route in the product.
**Acceptance:**
- Gate on: the header renders the logo (linking to Today), **one project switcher** — populated from
  `getShellNav().projects`, no organisation tier (D1) — the four sections, and an account menu.
- `Home`, `Sections`, `Connect` and `Agent notes` are **absent** with the gate on. They are not
  deleted from the file yet (Story 3.5); the gate-off branch still renders them exactly as today.
- The active section is marked with `aria-current`.
- `getShellNav` still never throws — the shell wraps error and gated states, and its own doc comment
  says why. A nav read failure degrades to the logo alone, not to a crash.
**Risk:** high (shared surface)

### Story 1.4 — The per-section rail
**As an** operator, **I want** the section I picked to show what is inside it, **so that** depth costs
one click instead of a menu of everything.
**Acceptance:**
- The rail renders the surfaces whose `section` matches the active one, with their existing
  inventory descriptions.
- **Ship's rail carries the environment picker** — flags-scoped, exactly as `flags-console-parity`
  D3 decided, because it scopes Ship and nothing else. Putting it in the header would imply it
  governs Measure and Setup too.
- Today has no rail and renders full width.
- A section whose surfaces are all gated off renders no empty rail.
**Risk:** low

### Story 1.5 — `⌘K` over surfaces
**As an** operator, **I want** to type where I want to go, **so that** the depth of the rail costs
nothing.
**Acceptance:**
- `⌘K` / `Ctrl-K` opens a palette listing every entitled surface with its section; `↑ ↓` moves,
  `↵` navigates, `Esc` closes.
- It is seeded from the links `getShellNav` already resolved — **no new query, no new route.**
- It cannot break the page it sits on: a palette that throws would take down every signed-in route
  at once, so it renders nothing rather than throwing.
- **Features are NOT indexed in this sprint** (D7 is unresolved and Story 3.4 owns it).
**Risk:** low

## Sprint QA
- **api spec(s):** `e2e/console-shell-dark.spec.ts` — with the gate off, an unauthenticated GET of the
  two Sprint-2 routes returns a flat **404** (dark means nonexistent, before auth). Plus unit specs on
  `project-route-inventory.ts` (every surface sectioned; the union exhaustive) and on the palette's
  pure filter function, extracted to a `lib/` seam so it is testable with zero DOM.
- **Note on what the gate spec can and cannot assert:** it cannot assert "`/app` renders as it does
  today" — that page is credential-gated and the `api` project only ever sees the login redirect,
  identical with the gate on or off. `flags-console-parity` Sprint 1 corrected exactly this mistake.
  It asserts the **route status** instead, and the byte-identical claim is carried by `git diff`.
- **browser smoke owed:** yes, to the product owner — the header render with the gate on is
  credential-gated. One opt-in `browser` spec can cover the anonymous half; the authed chrome is owed.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: preview · `https://<branch-preview>.vercel.app` (production URLs once merged)

1. Open `https://<preview>/app` while `CONSOLE_SHELL_ENABLED` is unset.
   → The header looks exactly as it does today: logo, Home, Sections, Connect, Agent notes.
2. Open `https://<preview>/app/setup/connect/miyagisanchez` in a private window.
   → A plain **404** page. Not a login redirect — dark means the route does not exist.
3. Set `CONSOLE_SHELL_ENABLED=true` in the preview scope and **push a commit** to the branch (per
   AGENTS rule #4 the var only reaches running functions on a new deployment).
4. Reload `https://<preview>/app`.
   → The header now shows: the logo, `miyagisanchez ▾`, and four sections — Today · Measure · Ship ·
   Setup. Home, Sections, Connect and Agent notes are gone.
5. Click **Ship**.
   → The left rail shows an Environment picker set to Production, then Features, Experiments and
   Activity.
6. Press `⌘K` and type `dest`.
   → "Destinations" appears, labelled Setup. Press `↵`.
   → You land on the Destinations page.
7. Set `CONSOLE_SHELL_ENABLED` back to unset and push again.
   → `/app` is back to today's header. **Leave it unset — the flip is Story 3.5.**

If any step fails, note the step number + what you saw — that's the bug report.
