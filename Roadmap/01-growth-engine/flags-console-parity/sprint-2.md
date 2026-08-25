# The flag console a human can operate — Flagsmith-grade IA, terminology and list ergonomics — Sprint 2: One feature, in Flagsmith's shape

**Status:** ⬜ not started

> **Build contract (to be locked by the architect before the builder starts).** Cite `D1`, `D5`, `D6`
> and `D8` from the epic README. **`D8` is the one most likely to be disproved** — whether Golden's
> registry can express "in a catalog but undefined" at all, for any project, is unverified.
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

### Story 2.3 — "Not created" is not "off"
**As a** PM, **I want** a feature that was never defined to say so, **so that** I'm not looking at a
task the UI has hidden from me.
**Acceptance:**
- A catalog key with no definition renders as **not created** — visibly distinct from off — with the
  create action attached to it.
- The distinction is real, not cosmetic: this is the `partners.recruiting_v3_enabled` case, where
  enabling is a *create*, not a flip.
- If the lock pass finds Golden cannot express this state (D8), **the story is re-scoped in the doc
  and the reason written down** — it is not quietly dropped, and it is not faked with a client-side
  guess.
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
7. Find `partners.recruiting_v3_enabled`.
   → It reads **not created**, not "off", and offers to create it. *(If Sprint 2's lock pass
   disproved D8, this step is replaced by whatever the doc was corrected to say — check `sprint-2.md`
   before reporting it as a failure.)*

If any step fails, note the step number + what you saw — that's the bug report.
