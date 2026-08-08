# Component-kit adoption sweep — Sprint 1: The three missing primitives

**Status:** ⬜ not started

> **Build contract (locked by the architect before the builder started).**
> This sprint ships **only** the three components and their specs. No route conversion, no
> `globals.css` change. It merges before Sprint 2 opens (D1) because `flags-visual-rule-builder`
> and `scenarios-pm-operable` both consume `ConfirmDialog` and `FormSection` from `main`.
> Cite D1–D3 and D7; do not re-derive them.

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
  `references/ux-guidelines.md`.
- It takes the **specific object's key or label** and renders it in the confirmation sentence —
  "Revoke key `flag_sync_prod`?", never "Are you sure?"
- Focus is trapped while open; `Esc` and the cancel control both dismiss without acting; the
  destructive control is not the default-focused one.
- It does **not** wrap the agent rail's existing pending-proposal confirmation (D5) — a spec or a
  code comment records that boundary.
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
- **api spec(s):** `e2e/design-system.authed.spec.ts` — one assertion per primitive (renders, empty
  state, confirm-cancels-without-acting). Pure-logic parts of `DataTable`'s sort/filter extracted to
  a `lib/` seam and unit-tested — free coverage, no browser.
- **browser smoke owed:** yes, one item to the product owner — **keyboard behaviour of
  `ConfirmDialog`** (focus trap, `Esc`, default focus). An api spec cannot see it.
- **Every new spec observed failing at least once** — for 1.2, the mutation is making the dialog's
  cancel path call the action; the spec must go red.
- **deterministic gate:** `npm run typecheck` (all four projects — not `tsc -p apps/web`) +
  `npm run build` + Playwright `api` green before merge.

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
