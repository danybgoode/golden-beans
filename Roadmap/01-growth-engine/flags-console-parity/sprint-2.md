# The flag console a human can operate — Flagsmith-grade IA, terminology and list ergonomics — Sprint 2: One feature, in Flagsmith's shape

**Status:** ⬜ not started

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
- The raw JSON stays reachable one click deeper — it stops being the primary "what changed"
  affordance, and does not disappear.
- **This is the story that owns the JSON textarea's CSS swap.** `flag-manager.tsx` carries an inline
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
is mandatory on top of the two routed cross-family passes.

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
