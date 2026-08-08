# Component-kit adoption sweep — Sprint 1: The three missing primitives

**Status:** 🟦 In review — `eb266d3` (primitives + proof of use), `46b4b9e` (spec corrections)

> **Build contract (locked by the architect before the builder started).**
> This sprint ships **only** the three components, their styling and their specs. No route
> conversion beyond the single proof-of-use in 1.3. It merges before Sprint 2 opens (D1) because
> `flags-visual-rule-builder` and `scenarios-pm-operable` both consume `ConfirmDialog` and
> `FormSection` from `main`. Cite D1–D3, D7, **D8, D9**; do not re-derive them.
>
> **Corrected at kickoff (2026-08-08):** the original line *"no `globals.css` change"* was written
> against the assumption that the primitives could style themselves from existing rules. They
> cannot — the repo has **no table, form or dialog CSS at all**, and `tokens.css` is a byte-mirrored
> handoff artifact the drift guard forbids editing. So this sprint **does** add classes to
> `globals.css`. That is additive and is *not* the teardown D4 bans: D4 forbids **removing** the
> generic selectors mid-sweep, which this sprint still does not do. See **D8**.

## Stories

### Story 1.1 — `DataTable`
**As a** PM, **I want** every table in the product to sort, filter and explain itself the same way,
**so that** I don't re-learn each screen.

**Acceptance:**
- A `DataTable` exists in `components/ui` and renders columns, rows, a sort control, a text filter
  and an empty state.
- It is a **client island that receives already-fetched rows** — it takes no data-fetching props,
  no Supabase client, no `projectSlug` it would resolve itself (D2).
- The empty state renders a caller-supplied sentence, not a blank `<tbody>`.
- No raw hex; `npm run check:design-drift` passes over `components/ui`.
- Its API is the **thin** one needed by the first two conversions in Sprint 2 — no option added
  speculatively (D3).
**Risk:** low

### Story 1.2 — `ConfirmDialog`
**As a** PM, **I want** anything I can't undo to ask me first, and to name what it's about to do,
**so that** I can operate the product without fear of a one-click mistake.

**Acceptance:**
- A `ConfirmDialog` exists in `components/ui`, satisfying the requirement already written in
  `references/ux-guidelines.md` ("a second, explicit confirmation naming what's about to happen and
  that it can't be undone — never a bare *Are you sure?*"; the guidelines name the behaviour, not a
  component — see the corrected reuse table).
- **Proof of use, same argument as 1.3 (added at kickoff):** `key-manager.tsx`'s Revoke is wired to
  it in this sprint. Two downstream epics consume this API from `main`; validating it with a real
  caller costs one call site now and is unrecoverable later. It is also what the Sprint 1 smoke
  walkthrough (steps 3–5) already assumes. The *remaining* destructive actions, and the consequence
  copy for all of them, stay in Sprint 3.
- It takes the **specific object's key or label** and renders it in the confirmation sentence —
  "Revoke key `flag_sync_prod`?", never "Are you sure?"
- Focus is trapped while open; `Esc` and the cancel control both dismiss without acting; the
  destructive control is not the default-focused one.
- It is **not** wired to the agent rail's pending-proposal list (D5, corrected). The rail has no
  control to wrap — it is a read-only server component — and a staged-write row is a durable
  authorization consumed by the *agent*, not a question asked of the human at click time. A code
  comment on `ConfirmDialog` records that boundary.
**Risk:** low

### Story 1.3 — `FormSection` / `Field`
**As a** PM, **I want** every form in the product to label, group and report errors the same way,
**so that** the next new surface is one I already know how to use.

**Acceptance:**
- `FormSection` (heading + description + grouped children) and `Field` (label + control + hint +
  error) exist in `components/ui`.
- `Field` renders its error in a way a screen reader associates with the control, and reserves the
  error's space so validation doesn't reflow the form.
- One manager component — pick the smallest, `dismiss-key-button.tsx`'s parent or
  `key-manager.tsx` — is converted as the **proof of use**, so the API is validated by a real caller
  before two downstream epics depend on it.
