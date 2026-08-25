# The flag console a human can operate — Flagsmith-grade IA, terminology and list ergonomics — Sprint 3: The split and the language

**Status:** ✅ built — all four stories on `feat/flags-console-parity-s3` (stacked on Sprint 2, which
is **merged** as `62bf561` and live in production dark).

| Story | Commit | Note |
|---|---|---|
| — Shared surface (gate union + both callers) | `cf633b1` | Architect-tier, done FIRST. The closed union made every caller a compile error, by design. |
| 3.1 Credentials route | `cf633b1` | Owner-only via `requireProjectOwnership` — **tighter** than the flags page. Revoke copy moved verbatim. |
| 3.2 Audit route | `cf633b1` | **Member-readable**, deliberately — the trap next to an owner-only sibling. Now names the flag and version. |
| 3.3 One vocabulary | `8113b52` | The module *and* the sweep spec; caught a real capability bug (below). |
| 3.4 Guards and specs | `8113b52` + this | Mobile rail entries, the dark spec extended, the vocabulary sweep. |

> ### ⚠️ Story 3.3 caught a capability bug — the third of its kind this epic
>
> Gating the credential forms on `showCredentials` also hid the **authoring form**, because it shared
> one `canManage ? (…)` block with the mint forms. With the console ON there would have been **no way
> to create a new flag at all** — the per-feature destination only versions a flag you can already
> click. Sprint 1's stack, Sprint 2's rollback, and now this: three times a control was nearly
> removed before its replacement existed.
>
> It was found by grepping rendered copy for D7's retired vocabulary. **The vocabulary sweep is also
> a capability sweep**, because it reads every surface — which is the argument for running 3.3 before
> a sprint closes rather than as a tidy-up after.

> **Build contract — ✅ LOCKED by the architect 2026-08-24.** Cite `D6` (+ **Amendment 1**) and `D7`
> from the epic README; do not re-derive them. Branch: `feat/flags-console-parity-s3`, cut from
> Sprint 2's branch.
>
> **Amendment 1 binds this sprint hardest: the move is GATE-CONDITIONAL.** D6 promises the flags page
> is byte-for-byte pre-epic while the gate is off; 3.1/3.2 move controls off that page. Both hold
> only if the move is conditional. With `FLAG_CONSOLE_ENABLED` **off**, `flag-manager.tsx` still
> renders the key forms and the audit table exactly as today; with it **on**, they are absent there
> and live on their own routes, which themselves `notFound()` while dark. An unconditional move is a
> D6 violation, and the groom did not catch it.
>
> **Shared-surface warning — bigger than the groom stated.** `lib/project-route-inventory.ts` carries
> a **closed union**, `ProjectSurfaceGate`, and `ProjectSurfaceGates = Record<Exclude<…,'always'>, boolean>`.
> Adding a `'flag-console'` gate widens that union and every caller that builds the record
> (`lib/shell-nav.ts`, `app/app/page.tsx`, `lib/project-route-inventory.test.ts`). That plus the
> `mobile-heuristics` route arrays is architect-tier, done FIRST, before any 3.1/3.2 work opens.

## Stories

