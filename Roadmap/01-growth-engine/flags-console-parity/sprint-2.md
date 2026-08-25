# The flag console a human can operate — Flagsmith-grade IA, terminology and list ergonomics — Sprint 2: One feature, in Flagsmith's shape

**Status:** ✅ built — all three stories committed on `feat/flags-console-parity-s2` (stacked on
Sprint 1, which is **merged** as `2bdb6f7` and live in production dark).

| Story | Commit | Note |
|---|---|---|
| 2.1 Per-feature destination | `9ea32ba` | `/app/flags/[slug]/[flagKey]`, tabbed Value · History · Settings. |
| 2.2 One enable/disable control | `80067cf` | Money path. Confirm sentence is **gate-tested**, not browser-only. |
| — Rollback + stack retirement | `1655e4e` | Serve-any-version on History; legacy stack retired only once it was a strict subset. |
| 2.3 Three activation states | `9c5b53f` | Un-collapsed the rollout seam; the list/destination already rendered all three. |

**Owed to the product owner:** the signed-in walkthrough below, including the money-path confirm on
preview **and** production (cancel both). Nothing in this repo can reach past the login redirect.

### ⚠️ Logged, not fixed — a repo-wide `useTransition` pattern

React 18.3.1 calls `setPending(false)` **before** invoking the transition callback
(`react-dom.development.js:16512-13`), so for an `async` callback `isPending` is a flicker, not a
duration — everything after the first `await` is outside the transition. Any control relying on
`isPending` to disable itself is therefore **not** protected against a double submit while a server
action is in flight.

There are **27 `startTransition(async` call sites across 14 files** in this repo. Sprint 2 fixed the
two on the money path (`flag-switch.tsx`, `flag-version-serve.tsx`) with their own synchronously-set
in-flight flag, because a double-click there sends a second write with a stale
`expectedSnapshotVersion` and renders a conflict error *after* the kill succeeded — which mid-incident
reads as "the kill didn't work".

**The other 25 are untouched and are a real, pre-existing defect** — not a style preference. They are
out of this epic's scope, and are recorded here rather than left to be rediscovered. Candidate for
its own chore. Found by the fresh HIGH-tier reviewer on PR #120, verified against the installed React
source rather than taken on trust.

> **Build contract — ✅ LOCKED by the architect 2026-08-24.** Cite `D1`, `D5`, `D6` and `D8`
> (+ **Amendment 2**) from the epic README; do not re-derive them. **The prediction was right: `D8`
> was disproved.** "In a catalog but undefined" is not expressible in Golden — it is unreachable by
> construction, not merely absent from the data — and the flag the smoke names as the example is
> live in all three environments. **Story 2.3 and smoke step 7 are rewritten below.**
> Branch: `feat/flags-console-parity-s2`, cut from Sprint 1's branch (WAYS-OF-WORKING §6 — these
> sprints share `flag-manager.tsx` and `page.tsx`; stack or pay the conflict tax).

## Stories

### Story 2.1 — A per-feature destination
**As a** PM, **I want** editing one feature to be its own place, **so that** I'm not scrolling past
41 others to change one thing.
**Acceptance:**
- Clicking a row in the list opens that feature's own surface, carrying **Value · History ·
  Settings** (Flagsmith's tab shape, minus the tabs that have no Golden backend — see the epic's
  no-gos).
- The existing `RuleBuilder`, `FlagInsight` (rollout bars + plain-language diff) and `FlagPreview`
  render there, **moved, not rewritten**, and behave exactly as they do today.
  - `RuleBuilder` gains ONE optional prop, `initialFlagKey`, defaulting to `''` — the existing call
    site's exact behaviour. Only the destination passes a value, because there the flag is already
    chosen and retyping its key invites typing a NEW flag into existence instead of versioning this
    one. The field stays editable and the write path is unchanged: one action, one validator, one
    RPC (A1).
  - ⚠️ **`FlagInsight` lands on History, bars included.** It is one cross-review-hardened component
    carrying both the rollout bars and the plain-language diff. The bars arguably belong under
    *Value*; splitting them out would be a rewrite of a component this story is explicitly told to
    move. History is also where the sprint smoke looks for the diff. Noted here rather than resolved
    by quietly forking the component.
