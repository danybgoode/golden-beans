# Implementation brief — design system + UX guardrails + polish pass

> Hand this to Claude Code, running in your actual clone of `golden-beans`. Two companion files
> are referenced throughout and should sit in the repo before you start:
> - `references/ux-guidelines.md` — the behavioral spec (drop it in at that path)
> - `references/design/polish-pass-proposal.html` — the approved visual spec for the hero,
>   buttons, and icon treatment (drop the downloaded prototype in at that path)
>
> Source of truth for the skin: `references/design/brand-system.html` +
> `references/design/assets/tokens.css`. `references/landing-end-state-mock.html` is layout
> reference only — different, unused class vocabulary, not a second system.

## Context (why this exists)

`apps/web/app/globals.css` is a hand-ported copy of `references/design/assets/tokens.css` and is
solid. But `apps/web/components/landing/*.tsx` mostly bypasses it with inline `style={{}}` —
colors, spacing, grid templates all reinvented per component instead of composed from shared
primitives. That's why the foil gradient never reached the hero, why emoji stand in for icons,
and why the CSS is desktop-first (one `@media max-width:720px` patch with `!important`) instead
of mobile-first. The fix is a primitives layer between tokens and pages, not a one-off visual
pass.

## Phase 0 — Baseline

- `pnpm install` (or the repo's package manager), confirm `tsc`, the existing build, and the
  Playwright e2e suite all pass clean before touching anything. This is your rollback baseline.

## Phase 1 — Tokens: single-sourced, mobile-first

- Eliminate the manual "port" between `references/design/assets/tokens.css` and
  `apps/web/app/globals.css` — either have the app import the reference file directly (preferred
  if the build allows it) or add a script that diffs the two and fails if they've drifted,
  matching the existing `check-template-drift.mjs` pattern.
- Rewrite the responsive rules mobile-first: base rules become the ≤600px layout (single column,
  full-width CTAs), then two `min-width` breakpoints (~640px, ~900px — match what's in
  `polish-pass-proposal.html`) layer up the two-column grids and wider spacing. Remove the
  `!important` overrides once nothing needs to fight the cascade anymore.

## Phase 2 — Component primitives (`apps/web/components/ui/`)

Typed React wrappers around the existing CSS classes — these replace ad hoc inline styles, they
don't invent new visual language:

- `Button` — variants `gold` / `ghost`, includes the tactile `:active` press state (shadow
  collapses, translateY ~2px, recovers on release; respects `prefers-reduced-motion`).
- `Badge` — `status: 'live' | 'next' | 'blocked'`, renders the icon + label pair, replaces every
  hand-written `<span className="tag tag-live">✅ ...</span>` construction.
- `Panel`, `SectionDivider`, `AgentWindow` — wrap the existing `.panel`, `.divider`, `.agent-win`
  patterns so new sections compose them instead of rebuilding the markup.
- `Icon` — see Phase 3.

## Phase 3 — Icons instead of emoji

- Vendor a small local SVG set (~8 icons: check, clock, gear, warning, copy, arrow-right,
  trending-up/down — shapes as prototyped in `polish-pass-proposal.html`, or swap in real
  `iconoir-react` / `lucide-react` paths if you'd rather depend on the library — either is fine,
  no strong preference) as `components/ui/Icon.tsx`, `name` prop.
- Sweep `apps/web/components/landing/` and `apps/web/app/` for the literal characters
  `✅ 🔜 ⚙ ⚠ ✓ ★ ↗ ↘` used as UI (not in code comments/docs — leave those) and replace with
  `<Icon name="..." />`, routed through the new `Badge` component wherever it's a status
  indicator so the shipped/not-yet-shipped/blocked distinction becomes a prop, not a character
  a future developer has to remember to type correctly.
- Every icon-only control keeps an accessible name (`aria-label` or visually-hidden text) — see
  `ux-guidelines.md`, "Icons carry meaning, not decoration."

## Phase 4 — Hero: foil gradient

- Apply `.foil` to the emphasized phrase only (`your agent`), not the full headline — per the
  legibility/restraint note in the proposal artifact. Reference `Hero.tsx` for the current markup
  to adjust.

## Phase 5 — Tactile pass, everywhere `.btn` is used

- Once `Button` (Phase 2) exists, replace every hand-rolled button across `landing/` with it so
  the press state is universal, not hero-only. Spot-check the brass lever toggle still matches
  (it's already the reference implementation for "tactile" — don't change it, just match its
  restraint level).

## Phase 6 — Guard script

- `scripts/check-design-drift.mjs`, same zero-dependency grep-to-zero pattern as
  `check-template-drift.mjs`. Fails on: emoji/pictograph characters in `landing/`+`app/`
  component files; raw hex colors outside the token files. Wire into `.githooks/pre-commit` for
  matching changed paths, and add `.github/workflows/design-drift-guard.yml` mirroring the
  existing `*-guard.yml` workflows.

## Phase 7 — Sweep for consumption (the actual "stop building twice" fix)

- Go back through every `landing/*.tsx` component and replace inline `style={{}}` blocks with the
  Phase 2 primitives wherever one exists for that purpose. This is the step that actually closes
  the gap — new sections built after this point should have no reason to reach for inline styles
  at all.

## Acceptance criteria before handing back

- `tsc`, build, and the existing Playwright e2e suite still pass.
- New `check-design-drift.mjs` passes with zero findings.
- Resize/viewport check at 360px, 640px, 900px+ — no horizontal scroll, no hover-only affordance,
  tap targets ≥44px.
- `prefers-reduced-motion: reduce` leaves press feedback intact but drops any non-essential
  transition.
- Diff should land as a reviewable branch/PR — split into commits roughly matching the phases
  above rather than one flat commit, so it's reviewable the way the rest of this repo already
  gates changes on itself.
