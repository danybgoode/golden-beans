# Golden Frijoles — Sprint 3: Material, motion, and ship

**Status:** 🟦 In review

> **Build contract (locked by the architect before any builder started).**
> No new sections and no new copy in this sprint — it makes what Sprints 1 and 2 shipped *feel*
> right, proves it, and ships it. The one production-config act (flipping `SITE_URL` and the apex
> redirect) is **pre-authorized for env vars only**; the deployment that picks them up is the merge
> itself, and AGENTS.md rule #4 stands — never `vercel deploy`.

## Stories

### Story 3.1 — The page feels smooth, not jumpy
**As a** reader scrolling this page, **I want** it to settle rather than twitch, **so that** the
product reads as considered.

**Acceptance:**
- **Layout shift is measured, not asserted.** CLS is captured at 390px and at desktop before and
  after; the after number is reported in the PR. Anything that shifts is fixed at the cause —
  reserved space for the framed surfaces, explicit dimensions on the mark, no
  content that arrives after first paint without a box already held for it.
- **One motion vocabulary.** Interactive surfaces share a single easing/duration pair expressed as
  tokens in `globals.css`, rather than the several ad-hoc `.08s`/`.15s`/`.25s` transitions currently
  scattered across the sheet. Hover/press feedback is a state layer over the surface, not a
  geometry change that reflows a neighbour.
- `prefers-reduced-motion: reduce` disables every transition and the blinking cursor, and the
  existing block in `globals.css` is extended rather than duplicated.
- `scroll-behavior: smooth` is scoped so it does not fight a reduced-motion preference.
**Risk:** low

### Story 3.2 — The materials are one system
**As** the product owner, **I want** the three material families used deliberately, **so that** the
page reads as one object rather than as a stack of panels.

**Acceptance:**
- **One elevation ladder.** The shadows currently written ad hoc (`0 24px 60px`, `0 20px 48px`,
  `0 18px 44px`, `0 20px 50px`, `0 6px 18px`…) are expressed as a small set of tokens and applied by
  role — page-ground panel, raised frame, lifted packaging — so two surfaces at the same conceptual
  height cannot drift to different shadows.
- The kraft/foil family stays packaging (dividers, bag label, infomercial), dark-roast stays product
  UI, brass stays instruments — no family leaks into another's role, and the new Sprint 2 sections
  are placed in exactly one family each.
- Contrast is checked on the surfaces this epic changed: gold ink on kraft, `--stamp` on
  `--kraft`, the translucent selection wash on both grounds, and the new badge on the drill cards.
- No raw hex anywhere the guard sweeps; `npm run check:design-drift` passes.
**Risk:** low

### Story 3.3 — The page proves what it claims
**As a** future contributor, **I want** the epic's claims pinned by specs, **so that** the next
change to this page fails loudly instead of quietly.

**Acceptance:**
- `e2e/landing.browser.spec.ts` extended: the brand name appears and "Golden Beans" does not (with
  the D1 exception named in the spec itself, not silently allowed by a loose matcher); every
  `.agent-win` still has a `SurfaceNote`; the gold CTA's hover contrast holds.
- `e2e/landing-prompts.spec.ts` unchanged in shape — it already fetches every URL a prompt names
  against the run's own base URL, which is exactly what makes the domain move testable.
- `e2e/mobile-heuristics.browser.spec.ts` unchanged in shape; the two new sections are covered by the
  existing route sweep.
- `lib/landing-sections.ts` describes the section map this epic ships, including §Infomercial and
  §Resilience, with the epic that lights each.
- `references/landing-end-state.md` reconciled with the shipped page.
- Every new spec observed **failing red** at least once (story DoD).
**Risk:** low

### Story 3.4 — Ship it
**As** the product owner, **I want** this live on goldenfrijoles.com, **so that** the domain I bought
serves the product it names.

**Acceptance:**
- The full local gate is green and its **actual output** is reported, in CI's order:
  `format:changed` → `lint` → `typecheck` → `test:unit` → `build` → the Playwright `api` project.
  "Should pass" is not a result (`CODE-QUALITY.md`).
- **Two cross-family review passes**, routed by `scripts/review-route.mjs --builder claude --tier low`
  — never hand-picked. Blocking findings resolved or explicitly triaged before merge. Rounds
  continue until one comes back **clean**, not until a count is reached, and a clean round from one
  family alone is not a stopping condition.
- The apex redirect is flipped and `SITE_URL` set **before** the merge, so the deploy that ships the
  code is the deploy that snapshots the value (`CODE-QUALITY.md` #11: rollout order is part of the
  design).
- Post-merge production verification, by exercising behaviour: the page loads on
  `https://goldenfrijoles.com`, the tab title reads Golden Frijoles, both copy-prompt blocks name the
  apex domain, every URL they name returns 200, the hero CTA survives hover, and a 390px triple-click
  produces a wash rather than a slab.
- Branch deleted; epic README marked ✅; `RETROSPECTIVE.md` written; poster and `LEARNINGS.md`
  updated.
**Risk:** low — *no money, auth, migration or tenancy path is touched. Merge is pre-authorized at
this tier (WAYS-OF-WORKING, "Review & merge").*

## Smoke walkthrough

1. `curl -sI https://www.goldenfrijoles.com/` *(Expected: a 30x to `https://goldenfrijoles.com/`.)*
2. Open `https://goldenfrijoles.com`. *(Expected: tab title reads **Golden Frijoles**.)*
3. Read the URL inside the "Handoff prompt" block. *(Expected: `https://goldenfrijoles.com/llms.txt`
   — not the `golden-beans-gamma` host, and not `www`.)*
4. `curl -s -o /dev/null -w '%{http_code}' https://goldenfrijoles.com/llms.txt` and the same for
   `/northstar-self-serve.md`. *(Expected: `200` twice.)*
5. Hover the hero CTA. *(Expected: label and arrow stay readable.)*
6. At 390px, triple-click a body paragraph. *(Expected: a translucent wash, text still legible.)*
7. Scroll the whole page once at 390px. *(Expected: nothing jumps as images and fonts settle; no
   sideways page scroll.)*