- The raw JSON stays reachable one click deeper — it stops being the primary "what changed"
  affordance, and does not disappear.
- **The legacy per-flag stack is retired in THIS SPRINT — but after Story 2.2, not in this story.**
  ⚠️ Refined while building 2.1. The stack holds every activate/deactivate control, and this story
  builds a *read* destination; 2.2 is what puts an enable/disable control on it. Retiring the stack
  at the end of 2.1 would repeat Sprint 1's defect exactly one story later. **Order: 2.1 destination
  → 2.2 control on it → then the stack goes.** Never before.
- ⚠️ **Decision recorded, 2026-08-24 — the JSON textarea's CSS swap does NOT happen in this story.**
  The rule in `flag-manager.tsx` is *"whoever replaces this control owns the swap"*, and this story
  does not replace it. The builder now reachable on the destination authors a new VERSION of an
  existing flag (its key is prefilled); the textarea is still the only way to create a flag that has
  no definition yet. Swapping `.code-input` onto a control that is still load-bearing would buy a CSS
  tidy-up at the price of `white-space: pre` breaking long-JSON wrapping — which is exactly what
  cross-review rejected the first time. It stays until something actually replaces it.
- **This story owns the JSON textarea's CSS swap** *(see the decision above — exercised as "record
  why it stays")*. `flag-manager.tsx` carries an inline
  `style={{...}}` with a comment recording that Sprint 2 of `flags-visual-rule-builder` swapped it for
  `.code-input`, cross-review rejected it (`.code-input` also sets `white-space: pre`, which would
  stop long JSON wrapping), and *"whoever replaces this control owns the swap"*. Do the swap
  deliberately, or record why it stays.
**Risk:** low

### Story 2.2 — One clear enable/disable control
**As a** PM, **I want** one control that says what it will do, **so that** I never turn something off
without knowing what stops.
**Acceptance:**
- Enabling or disabling a feature in an environment is **one** clearly-labelled control, not a button
  per version row.
- Disabling asks first, via the existing `ConfirmDialog`, and the confirmation **names the specific
  feature, the environment, and what stops** — the audit's §1 standard: *"buttons say Activate, not
  what activation changes"*.
- Enabling does not ask. Only the destructive direction confirms.
- With `FLAG_SERVING_ENABLED` off, the existing banner and disabled-control behaviour are preserved
  unchanged — this story must not become a second serving gate.
- The write path is untouched: it posts through the same server action as today (D1).
**Risk:** **high** — this control turns off `checkout.stripe_enabled` on a live marketplace. Money
path. **The product owner merges** (WAYS-OF-WORKING → Review & merge), and a fresh reviewer subagent
is mandatory on top of the routed cross-family passes.

