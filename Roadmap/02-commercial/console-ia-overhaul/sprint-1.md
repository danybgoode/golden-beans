# Four destinations — an information architecture for the signed-in console — Sprint 1: The shell

**Status:** ⬜ not started

> ## Build contract (locked by the architect before the builder started — 2026-08-27)
>
> **Cite `D1`, `D2`, `D3`, `D4`, `A1`, `A2`, `A7`, `A8`, `A9` from the epic README. Do not re-derive
> them.** A paraphrased contract drifts permissive; if something here looks wrong, escalate — do not
> reinterpret.
>
> **Where the rules live (imported, never restated):** gate polarity and `=== 'true'` →
> `apps/web/lib/flags.ts`'s own comments · what a surface is → `lib/project-route-inventory.ts` ·
> auth → `lib/dashboard-auth.ts` · house style → `CODE-QUALITY.md` · tenancy → `AGENTS.md` rules #1–#5.
>
> ### The five things this sprint may not get wrong
>
> 1. **The gate stays OFF for the whole epic (D4).** This sprint merges dark by construction, and that
>    is what makes Sprints 2 and 3 safe to build. `CONSOLE_SHELL_ENABLED` is created **DISABLED in all
>    three Vercel scopes** before the PR merges — a flag that exists only in code is not created.
> 2. **The nav is generated from the inventory (D2).** A hardcoded list in `ProductShell` is forbidden
>    by `lib/shell-nav.ts`'s own D1 comment. `section` is a **closed union**, so a new surface without
>    a section is a compile error at every caller — the same technique and the same reason as
>    `ProjectSurfaceGate`.
> 3. **`DEFAULT_FEATURE_HINT` has FOUR references and all four die together (D3):**
>    `lib/shell-nav.ts:44` (declares) · `lib/shell-nav.ts:96` (uses) · `app/app/page.tsx:13` (imports) ·
>    `app/app/page.tsx:90` (uses), plus the two literal `'your-feature-key'` strings in
>    `lib/project-route-inventory.test.ts:38,66`. Leaving any one of them is leaving the constant alive
>    with one user. `grep -rn "your-feature-key" apps/web` must return nothing outside this epic's docs.
> 4. **`ProductShell` gains a REQUIRED `section` prop (A8), and there are 18 call sites.** Required, not
>    optional: the compiler is what makes "every page declares where it lives" true. No client island
>    reading `usePathname()` — the file's own comments forbid it twice, and for a reason.
> 5. **The palette fails to nothing (A9).** There is no `ErrorBoundary` anywhere in `apps/web` today, so
>    Story 1.5 writes one. The pure filter lives in `lib/` with zero DOM imports and unit tests; the
>    client component is wrapped so a throw renders `null` rather than taking down every signed-in
>    route. **Mutation-check it by throwing on purpose** — an unobserved guard is not a guard.
>
> ### Shared surface — architect-built, first
>
> Stories **1.1, 1.2 and 1.3** are built by the architect and are **not fanned out**: `flags.ts`,
> `project-route-inventory.ts` and `ProductShell` are imported by every signed-in route, so every
> branch opened after them inherits them and every branch opened before them conflicts.
> Stories **1.4 and 1.5** route to **Codex** (`--tier build`) over this locked contract.
>
> ### What Sprint 1 does NOT do
>
> - It does **not** index features in `⌘K` (that is Story 3.4, over A6's resolution).
> - It does **not** delete `Home` / `Sections` / `Connect` / `Agent notes` from the file — only hides
>   them with the gate on. Deletion is Story 3.5, **after** the production flip is verified.
> - It does **not** add the `'console-shell'` or `'legacy-keys'` gate values (A7) — those arrive in
>   Sprint 2 with the routes that need them, in one commit with all three `ProjectSurfaceGates` callers.

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

⚠️ **Each step names its own environment, and that is A2, not fussiness.**
`FLAG_SERVING_ENABLED`, `EXPERIMENT_GOVERNANCE_ENABLED`, `SIGNALS_ENABLED` and
`JOURNEY_PROJECTIONS_ENABLED` are **Production-only** — a branch preview shows **9** surfaces where
production shows **13**, so Flags, Experiments, Journeys and Tasks are all legitimately missing from a
preview's rail. Steps 1–3 (the dark state) run on **preview**, because they depend on no other epic's
gate. Steps 4–7 (the lit state) run on **production, after Story 3.5's flip**, where the sentence
"Features, Experiments and Activity" is actually true.

### On preview — `https://<branch-preview>.vercel.app`, gate unset

1. Open `https://<preview>/app`.
   → The header looks exactly as it does today: logo, Home, Sections, Connect, Agent notes.
2. Open `https://<preview>/app/setup/connect/miyagisanchez` in a private window.
   → A plain **404** page. Not a login redirect — dark means the route does not exist.
3. Open `https://<preview>/app/setup/keys/miyagisanchez` in a private window.
   → A plain **404**, same reason.

### On production — `https://goldenfrijoles.com`, after Story 3.5 flips the gate

4. Open `https://goldenfrijoles.com/app`.
   → The header shows: the logo, `miyagisanchez ▾`, and four sections — Today · Measure · Ship ·
   Setup. Home, Sections, Connect and Agent notes are gone.
5. Click **Ship**.
   → The left rail shows an Environment picker set to Production, then Features, Experiments and
   Activity.
6. Press `⌘K` and type `dest`.
   → "Destinations" appears, labelled Setup. Press `↵`.
   → You land on the Destinations page.
7. Press `⌘K` and type `stripe`.
   → **Nothing matches.** Feature keys are deliberately *not* indexed until Story 3.4 — an empty
   result here is the correct answer for this sprint, not a bug.

If any step fails, note the step number + what you saw — that's the bug report.
