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

## Build contract (locked by the architect before the builder started)

> Sprint 6 is **not delegated** (README → *Routing*): seam B, the flag retirement, and proving an old
> path unreachable. **Cite a decision; never re-derive one.**

**Paths this sprint owns.** `apps/web/design-system/Frame.tsx` (new) · `apps/web/app/{login,signup,install,talk}/**` ·
`apps/web/app/s/[token]/**` · `apps/web/app/hub/**` · `apps/web/app/globals.css` ·
`apps/web/app/console.css` · `apps/web/lib/flags.ts` · `references/ux-guidelines.md` ·
`Roadmap/README.md`.

| # | The contract | Cites |
|---|---|---|
| 1 | **Seam B is `design-system/Frame.tsx`, with DD3's `door` and `public` variants.** Decided at the lock; **this story implements it, it does not re-decide it.** ⚠️ It is shared CHROME, not a gate — there is no flag for it to ask (D6). Root `layout.tsx` is still **rejected**: it also wraps `/` and `/methodology`, which two shipped epics own, and this epic's frame has no business wrapping them. | **D6** |
| 2 | The nine routes share **no** wrapper today — `.auth-shell` (login, signup), the landing `Nav`/`Footer` (install, talk), `hub.module.css` (4 hub routes), and `/s/[token]` reusing `../../hub/report-components`. Frame replaces all four, one route at a time. | verified |
| 3 | ⚠️ **No gate-off branch to prove** (D6) — this row cited a Story 3.1 that no longer exists. What Seam B still owes is that the 9 routes it wraps **render**, asserted by the `authed` suite, not by reading the diff. | **D6** |
| 4 | ⚠️ **There is no flag to retire** (D6, Daniel, 2026-08-31). This row named `DESIGN_V2_ENABLED` / `isDesignV2Enabled()` and Story 6.4's removal of them; neither ever shipped. Story 6.4 verifies the ABSENCE — a grep over the source and the Vercel envs — rather than performing a removal. | **D6** |
| 5 | ⚠️ **`/s/[token]` has no expired state, and that is a security decision.** `app/s/[token]/page.tsx` calls `notFound()` for unknown, malformed, expired **and** revoked alike, so the page cannot tell an attacker which one a token is. All four land on **`public-gone`**, one designed 404 whose copy deliberately does not say which. **Do not add an expired state to satisfy a doc.** | **F2** |
| 6 | **`/install` keeps serving the demo project's token.** It is a public route and that is correct; the defect was ever linking a signed-in user to it, which Story 4.4 fixed. | AGENTS rule #2 |
| 7 | Story 6.4 is a **Sweeper**: less code, same behaviour, no regressions, **and the old path proved unreachable** — no route renders it, no selector matches it, and a guard fails if it returns. `globals.css` holds **48** `.product-shell` references today; a scripted CSS prune needs a **parsed-rule** diff and will still be wrong the first time. | LEARNINGS |
| 8 | Story 6.4 **changes no pixel.** Prove it with the visual gate, which by then covers all 29 routes. | Story 6.4 |
| 9 | **No deferred row exists without an owner and a date**, and the gate fails when the date passes. The last epic shipped five deferred rows at birth. | Story 6.5 |
| 10 | The ratchet is on: a PR that lowers coverage **fails**. | Story 6.5 |
| 11 | ⚠️ **`/talk` is in scope and was missing from the scaffolded README's D6 list**, which named only `/hub/*`, `/login`, `/signup`, `/install` and `/s/[token]` — eight routes, not nine. Story 6.2 already lists it. The count that is right is **9**. | **D5-b** |

## Stories

### Story 6.1 — The second seam ✳ *executes D6's open question*
**As a** product owner, **I want** the nine non-`ProductShell` routes behind a switch too,
**so that** the redesign covers the whole product rather than 21 of 30 routes.
**Acceptance:** the seam the architecture lock chose — **`design-system/Frame.tsx`, carrying DD3's
`door` and `public` variants** — is implemented as decided, **not re-decided here**. ⚠️ It reads no
flag: this said "reading the same `isDesignV2Enabled()`", and there is none (D6, 2026-08-31). It is
shared chrome. Root `layout.tsx` was considered and **rejected** at the lock: it also wraps `/` and
`/methodology`, which two shipped epics own. That the 9 routes render is proved by the `authed`
suite, not by reading the diff.
**Risk:** high