> **Built 2026-08-25.** One control per environment on the destination's Value tab, labelled
> *"Turn off in production"* — it names the environment, not just the act. Only the destructive
> direction confirms; enabling does not, because confirming both trains the reader to click through.
>
> **The confirmation sentence is gate-tested, which is the part worth defending.** The acceptance
> criterion is about WORDS on the most dangerous control in the product, and words rendered inside a
> client island are reachable only through a signed-in browser — outside the merge gate. So the
> sentence is built by a pure function in `lib/flag-console-copy.ts` and pinned by
> `flag-console-copy.test.ts`: it must name the feature, name the environment (and not a hardcoded
> one), say what STOPS rather than restate the verb, warn that clients keep the old value until
> their next poll, and refuse to end on reassurance. Mutation-checked — degrading it to
> *"This feature will be deactivated"* fails 7 specs.
>
> ⚠️ **The legacy stack is still NOT retired, and this is the third time that ordering has bitten.**
> The per-version buttons in `flag-manager.tsx` are the only way to serve a version OTHER than the
> newest — i.e. **rollback**. This control deliberately turns on the *latest* version, which is the
> "one clear control" the story asks for, but that is not a superset of what the stack does.
> Retiring it now would remove rollback with nothing replacing it — the same class of defect Sprint 1
> hit and Story 2.1 avoided. **Rollback needs a home on the destination first** (a "serve this
> version here" action on History is the obvious one). Recorded rather than quietly dropped.

### Story 2.3 — "Never turned on here" is not "turned off"  *(re-scoped 2026-08-24 — see Amendment 2)*
**As a** PM, **I want** an environment that was never switched on to say so, **so that** I can tell a
deliberate "off" from a flag nobody has ever set up here.

> **Why this is not the story that was groomed.** The original asked for "not created" vs "off". The
> lock pass proved Golden cannot express that: `create_flag_definition_version` writes the registry
> row and its first version in **one transaction**, so a defined-but-unversioned flag is unreachable,
> and **no such row exists in production**. Worse, the story's named example is backwards —
> `partners.recruiting_v3_enabled` has 2 versions and is **active in all three environments**, one of
> only two flags in the project that are on anywhere. The doc said to re-scope rather than drop, so
> this is the re-scope: the distinction Golden CAN make, on the same data, with no new query.

**Acceptance:**
- Each `(feature, environment)` renders as exactly one of **three** states, never two collapsed into
  one: **on (serving v*N*)** · **turned off** (deliberately deactivated, and in the audit) ·
  **never turned on here** (no activation row has ever existed).
- The distinction is read from data that is already loaded: an activation row holding
  `version_id = NULL` is a deactivation; **no row at all** is "never turned on here". D1 holds —
  **no query is added**.
- `summariseFlagEnvironments()` currently collapses the last two — `activations.find(…)?.versionId ?? null`
  maps both to `null` and both render *"Nothing is activated here."* **Un-collapsing it is the story**,
  and it happens in that already-unit-tested pure seam, not in the component.
- Covered by `npm run test:unit`, with **each spec observed failing at least once**. The three states
  are directly constructible as fixtures — no browser, no database.
- This matters at the scale the live data actually has: **40 of 42 flags have never been turned on in
  any environment.** A console that renders all forty identically to a deliberate kill has not
  answered the epic's outcome test.
**Risk:** low

## Sprint QA
- **api spec(s):** extend `e2e/flag-rule-builder.authed.spec.ts` for the per-feature destination;
  new authed spec asserting the confirm dialog's text names the feature + environment + consequence
  (2.2). `npm run test:unit` for any pure state-derivation added by 2.3.
- **browser smoke owed:** **yes, to the product owner, by name** — Story 2.2's disable path on a real
  flag. An automated smoke must not toggle a production kill-switch on a live marketplace, so this
  step is exercised on **preview only** by the agent, and the production confirmation is the product
  owner's.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: **preview first** · then production · https://goldenfrijoles.com

1. Go to https://goldenfrijoles.com/app/flags/miyagisanchez and click `domain.paywall_enabled`.
   → You land on that feature's own page. The list is not underneath it.
2. On that page, look at History.
   → You can read what changed between the last two versions **as sentences**. The raw JSON is still
   available one click deeper.
3. Change a targeting rule in the builder and save, then look at History again.
   → Your change is the newest entry, described in plain language — not a JSON dump.
4. Use the preview tool with a sample user.
   → It tells you what that user would see, and **why** — which rule matched, or that the rollout
   excluded them. Those are two different answers and must not both read as "false".
5. **(money path — owed to Daniel by name, and do this on PREVIEW first.)** Find
   `checkout.stripe_enabled` and click disable.
   → A confirmation appears **before** anything changes, and it names the flag, the environment, and
   that the Stripe card rail disappears from checkout. **Cancel it.**
6. Repeat step 5 on production, read the confirmation, and cancel again.
   → Same sentence, naming production. Nothing changed.
7. *(Rewritten 2026-08-24 — the lock pass disproved D8. The original step told you to expect
   `partners.recruiting_v3_enabled` to read "not created"; it is in fact **on in all three
   environments**, so anyone following the old step would have filed a bug against correct
   behaviour.)*
   Find `partners.recruiting_v3_enabled` and `checkout.stripe_enabled`, and compare them.
   → `partners.recruiting_v3_enabled` reads **on** in development, preview **and** production, at a
   named version. `checkout.stripe_enabled` reads **never turned on here** — *not* "off" — because no
   one has ever activated it in any environment. Those are two different sentences on the screen.
   → If you have just cancelled out of a disable in step 5, nothing changed, so nothing reads
   "turned off" yet. To see the third state, look at any flag you have actually deactivated — the
   lifecycle audit is what tells them apart, and that is the point of the distinction.

If any step fails, note the step number + what you saw — that's the bug report.
