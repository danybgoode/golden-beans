# One design system, every surface — Sprint 6: The doors, the hub, and deleting the old world

**Status:** ⬜ not started

> **Two jobs.** The nine routes outside `ProductShell` — the first screens a customer ever sees —
> and then **deleting the design this epic replaced.**
>
> **The deletion is not tidying.** Until `globals.css`'s `.product-shell` rules and `console.css`'s
> compensations for them are gone, the redesign is a layer on top of the thing it replaced, and
> landing rules keep reaching the console through shared class names — which they already did, three
> times, in one epic. Sprint 6 is a **Sweeper**: less code, same behaviour, no regressions, and the
> old path proved unreachable.

## Stories

### Story 6.1 — The second seam ✳ *executes D6's open question*
**As a** product owner, **I want** the nine non-`ProductShell` routes behind a switch too,
**so that** the rollback covers the whole product rather than 20 of 29 routes.
**Acceptance:** the seam the architecture lock chose — root `layout.tsx`, a new `PublicShell`, or a
stated carve-out — is implemented as decided, **not re-decided here**. Its gate-off branch is proved
by rendering both off-states and diffing, exactly as Story 3.1 did.
**Risk:** high

### Story 6.2 — The doors
**As a** person arriving at the product, **I want** the first screens to speak the product's
language, **so that** signing in is not a change of visual worlds.
**Acceptance:** `/login`, `/signup`, `/install`, `/s/[token]` and `/talk` render from
`design-system/`, each with an approved reference state.
- **`/install` keeps serving the demo project's token.** It is a public route and that is correct
  (AGENTS rule #2); the defect was ever linking a signed-in user to it, and Story 4.4 fixed that.
- `/s/[token]` is a **share link** — an unauthenticated reader sees it. Its empty and expired states
  are part of the design, not an afterthought.
**Risk:** high

### Story 6.3 — The hub
**As an** internal reader, **I want** the roadmap hub on the system, **so that** the four `/hub`
routes stop being a separate product.
**Acceptance:** `/hub/[project]`, `/hub/[…]/epic/[epicSlug]`, `/hub/[…]/horizon` and
`/hub/[…]/report` render from `design-system/` with reference states. `hub.module.css` is retired
into the system or explicitly kept with a written reason.
**Risk:** high

### Story 6.4 — Delete the old world ✳ *Sweeper*
**As a** builder on the next epic, **I want** exactly one stylesheet to reason about,
**so that** a rule I write cannot be silently overridden by the design this epic replaced.
**Acceptance:**
- `globals.css`'s `.product-shell` rules and `console.css`'s compensations for them are **deleted**,
  including `.product-shell main > h1`'s `clamp(30px, 7vw, 48px)` (contract Do-not #1).
- **`console.design_v2_enabled` is retired** — with the old design gone there is no second branch for
  it to select, and a flag whose off-state no longer exists is a lie in the code. Remove it from
  `DEFAULT_FLAGS` and from every Vercel env, in this story.
- **The old path is proved unreachable**, not merely unused: no route renders it, no selector matches
  it, and a guard fails if it returns.
- Behaviour is unchanged — this story changes no pixel. Prove it with the visual gate, which by now
  covers all 29 routes.
**Risk:** high

### Story 6.5 — 29 of 29, and the ratchet on
**As a** product owner, **I want** coverage to be complete and unable to slip,
**so that** the next epic inherits the rails instead of rebuilding them.
**Acceptance:**
- The manifest reports **29/29** on all three booleans.
- **The visual gate is blocking**, and **no deferred row exists without an owner and a date.** The
  last epic shipped five deferred rows at birth; this one ships with a decay date on each.
- The ratchet is on: a PR that lowers coverage **fails**.
- `references/ux-guidelines.md` and `CONSOLE-CONTRACT.md` point at `apps/web/design-system/` as the
  one home, and `Roadmap/README.md`'s poster records that the design now lives in code.
**Risk:** high

## Sprint QA
- **api spec(s):** manifest-driven visual rows for the final nine routes · `e2e/design-v2-dark.spec.ts`
  **deleted** with the flag in Story 6.4 (a spec for a branch that no longer exists is dead weight) ·
  `e2e/coverage-ratchet.spec.ts` (a PR lowering coverage fails) · a guard spec asserting the old
  `.product-shell` selectors match nothing.
- **browser smoke owed:** yes, to Daniel — **signing up and signing in as a brand-new user in
  Production**, and **opening a real share link while signed out**. Both are auth-path and neither is
  covered by an automated smoke.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 6 — Smoke walkthrough (do these in order)
Env: **production · https://goldenfrijoles.com**.

1. Open https://goldenfrijoles.com/login in a **private window**.
   → It is the same product as the console — same type, same ground, same buttons. Not a different
   visual world.
2. (Owed to Daniel by name — auth path) Sign up a fresh disposable account at
   https://goldenfrijoles.com/signup, then sign in.
   → Every screen on the way in is on the system, including the error state if you mistype the
   password. Delete the account afterwards.
3. Open a real share link `https://goldenfrijoles.com/s/<token>` while signed out.
   → It renders on the system. Try an expired or bad token.
   → The expired state is a designed page, not a stack trace or a bare 404.
4. Go to https://goldenfrijoles.com/hub/miyagisanchez.
   → The hub is the same product as `/app`.
5. Go to https://goldenfrijoles.com/app/flags/miyagisanchez.
   → Unchanged from Sprint 4. Story 6.4 deleted the old stylesheet and must have moved nothing.
6. Open the PR's CI run.
   → Coverage reports **29/29**, the visual gate is blocking, and no deferred row is listed without
   an owner and a date.
7. Confirm `console.design_v2_enabled` no longer appears in `lib/flags.ts` or in any Vercel env.
   → The flag is retired. There is one design now, and one stylesheet.

If any step fails, note the step number + what you saw — that's the bug report.