### Story 6.2 — The doors
**As a** person arriving at the product, **I want** the first screens to speak the product's
language, **so that** signing in is not a change of visual worlds.
**Acceptance:** `/login`, `/signup`, `/install`, `/s/[token]` and `/talk` render from
`design-system/`, each with an approved reference state.
- **`/install` keeps serving the demo project's token.** It is a public route and that is correct
  (AGENTS rule #2); the defect was ever linking a signed-in user to it, and Story 4.4 fixed that.
- ⚠️ **CORRECTED 2026-08-29 — there is no expired state, and that is a decision.**
  `app/s/[token]/page.tsx` calls `notFound()` for unknown, malformed, expired **and** revoked alike,
  so the page cannot tell an attacker which one a token is. This story previously asked for "the
  expired state" as a designed page, which would have been a builder implementing a security
  regression to satisfy a doc. All four cases land on **`public-gone`**, one designed 404 whose copy
  deliberately does not say which. Found by reading the route while designing it (finding F2).
**Approved states:** `door-login`, `door-signup-closed`, `door-signup-open`, `public-install`, `public-share`, `public-gone`, `public-talk` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 6.3 — The hub
**As an** internal reader, **I want** the roadmap hub on the system, **so that** the four `/hub`
routes stop being a separate product.
**Acceptance:** `/hub/[project]`, `/hub/[…]/epic/[epicSlug]`, `/hub/[…]/horizon` and
`/hub/[…]/report` render from `design-system/` with reference states. `hub.module.css` is retired
into the system or explicitly kept with a written reason.
**Approved states:** `hub-roadmap`, `hub-epic`, `hub-horizon`, `hub-report` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 6.4 — Delete the old world ✳ *Sweeper*
**As a** builder on the next epic, **I want** exactly one stylesheet to reason about,
**so that** a rule I write cannot be silently overridden by the design this epic replaced.
**Acceptance:**
- `globals.css`'s `.product-shell` rules and `console.css`'s compensations for them are **deleted**,
  including `.product-shell main > h1`'s `clamp(30px, 7vw, 48px)` (contract Do-not #1).
- ⚠️ **NOTHING TO RETIRE — there was never a flag** (D6, Daniel, 2026-08-31). This bullet asked for
  `DESIGN_V2_ENABLED` and `isDesignV2Enabled()` to be removed from `lib/flags.ts` and from all three
  Vercel environments. Neither ever shipped: the predicate was written at the start of Sprint 3 and
  deleted in the same sitting. **Verify the absence instead** — `DESIGN_V2_ENABLED` and
  `isDesignV2Enabled` appear in no source file and in no Vercel environment — which is a grep, not a
  story's worth of work.
- **The old path is proved unreachable**, not merely unused: no route renders it, no selector matches
  it, and a guard fails if it returns.
- Behaviour is unchanged — this story changes no pixel. Prove it with the visual gate, which by now
  covers all 29 routes.
**Risk:** high

### Story 6.5 — 27 of 27, and the ratchet on
**As a** product owner, **I want** coverage to be complete and unable to slip,
**so that** the next epic inherits the rails instead of rebuilding them.
**Acceptance:**
- The manifest reports **27 / 27**. ⚠️ *Corrected at the lock (**D13**): 29 was 32 pages minus
  3 out of scope, before this epic's own Story 4.5 retired three routes and Story 4.3 added one.
  Two booleans are manifest fields; the third — "passes the visual gate" — is the gate's RESULT and
  deliberately not a field, because a field for it would be `true` on `main` by construction.*
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
   → It renders on the system, read-only, with no way into the product.
   Now mangle a character in the token and reload.
   → You get the designed **`public-gone`** page. It does **not** say whether the link expired, was
   revoked, or never existed — that distinction is exactly what it must not leak.
4. Go to https://goldenfrijoles.com/hub/miyagisanchez.
   → The hub is the same product as `/app`.
5. Go to https://goldenfrijoles.com/app/flags/miyagisanchez.
   → Unchanged from Sprint 4. Story 6.4 deleted the old stylesheet and must have moved nothing.
6. Open the PR's CI run, step **Design coverage + ratchet**.
   → Coverage reports **27 / 27**, the visual gate is blocking, and no deferred row is listed
   without an owner and a date.
7. Confirm `DESIGN_V2_ENABLED` / `isDesignV2Enabled` appears nowhere — it never shipped (D6) — in `lib/flags.ts` or in any
   of the three Vercel environments.
   → The flag is retired. There is one design now, and one stylesheet.

If any step fails, note the step number + what you saw — that's the bug report.
