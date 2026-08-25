# The flag console a human can operate — Flagsmith-grade IA, terminology and list ergonomics — Sprint 1: The list becomes a list

**Status:** ⬜ not started

> **Build contract — ✅ LOCKED by the architect 2026-08-24.** Cite `D1`, `D1a`, `D2`, `D3`, `D4`,
> `D5` and `D6` (+ **Amendment 1**) from the epic README; **do not re-derive them.** The prediction
> held: `D5` was disproved against the live registry and `D6` was found to conflict with Sprint 3.
> Two consequences bind this sprint directly:
> - **`D2`: the list projection is per-environment.** Miyagi Sánchez's upstream has one global
>   `enabled`; Golden's state is per `(flag, environment)`. `lib/flag-list-view.ts` therefore takes
>   `(flags, environment)` and projects rows FIRST; search/filter/sort/paginate run over that
>   projection. This is the single most important porting difference — get it wrong and every sort
>   and count on the page is answering about the wrong environment.
> - **Amendment 1: do not edit `flag-manager.tsx` in this sprint.** The new console is a new
>   component tree. D6 then holds *by construction* and is auditable with `git diff`.

## Stories

### Story 1.1 — `FLAG_CONSOLE_ENABLED`, created disabled in every environment
**As a** product owner, **I want** the new console to merge dark behind its own gate, **so that** a
half-landed redesign can never become the only way to reach the control that kills a live checkout.
**Acceptance:**
- The flag exists in Vercel for **development, preview and production**, all set to `false`, **before
  this sprint's PR merges**. A flag that exists only in code is not created.
- With the gate off, `/app/flags/<slug>` renders exactly as it does today — including the JSON
  textarea's inline style, which is D6-protected and must not be swapped in this story.
- `isFlagConsoleEnabled()` is resolved in `page.tsx` server-side and passed down; no client reads
  `process.env`.
**Risk:** high *(shared seam — `lib/flags.ts`; architect-tier, done first)*

### Story 1.2 — Pure list math in `lib/flag-list-view.ts`
**As a** builder, **I want** search, filter, sort and pagination as pure functions, **so that** the
gate covers them without a browser.
**Acceptance:**
- Search matches a flag's **key or its description**, case-insensitively.
- Filters for state (all / on / off) and type (all / killswitch / enablement). **The stored value is
  `killswitch`, one word** (D5/Amendment 3) — that is what `definition.metadata.polarity` holds live
  and what the URL parameter carries; the rendered label is D7's business.
- **A flag whose `metadata` carries no `polarity` or `criticality` is rendered as *unclassified*, and
  is reachable by a filter** (D1a). The bag is optional in the SDK and unvalidated by the database;
  one live version already lacks two of its four metadata keys.
- Five sorts — key A→Z, key Z→A, state, type, recently changed — and **every** sort tie-breaks
  alphabetically by key, so ordering is never "whatever the array happened to be in".
- `paginate` **clamps** an out-of-range page into range rather than returning an empty page.
- An allow-listed `URLSearchParams` builder; unknown parameters are dropped, not echoed.
- Covered by `npm run test:unit`, and **each spec observed failing at least once** (mutation check).
**Risk:** low

### Story 1.3 — One feature list
**As a** PM, **I want** one scannable list instead of an editor per flag, **so that** I can find a
feature in seconds.
**Acceptance:**
- The `<article>`-per-flag stack is replaced by one list: a row per feature carrying its key,
  description, state in the selected environment, and its type.
- Search, filters, sort and pagination are driven by URL parameters — a filtered view can be
  bookmarked, shared, and survives a refresh.
- Typing `stripe` narrows the list to `checkout.stripe_enabled` without a full page of other flags
  above it.
- **A row whose definition carries a non-empty `rules` array, or which is not a two-variant boolean,
  still renders sanely** — it is not assumed to be a static boolean. ⚠️ **D5's live-data justification
  was disproved:** all 44 live `miyagisanchez` versions are rule-less static booleans of one
  `valueType`, and the `breaker.*` flags are in the **`miyagi`** project, not this one. The
  requirement stands on **forward-looking** grounds instead — the visual rule builder shipped in #15
  can author rules today, and `getFlagRegistryView()` serves both tenants. Build for it; do not claim
  live data demands it.
- No new database query is added (D1).
**Risk:** low

### Story 1.4 — Environment selector
**As a** PM, **I want** to pick an environment once, **so that** the list tells me about the
environment I'm actually asking about.
**Acceptance:**
- A selector sits above the list offering development, preview and production.
- Changing it changes what the list reports, and is reflected in the URL.
- `ProductShell` is **not** touched (D3) — this is flags-scoped, not ambient.

**Risk:** low

## Sprint QA
- **api spec(s):** `e2e/flag-console-dark.spec.ts` (new), `npm run test:unit` covers 1.2. Extend
  `e2e/flag-rule-builder.authed.spec.ts` for the authed list assertions in 1.3/1.4.
  ⚠️ **Corrected at the lock pass (Amendment 1).** This spec was scoped as *"the gate-off
  byte-for-byte guarantee"*. **It cannot be that.** `/app/flags/<slug>` is credential-gated, so the
  Playwright `api` project only ever observes the login redirect — identical with the gate on or off,
  which makes such a spec a guard that cannot fail (the exact class LEARNINGS names). What it asserts
  instead is the part that IS observable without a session: **Sprint 3's two new routes return a flat
  404 while the gate is dark**, per the `if (!gate()) notFound()` pattern. Byte-for-byte on the
  existing page is guaranteed by *construction* — `flag-manager.tsx` is untouched — and audited with
  `git diff`, not asserted by a spec that could not see it break.
- **browser smoke owed:** yes, to the product owner — the authed `/app/flags/miyagisanchez` list
  itself. Not a money path, but it is credential-gated, so the automated rail can only reach the
  login redirect.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com   (or the preview URL while testing pre-merge)

1. **With `FLAG_CONSOLE_ENABLED` still `false`**, go to
   https://goldenfrijoles.com/app/flags/miyagisanchez
   → The page looks exactly as it does today. Nothing new appears.
2. Flip `FLAG_CONSOLE_ENABLED` to `true` in Preview and redeploy by merging to `main`
   (an env edit alone does nothing — Vercel snapshots values at build time).
3. Reload https://goldenfrijoles.com/app/flags/miyagisanchez
   → You see **one list** of features, not a stack of editors. There is a search box above it.
4. Type `stripe` into the search box.
   → The list narrows to `checkout.stripe_enabled`. Nothing else is between you and it.
5. Change the environment selector from **production** to **development**.
   → The list's reported states change, and the URL changes with them.
6. Copy that URL, open it in a private window, sign in.
   → You land on the same filtered view — the environment and the search term survived.
7. Sort by "recently changed", then go to page 2 if there is one.
   → Ordering is stable and the page control never lands you on an empty page.

If any step fails, note the step number + what you saw — that's the bug report.