### Story 3.1 — Credentials move to their own route
**As a** project owner, **I want** key management to be its own place, **so that** the flag list
starts at the top of the flags page instead of below three forms.
**Acceptance:**
- Snapshot keys and catalog sync keys — both tables and both minting forms — live on one credentials
  route (Flagsmith's "SDK Keys" equivalent), not on the flags page.
- It is **registered in `lib/project-route-inventory.ts` and linked from the shell nav.** That file
  opens with the reason: *"Keep its links and the classification of every top-level project route
  together so a new page cannot become another URL users must know."* An unregistered route is a URL
  only its author knows.
- Owner-only, and **strengthened deliberately rather than transplanted**. Today a member may LOAD
  `/app/flags/<slug>` and simply sees no key tables (`requireProjectMembership` + `canManage`). A
  standalone credentials route uses **`requireProjectOwnership`**, so a member gets a **404** — the
  `/app/keys/[projectSlug]` precedent, itself cross-review-hardened in 2026-07-20 round 2, and what
  the inventory's `audience: 'owner'` already declares. Both satisfy "a member cannot list keys";
  this one also stops a member learning the route exists. **The boundary moves only tighter, never
  looser** — state it in the PR body so review sees it as intended, not accidental.
- Both revoke confirmations keep their current consequence text verbatim — the wording naming 401s on
  the next poll, and catalog publishes failing from a named source, is load-bearing and was
  cross-review-hardened.
**Risk:** **high** — credential surface. The product owner merges; fresh reviewer subagent mandatory.

### Story 3.2 — Lifecycle audit moves to its own route
**As a** PM, **I want** the audit somewhere I go deliberately, **so that** it isn't the last third of
the page I use daily.
**Acceptance:**
- The lifecycle audit table lives on its own route (Flagsmith's "Audit Log" equivalent), registered
  and linked the same way as 3.1.
- It remains **member-readable**, as today — the audit is not owner-gated, and moving it must not
  quietly make it so.
- The actor column keeps showing the external Clerk actor alongside the Golden owner where present;
  that pairing is what makes a Miyagi Sánchez-initiated flip attributable.
**Risk:** low

### Story 3.3 — One module owns every user-facing flag word
**As a** reader, **I want** one vocabulary, **so that** two screens can't call one thing two names.
**Acceptance:**
- Every user-facing flag term is defined once in a single module and imported — the `lib/positioning.ts`
  pattern, which exists precisely so five surfaces cannot drift.
- **Mirror its spec, not just its shape** (D7): `e2e/positioning-surfaces.spec.ts` asserts the string
  renders identically on every surface that claims it, so a sixth surface retyping a term is a
  failing test rather than a slow divergence. A vocabulary module with no such spec is a convention,
  and conventions drift.
- The three activation states from Story 2.3 (**on** · **turned off** · **never turned on here**) are
  Golden concepts with no Flagsmith equivalent, so they get plain-language names of their own and
  borrow no Flagsmith term that already means something else there.
- Flagsmith's words are adopted **where the concept genuinely matches**: Feature, Enabled, Value,
  History, Environment. Golden's genuinely-different concepts get plain-language names of their own
  and **never** borrow a Flagsmith term that already means something else there.
- Grepping rendered copy for *immutable definition version*, *mint*, *snapshot revision* and
  *activation* returns nothing.
- ⚠️ **`flag-preview.tsx` carries two of those, and Sprint 2 MOVED it onto the new destination.**
  `previewFlagEvaluationAction` returns *"Nothing is activated in {env}, so there is nothing to
  preview there yet."* — which uses `activated` (D7's kill-list) **and** repeats the two-state
  collapse Story 2.3 removed everywhere else. It was left alone in Sprint 2 under "move, don't
  rewrite", but the move is exactly what makes it this story's problem: the string now renders on a
  surface this epic built.
- **English only.** The reuse source is es-MX; Golden renders `<html lang="en">` and introducing a
  locale layer needs a deliberate scope decision this epic does not make (WAYS-OF-WORKING →
  Conventions → Language).
**Risk:** low

### Story 3.4 — Guards and specs reach the new surfaces
**As a** builder, **I want** the rails to cover what we just built, **so that** the next epic can't
regress it silently.
**Acceptance:**
- Both new routes are added to the `AUTHED_MOBILE_ROUTES` array in `e2e/mobile-heuristics.authed.spec.ts`.
  Covering a new route is one array entry — that is the point of the rail.
  ⚠️ **"(and the browser variant)" was wrong** and is corrected here: `mobile-heuristics.browser.spec.ts`
  carries `PUBLIC_MOBILE_ROUTES` only — it has no authed array, because it runs without a session.
  Adding a credential-gated route there would have produced a spec that sweeps a login page and
  passes, which is worse than no coverage.
- `node scripts/check-design-drift.mjs` passes against the new surfaces; no raw hex, no bespoke
  `<table>` where `DataTable` fits.
- The authed flags spec covers the list, the per-feature destination, and both new routes.
- ⚠️ **Port the three suites Sprint 2 had to SKIP.** `e2e/flag-rule-builder.authed.spec.ts`'s
  `the visual rule builder`, `rollout bars and the version diff` and `preview as a user` drive the
  LEGACY per-flag stack — `locator('article')`, `Activate v1`, `not active` — all of which
  `showDefinitions={false}` removes once the console is on. Sprint 2 guarded them with
  `legacyStackOnly()` so they skip rather than fail on timeouts, and stated the cost out loud rather
  than letting the suite rot silently outside the merge gate. **This story is where they get ported
  to the destination.** Until then the moved components' "behave exactly as they do today" claim
  (Story 2.1) has no automated cover with the gate ON.
- **Every new spec was observed failing at least once** — mutation check, per the story Definition of
  Done.
**Risk:** low

## Sprint QA
- **api spec(s):** `e2e/mobile-heuristics.authed.spec.ts` + `.browser.spec.ts` (route entries);
  extended `e2e/flag-rule-builder.authed.spec.ts`; a route-inventory unit assertion that both new
  segments are registered (that module is deliberately import-free and directly unit-testable).
- **browser smoke owed:** yes, to the product owner — the credentials route on a real signed-in
  session, since minting is owner-gated and the automated rail reaches only the login redirect.
  **Do not mint a real production key for the smoke**; if one is minted, revoke it after.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com

1. Go to https://goldenfrijoles.com/app/flags/miyagisanchez
   → The **first thing** on the page is the environment selector and the feature list. No key-minting
   forms above it.
2. Open the shell nav.
   → The credentials route and the audit route are both listed. You did not have to know their URLs.
3. Click through to the credentials route.
   → Snapshot keys and catalog sync keys are both here, with their minting forms.
4. Click Revoke on any key — then read the confirmation and **cancel**.
   → It names the key and says exactly what breaks: clients using it start getting 401s on their next
   poll and fall back to their built-in defaults.
5. Sign in as a **member** (not an owner) and open the credentials route.
   → You cannot enumerate keys — same boundary as before this epic.
6. As that same member, open the audit route.
   → You **can** read it. The audit is member-readable and stayed that way.
7. Read any three labels on the flags page out loud.
   → None of them say "immutable definition version", "mint", "snapshot revision" or "activation".
8. **The epic's outcome test.** Open https://goldenfrijoles.com/app/flags/miyagisanchez cold and
   answer, from the screen alone: *which of these are on, in which environment, and which aren't
   created yet?*
   → You can answer all three without asking anyone. **If you cannot, the epic is not done**,
   whatever the checklists say.

If any step fails, note the step number + what you saw — that's the bug report.
