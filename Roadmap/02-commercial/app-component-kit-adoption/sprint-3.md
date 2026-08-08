# Component-kit adoption sweep — Sprint 3: Confirm every destructive action

**Status:** ⬜ not started

> **Build contract (locked by the architect before the builder started).**
> This sprint changes **behaviour** — it is the one place in the epic where Sweeper's "same
> behaviour" is deliberately suspended, and only in the direction of adding a confirmation step.
> Nothing here removes a capability or changes what an action does once confirmed. Cite D5.
> Branch `feat/app-component-kit-adoption-s3`, cut from `-s2`.
>
> **Corrected at kickoff (2026-08-08) — D5 rested on a false premise.** The agent rail has **no**
> confirm affordance to leave alone: `AgentRail.tsx` is a read-only server component with no
> `'use client'`, no `<button>`, no `onClick`. Two consequences for this sprint:
> 1. The rail is out of scope because there is **nothing on it to confirm**, not because it already
>    confirms. A staged `task_write_confirmations` row is a durable authorization the *agent* spends
>    via `consume_write_confirmation`; a `ConfirmDialog` is a question asked of the *human* at click
>    time. Different actors, different questions. Story 3.1 lists it as **out-of-scope (no control)**,
>    not as "already-confirmed-elsewhere".
> 2. The product's one real pre-existing UI confirmation is `destination-manager.tsx`'s two-click
>    *"Click again to confirm"* on Remove. This sprint **converges it onto `ConfirmDialog`** — the
>    original D5's actual goal (one pattern, not two) applied to the file that actually has one.
>    `window.confirm` stays banned: it blocks the page and the automation harness.

## Stories

### Story 3.1 — Inventory every irreversible action
**As a** product owner, **I want** a list of every one-click action in `/app` that cannot be undone,
**so that** the confirmation work is complete rather than approximately complete.

**Acceptance:**
- A list in this sprint doc names every destructive/irreversible control across the converted
  routes: revoke (keys, agent-keys), deactivate/delete (destinations, experiments), and any flag or
  breaker operation reachable today.
- Each is marked **confirmed / unconfirmed / converged / out-of-scope**.
- The agent rail is listed as **out-of-scope — no control exists** (D5, corrected), with the
  actor/lifetime distinction stated in one line so the next reader doesn't re-open it.
- `destinations`' two-click Remove is listed as **converged** (D5, corrected), not as already-done.
**Risk:** low

### Story 3.2 — Wire `ConfirmDialog` to every unconfirmed action
**As a** PM, **I want** every irreversible action to ask first and name what it will do,
**so that** I can operate keys, destinations and experiments without a one-click accident.

**Acceptance:**
- Every control marked *unconfirmed* in 3.1 opens `ConfirmDialog` before acting.
- The dialog names the **specific object** — its key, label or slug — in the confirmation sentence.
- Cancelling performs **no** network call. A spec asserts this by failing when cancel is wired to
  the action.
- Confirming performs exactly the same operation, with the same payload, as before this sprint.
  No operation's semantics change.
**Risk:** low

### Story 3.3 — Say what stops
**As a** PM, **I want** the dialog to tell me the consequence, not just the verb,
**so that** "revoke" means something to me before I click it.

**Acceptance:**
- Each confirmation carries a one-line consequence sentence in plain language — e.g. revoking a
  sync credential says that catalog publishes using it will start failing.
- Copy is English (repo language policy — Golden Beans is a standalone English-language product with
  no bilingual requirement).
- Reviewed against `references/ux-guidelines.md`; no consequence sentence is left as the default verb.
**Risk:** low

## Sprint QA
- **api spec(s):** `e2e/design-system.authed.spec.ts` — cancel-performs-no-mutation, asserted at the
  API level (the operation's endpoint is not called). Each existing route spec
  (`api-keys.spec.ts`, `destinations.spec.ts`, `experiments.spec.ts`) must still pass **unchanged**:
  the confirmed path is the same operation.
- **browser smoke owed:** yes, to the product owner — **the consequence copy**. Whether a sentence
  actually tells a PM what they're about to lose is a judgement no spec makes.
- **Mutation check:** wire one cancel handler to the action, watch the spec go red, revert.
- **deterministic gate:** `npm run typecheck` + `npm run build` + Playwright `api` +
  `check:design-drift` green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: preview (pre-merge) · then production · https://golden-beans-gamma.vercel.app

> Use a **disposable test project and test credentials** for every step below — these actions are
> irreversible by definition. Clean up afterwards (revoke any test tokens created).

1. Go to https://golden-beans-gamma.vercel.app/app/keys/<testProjectSlug> and create a throwaway key.
   → The key appears in the list.
2. Click revoke on it.
   → A dialog opens naming **that key** and saying, in a sentence, what will stop working.
3. Click cancel.
   → The dialog closes and the key is **still listed and still active**.
4. Click revoke again and confirm.
   → The key is revoked, exactly as it was before this sprint.
5. Go to https://golden-beans-gamma.vercel.app/app/destinations/<testProjectSlug> and deactivate a
   test destination.
   → Same shape of dialog, same position, same wording pattern as step 2.
6. Go to https://golden-beans-gamma.vercel.app/app and open the agent rail.
   → It still **reads only** — a list of staged proposals with no buttons, unchanged by this epic.
     Corrected D5: there was never a rail confirmation to preserve. The one pre-existing UI
     confirmation (destinations' two-click Remove) has been converged onto `ConfirmDialog` in step 5,
     so the product now ships **one** confirmation pattern, not two.
7. Read each consequence sentence you saw and ask: would a PM who didn't build this know what they
   were losing?
   → If any answer is no, that's the bug report for this sprint.

If any step fails, note the step number + what you saw — that's the bug report.
