# Flags — a visual rule builder — Sprint 2: Rollout visualization and the version diff

**Status:** 🟡 built, in review — branch `feat/flags-visual-rule-builder-s2`.

> **What was built, and the two decisions the build forced.**
>
> - **Seams:** `lib/flag-definition-diff.ts` (D8, pure, 24 unit tests), `lib/flag-environment-view.ts`
>   (the per-environment derivation, 23 unit tests, **added to the epic's seam table** — see A8 for
>   why it is a seam and not component-internal), `components/ui/RolloutBar.tsx`, and a new client
>   component `flag-insight.tsx` mounted from `flag-manager.tsx` in six lines (D7 holds).
> - **A8 — the bar shows the ROLLOUT, not user coverage.** Story 2.1's "proportion of users" is not
>   computable from a definition; the caption says what the bar actually means. No rollout → a full
>   bar labelled "everyone"; rules that disagree → "up to 50% · 3 rules, not all reaching the same share";
>   nothing activated → no bar and a row that says so.
> - **A9 — Sprint 1's authed spec pointed at the wrong button.** A positional `.first()` over two
>   identically-worded submit buttons resolved to the builder's *disabled* one. Fixed here, with the
>   stored-definition locator that Sprint 2's second `<pre>` would also have re-pointed.
> - **Gated with the builder.** Everything in this sprint renders only under
>   `FLAG_RULE_BUILDER_ENABLED`, so D6's "with it off the page is byte-for-byte pre-epic" still holds
>   for the whole epic, not just Sprint 1.
> - **A4 held:** no query was added. Every number comes from props `getFlagRegistryView()` already
>   returned.

> **Build contract (locked by the architect before the builder started).**
> Cite D3, D5, D8. **D8 is the appetite guard**: the diff is bounded to six parts and falls back to
> "definition changed — show JSON" for anything else. A general JSON-to-prose differ is the named
> rabbit hole; if this story starts growing one, stop and cut the diff to a follow-up (the seed's
> stated circuit breaker).
> **No charting dependency.** `RolloutBar` is token-system CSS, following `FunnelBars`' precedent.
> **A4 — add no query.** `getFlagRegistryView()` already returns every version's full `definition`
> plus per-environment activations and snapshot versions. All three stories are pure derivations
> over props the page already passes. A Supabase call in this sprint is a wrong turn.
> Branch `feat/flags-visual-rule-builder-s2`, cut from `-s1`.

## Stories

### Story 2.1 — `RolloutBar`
**As a** PM, **I want** to see what proportion of users a flag is reaching in each environment,
**so that** "active (snapshot 7)" stops being the only thing the page tells me.

**Acceptance:**
- `RolloutBar` renders one bar per environment, from `FLAG_ENVIRONMENTS` (three: development,
  preview, production) — read from the constant, not listed (D5).
- Each bar shows the live proportion as a **percent label**, converted from basis points through the
  Sprint 1 seam (D3).
- Built from the token system with **no new runtime dependency** — same approach as
  `components/ui/FunnelBars.tsx`. `check:design-drift` passes (no raw hex).
- A flag with no rollout set renders a full bar and says so; it does not render an empty bar that
  reads as 0%.
**Risk:** high

### Story 2.2 — Per-environment state at a glance
**As a** PM, **I want** to see where a flag is on and where it isn't, in one row,
**so that** I don't have to open three views to answer "is this live in production."

**Acceptance:**
- The flag list shows per-environment state without opening a detail view.
- Production is visually distinguishable from the other two — a production rollout change is the
  consequential one and should not look identical to a development one.
- The state shown matches what the SDK's evaluator would return for that environment's snapshot; a
  spec asserts the agreement rather than trusting the render.
**Risk:** high

### Story 2.3 — Plain-language version diff (bounded)
**As a** PM, **I want** to read what changed between two flag versions in a sentence,
**so that** the immutable history becomes something I can audit instead of something I can only store.

**Acceptance:**
- Selecting two adjacent versions produces prose describing changes to exactly six parts: rule
  `priority`, `clauses`, `rollout`, `variantKey`, plus `defaultVariantKey` and `variants` (D8).
- Rollout changes are described in **percent**, both sides — "100% → 10%", never basis points.
- A change outside those six parts renders **"definition changed — show JSON"** with the JSON one
  click away. The diff never guesses, and never silently omits.
- A unit test on the diff seam covers: a narrowed clause, a rollout change, a variant added, and an
  out-of-scope change hitting the fallback. Each observed failing once.
- **The immutable-version model is untouched** — this story reads snapshots, it does not write,
  merge, squash or reinterpret them.
**Risk:** high

## Sprint QA
- **api spec(s):** extend `e2e/flag-rule-builder.spec.ts` — per-environment state agrees with the
  evaluator; diff output for the four covered cases. The diff and the rollout formatting are pure
  functions on `lib/` seams: unit-test them there (free coverage), and keep the api spec to the
  integration claim.
- **Existing specs must pass unchanged:** `flag-serving.spec.ts`, `flag-catalog-sync.spec.ts`,
  `flag-evaluation-telemetry-sdk.spec.ts`.
- **browser smoke owed:** yes, to the product owner — **whether the diff sentence is actually
  legible to a PM**. That is a judgement, not an assertion.
- **Mutation check:** make the diff report a rollout change in basis points → the formatting test
  goes red.
- **deterministic gate:** `npm run typecheck` + `npm run build` + Playwright `api` +
  `check:design-drift` green before merge.
- **Review:** HIGH tier, routed, two cross-family passes + fresh reviewer subagent. **Product owner
  merges.**

## Sprint 2 — Smoke walkthrough (do these in order)
Env: preview (pre-merge) · then production · https://golden-beans-gamma.vercel.app

1. Go to https://golden-beans-gamma.vercel.app/app/flags/<testProjectSlug> with the builder gate on.
   → Each flag shows per-environment state in the list, without opening anything.
2. Open the flag you created in Sprint 1 (rollout 10%).
   → Three rollout bars — development, preview, production. The one carrying the 10% reads **10%**,
     not 1000.
3. Edit it: change the rollout to 50% and save.
   → A new immutable version is created. The old one is still there.
4. Select the two most recent versions and view the diff.
   → It reads as a sentence a PM understands — something like *"rollout 10% → 50%"*. **Percent on
     both sides.**
5. Now change something outside the diffed parts — add a metadata entry via the JSON textarea — and
   save, then diff again.
   → It says **"definition changed — show JSON"** and offers the JSON. It does **not** invent a
     description or silently show nothing.
6. Look at a flag that has no rollout configured.
   → Its bar reads as full/always-on with a label saying so — not an empty bar that looks like 0%.
7. Compare the production row to the development row.
   → Production is visually distinguishable. You can tell at a glance which change would matter.

If any step fails, note the step number + what you saw — that's the bug report.
