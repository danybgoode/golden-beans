# Four destinations — an information architecture for the signed-in console — Sprint 1: The shell

**Status:** ✅ SHIPPED 2026-08-27 — PR #122, squash-merged to `main` and deployed.

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
> 4. **`ProductShell` gains a REQUIRED `section` prop (A8): 26 render sites across 18 files.**
>    (The first draft of this line said "18 call sites", conflating files with renders — eight of the
>    26 are second renders in error and empty states, which is exactly the set an *optional* prop
>    would have let slip through.) Required, not
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
>   them with the gate on. **Only `Home` and the disclosure are ever deleted** (Story 3.5, after the
>   production flip is verified) — `Connect` and `Agent notes` are permanent public chrome, because
>   the two demo dashboards render this branch anonymously and it is their only route to `/install`
>   and `/llms.txt`. See A16.
> - It does **not** add the `'console-shell'` or `'legacy-keys'` gate values (A7) — those arrive in
>   Sprint 2 with the routes that need them, in one commit with all three `ProjectSurfaceGates` callers.

## Stories

### Story 1.1 — The gate
**As a** product owner, **I want** the whole new console to sit behind one switch that is off until I
say otherwise, **so that** it can merge in pieces without any of it reaching me half-built.
**Acceptance:**
- `CONSOLE_SHELL_ENABLED` is a new `isConsoleShellEnabled()` in `apps/web/lib/flags.ts`, exactly
  `=== 'true'` like its **17** siblings — it is the eighteenth env gate. (`flags.ts` exports **22**
  functions, **four** of which compose other gates rather than reading an env var: 22 − 4 = 18. The
  original "20 siblings" counted composites; my first correction said "21 functions, three
  composites" and was itself off by one in both terms — the right conclusion reached twice with the
  wrong arithmetic, which the reviewer's second pass caught. Counted at HEAD this time, and it agrees
  with `flags.ts`' own "eighteenth", with the 18 unique `process.env` reads, and with the
  exhaustiveness test's floor.) The comment names its **enablement** polarity.
- The flag is **created DISABLED in every environment** (local, preview, production). A flag that
  exists only in code is not created.
- It is resolved **server-side** and passed down. No client reads `process.env`.
- With it unset, `/app` and `/app/flags/miyagisanchez` render the same CHROME — provable by `git diff`
  showing the gate-off branch untouched, not by a promise in prose.
- ⚠️ **One honest qualification (fresh reviewer, PR #122): the chrome is unchanged, the DATA in it is
  not.** Story 1.2 removes `funnel` and `impact` from the inventory unconditionally, so with the gate
  off the Sections disclosure lists eleven surfaces where it listed thirteen. That is D3's intended
  change — both were entries whose own description read "swap the feature key in the URL" — but
  `git diff` on `ProductShell.tsx` cannot see it, and stating the guarantee absolutely would hide it.
  Neither dashboard loses its only entry: `CommandCenter` still links both with a real feature key.
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
- ⚠️ **DISPROVED by A15 — Ship's rail does NOT carry the environment picker; it stays on the flags
  page.** This criterion cited `flags-console-parity` D3, which says the opposite in as many words
  (*"a switcher in the shell would imply it governs pages that do not read it"*). Two facts on `main`
  settle it: the picker's links are built from `buildFlagListQuery(params, …)`, carrying the flags
  list's own search/filter/sort/page — so a rail copy would drop the reader's filters on every switch
  — and `experiments` contains the string `environment` **zero** times, so a Ship-wide picker would
  sit above a page it does not govern. Nothing moves, so nothing is lost.
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

## Sprint QA — what was actually run

- ⚠️ **`e2e/console-shell-dark.spec.ts` was NOT written, and writing it here would have been a
  tautology.** It was specced to assert that the two **Sprint-2** routes 404 while dark — but those
  routes do not exist until Sprint 2, so a 404 from them proves only that Next.js 404s an absent
  path. That is precisely the guard-that-cannot-fail this repo has shipped three times. **The dark
  route spec moves to Sprint 2, with the routes it is about.**
- **Sprint 1 changes NO anonymously-observable response at all.** `/app` redirects to `/login` in
  both gate states, which is what the `api` project sees. So the coverage that means anything is:
  - **Unit (in the blocking gate): 1,359 tests.** `console-shell.test.ts` (19) — tab set, exactly one
    `current` for all five section values, a tab never rendering without a destination, the switcher
    resolving the TARGET project's role, the rail's two no-rail cases.
    `console-palette.test.ts` (13) — matching by label and by section, the honest no-match result, the
    cursor total over an empty list. `project-route-inventory.test.ts` (9) — every surface sectioned,
    no dead section, no placeholder in any href. `flags.test.ts` (205) — including the new
    exhaustiveness guard.
  - **`e2e/console-shell.authed.spec.ts` (NEW): 12 specs, run in BOTH gate states.**
    Full authed suite: **59 passed / 0 failed** gate-off, **64 passed / 0 failed** gate-on.
  - **`api` gate: 482 passed, 1 failed** — `scenario-registry.spec.ts:365`, **pre-existing**,
    reproduced identically on clean `main` (e076b5d) in a throwaway worktree.
- **Mutation checks, all observed red and restored from file copies:** the placeholder-href guard,
  the "swap the key" description guard, an emptied section, Today given a rail, `getSectionEntryHref`
  returning `''` instead of `null`, the flags-registry exhaustiveness guard in both directions, and
  the palette's panel geometry (346px of slack against a 48px bound).
- **A9 verified end to end, twice.** Palette throwing + boundary present → page intact. Palette
  throwing + boundary **removed** → one keystroke unmounted the whole signed-in page. The second run
  is what proves the guard is load-bearing.
- **browser smoke still owed to the product owner:** the authed rail runs against a *disposable*
  tenant with every gate open. It cannot tell you what `miyagisanchez` looks like in **production**,
  where four gates are Production-only (A2) and the slug and data are real. That is the walkthrough
  below, and it runs after Story 3.5's flip.
- **deterministic gate:** lint · typecheck · 1,359 unit tests · build · design-drift ·
  `format:changed` — all green.

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
   → The header shows: the logo; the four sections **Today · Measure · Ship · Setup** with Today
   marked as current; the project name; and an **Account** menu. Home, Sections, Connect and Agent
   notes are gone.
   → ⚠️ The project name is a plain label, **not** a `▾` menu, because you belong to one project.
   The switcher only becomes a disclosure with two or more — the earlier draft of this step promised
   `miyagisanchez ▾` and would have had you file a bug against correct behaviour.
5. Click **Ship**.
   → The left rail shows **Experiment governance · Flags · Flag audit**.
   → ⚠️ **No environment picker, and no entry called "Features".** The earlier draft of this step
   promised both. A15 disproved the picker (it belongs to the flags page, whose search and filters
   its links carry), and there is no surface named `Features` in the inventory — the flags surface
   is labelled **Flags**. Corrected after the fresh reviewer found the two documents disagreeing.
6. Press `⌘K` and type `dest`.
   → "Destinations" appears, labelled Setup. Press `↵`.
   → You land on the Destinations page.
7. Press `⌘K` and type `stripe`.
   → **Nothing matches.** Feature keys are deliberately *not* indexed until Story 3.4 — an empty
   result here is the correct answer for this sprint, not a bug.

If any step fails, note the step number + what you saw — that's the bug report.