**Risk:** low

## Sprint QA
- **Specs — corrected at kickoff, see D9.** The line below said "api spec(s):
  `design-system.authed.spec.ts`". That file is **not** an api spec: `playwright.config.ts` gives the
  `api` project `testIgnore: /.*\.(browser|authed)\.spec\.ts/`, so nothing in it runs in the merge
  gate. The split that actually holds:
  - **`apps/web/lib/data-table.ts` + `data-table.test.ts`** — sort/filter as pure functions,
    `npm run test:unit`. This IS in the gate. Free coverage, no browser.
  - **`e2e/design-system.authed.spec.ts`** — one assertion per primitive (renders, empty state,
    confirm-cancels-without-acting, focus trap, `Esc`). Opt-in Chromium; run locally against local
    Supabase and **observed failing**. Not the gate — but per WAYS-OF-WORKING a browser spec
    *discharges* a browser smoke otherwise owed to the product owner.
- **browser smoke owed:** ~~yes, one item to the product owner — **keyboard behaviour of
  `ConfirmDialog`** (focus trap, `Esc`, default focus)~~ → **DISCHARGED by automation.**
  `design-system.authed.spec.ts` now asserts all three in a real browser (`:modal`, the full tab
  cycle, `Esc`-does-not-act, Cancel-is-default-focus), which is exactly the case WAYS-OF-WORKING
  describes: a browser spec replaces a browser smoke previously owed. What remains for the product
  owner is judgement, not mechanism — **is the consequence sentence any good** (Sprint 3, Story 3.3)
  and does the dialog *look* right.
- **Two authed specs fail on this branch and on clean `main` alike** — `command-center.authed`
  (needs `SUPABASE_DB_URL`, which the authed rail does not inject, unlike `test:e2e:local`) and
  `project-navigation.authed` (Flags link). Measured on `aead6bf` before claiming green; both are
  pre-existing and neither is in the merge gate. Not this epic's to fix, stated rather than glossed.
- **Every new spec observed failing at least once** — for 1.2, the mutation is making the dialog's
  cancel path call the action; the spec must go red.
- **deterministic gate:** `npm run typecheck` (all four projects — not `tsc -p apps/web`) +
  `npm run lint` + `npm run build` + `npm run test:unit` + Playwright `api` + `check:design-drift`.
  **All green** — Playwright via `npm run test:e2e:local` (439 passed, 0 failed), measured against
  the same command on `aead6bf` (439 passed, 0 failed). Identical.
- **⚠️ Local gate gotcha, cost an hour, worth recording.** `npm run test:e2e:local` **builds into
  `apps/web/.next`**. A `next dev` server left running in the same worktree writes that directory
  concurrently and corrupts the build — every page route then 404s with *"Cannot append headers
  after they are sent to the client"*, which looks exactly like a real regression (12 failures,
  including `/app` → `/login`). Kill the dev server before running the local gate. Promoted to
  `LEARNINGS.md`.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: preview (pre-merge) · then production · https://golden-beans-gamma.vercel.app

1. Sign in and go to https://golden-beans-gamma.vercel.app/app
   → The app shell renders as it does today. **Nothing has visibly changed** — this sprint adds
     components, it does not convert routes.
2. Go to the keys page for your project: https://golden-beans-gamma.vercel.app/app/keys/<projectSlug>
   → The form section that was converted as proof-of-use renders with a heading, labelled fields and
     hint text. The information shown is the same as before.
3. Click the destructive action on that page (revoke / deactivate).
   → A confirmation dialog opens and **names the specific key** in its sentence.
4. Press `Esc`.
   → The dialog closes and **nothing was revoked** — the key is still listed.
5. Re-open the dialog and press `Tab` repeatedly.
   → Focus stays inside the dialog and never lands behind it. The destructive button is not the one
     focused when the dialog opens.
6. Trigger a validation error in the converted form (submit it empty).
   → The error appears against the field, and the form **does not jump or reflow**.

If any step fails, note the step number + what you saw — that's the bug report.
