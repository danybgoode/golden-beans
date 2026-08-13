---
status: shipped   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived.
slug: frijoles-rebrand-closeout
build_order: 19
---

# Epic: Golden Frijoles rebrand close-out

> **Area:** 02-commercial · **Risk:** low · **Class:** Chore · **Archetype:** Sweeper ·
> **Appetite:** S · **Scope seed:**
> [`00-ideas/seeds/frijoles-rebrand-closeout.md`](../../00-ideas/seeds/frijoles-rebrand-closeout.md)
> **Predecessor:** [`landing-frijoles-rebrand`](../landing-frijoles-rebrand/README.md) — shipped and
> live 2026-08-13; its D1 deliberately deferred the package/integration rename to this epic.

## Why

Golden Frijoles is live, but an engineer still copies the old SDK package name, OpenFeature still
reports old provider identities, the footer carries mockup bookkeeping Daniel never intended to
ship, and the signed-in product has no shared mobile sweep. This closes those named debts without
pretending that live wire identifiers or historical tenant identities are ordinary brand copy.

## Platform-first note

No new primitive, route, table, event path, or flag is needed. The work reuses the publishable SDK
workspace, the existing app-to-engine import path, the landing’s local honesty assertions,
`assertMobileClean`, and Playwright’s disposable `auth-setup` → `authed` → `auth-teardown` rail.
Telemetry remains entirely on the SDK/engine path required by AGENTS rule #1.

## Architecture decisions — dated product-owner amendments

These answers were put to Daniel explicitly after verifying the live code, npm registry state, and
production tenant identities. Daniel approved all of them on **2026-08-13**; they supersede
`landing-frijoles-rebrand` D1 only at the boundaries named here.

**A1 — Publish `@golden-frijoles/sdk@0.4.0`, then deprecate the old published version.**
The new scoped package is published only after the full gate, pack inspection, and explicit CLI
authentication succeed. It must install and import from a clean directory before
`@golden-beans/sdk@0.1.0` is deprecated with a pointer. Daniel explicitly authorized both named
outward actions; a failed publish or OTP challenge fails loud and never substitutes a registry.

**A2 — OpenFeature provider identities change in the same breaking pre-1.0 minor bump.**
`golden-beans` becomes `golden-frijoles`; `golden-beans-scenarios` becomes
`golden-frijoles-scenarios`. Consumers can assert these values, so tests and the SDK README state
the runtime-contract change rather than passing it off as copy.

**A3 — The signed webhook test envelope is frozen.**
`golden_beans.webhook.test` and its test payload remain byte-compatible. Miyagi verifies signed
envelopes from the shared fixture; changing the producer without a receiver release would break a
live delivery contract. This is a named survivor, not a missed replacement.

**A4 — Production tenant slugs remain `golden-beans` and `golden-beans-demo`.**
The first owns historical landing telemetry; the second owns the synthetic public proof. No data
migration, env change, or event relinking occurs. Rendered brand labels change, while these
server-resolved data identifiers stay stable and are named wherever they remain visible.

**A5 — Resilience and security gates remain OFF.**
`RESILIENCE_SCENARIOS_ENABLED` and `SECURITY_SIMULATIONS_ENABLED` keep their honest derived badges.
Activating either is a separate rollout: env value, new Git-tracked deployment, then behavioral
proof. This cleanup does not smuggle activation into a rename.

**A6 — Integration addresses outside the SDK package stay stable.**
The GitHub repository, Vercel/Supabase projects, existing `GOLDEN_BEANS_*` consumer env names, and
MCP server identity `golden-beans-connector` are addresses other systems resolve. Private root/web
workspace names may change because the repository has no external consumer for them; the listed
integration identifiers may not.

**A7 — The premise “every public artifact was renamed” was disproved during orientation.**
Three directly served SVG assets still contain old-brand titles/text, their filenames/README name
the old pack, and the live-proof frame contains a non-data `connected: golden-beans` literal. They
join this close-out rather than being waved away as “below the surface.” Historical Roadmap prose
that was true when written and stale `.claude/worktrees/` copies do not join the sweep.

**A8 — Release order makes the public install line truthful at every step.**
Build/test/pack → publish new package → clean-install/import the registry artifact → deprecate old
package → merge the PR (which deploys the new install line) → verify production behavior. Never
serve a copy-paste command before the package exists; never run a manual Vercel deploy.

**A9 — The new npm scope is a free public-package organization owned by Daniel.**
The first publish proved that npm does not mint an arbitrary scope from a package name: it rejected
`@golden-frijoles/sdk` until the `golden-frijoles` organization existed. Daniel authorized the
required outward action, and the organization was created on **2026-08-13** under `danybgoode` on
npm's free unlimited-public-packages plan. No private-package subscription or additional member
access was added.

### Deliberate survivor inventory

- **Signed delivery contract (A3):** `apps/web/lib/delivery-payload.ts` and the Miyagi-pinned
  `apps/web/e2e/_fixtures/merchant-lifecycle.fixtures.json` retain the exact
  `golden_beans.webhook.test` envelope and verification message.
- **Tenant data (A4):** `golden-beans` / `golden-beans-demo` defaults remain in self-tracking,
  public-demo, seeds, reserved-slug logic, and tenant-aware specs. They are database identities and
  may appear when a surface truthfully displays its project slug.
- **Caller/protocol addresses (A6):** the documented `GOLDEN_BEANS_FLAG_*` consumer env examples;
  `golden-beans-connector`; existing `x-golden-beans-*` headers and signed scenario-domain strings;
  and `golden-beans-engine` task attribution remain stable.
- **Infrastructure/repository addresses (A6):** the `golden-beans` GitHub/Vercel/Supabase project,
  checkout paths, daemon labels/log paths, notification provenance, and their tests remain named as
  deployed. Those are locators, not product copy.
- **Historical artifacts (A7):** dated Roadmap prose and non-deployed design explorations/reference
  mocks continue to describe the then-current Golden Beans work. Active source/docs around them use
  Golden Frijoles; stale `.claude/worktrees/` copies remain untouched.

## Build contract — locked before implementation

- All replacements are scoped to `apps/`, `packages/`, `scripts/`, `Roadmap/`, `references/`, and
  root manifests; `.claude/worktrees/` and the user-owned untracked handoff file are untouched.
- Every scripted replacement asserts the expected old match; final sweeps compare against the
  explicit A3/A4/A6 exception set rather than expecting zero blindly.
- The new authed spec proves it rendered a signed-in target (status + no login redirect) before it
  calls the existing helper; it does not reimplement the mobile rule.
- Every new spec is observed red at least once. Guard/helper wiring is mutation-checked with the
  same suspicion as product code, and all mutations are reverted before the gate.
- Local API failures at `event-context.spec.ts:683` and `north-star-sync.spec.ts:69` are baselined
  against `origin/main` if they recur; they do not buy unrelated edits.

## What already exists (reuse, don’t rebuild)

| Need | Existing seam | This epic adds |
|---|---|---|
| SDK release | `packages/sdk` build/prepack/exports | package/provider identity, docs, `0.4.0`, registry proof |
| App integration | root + `apps/web` workspaces and current SDK imports | one canonical renamed dependency/import path |
| Public install claim | `SdkSection`, `/install`, onboarding snippets | the package that now actually exists |
| Landing honesty | `landing.browser.spec.ts` local surface/gate/infomercial checks | ledger-absence and zero-old-brand residue checks |
| Mobile rule | `mobile-heuristics.browser.spec.ts` exported `assertMobileClean` | signed-in route parameterization only |
| Real auth | `auth.setup.ts`, `authed-fixture.ts`, `auth.teardown.ts` | no second login/fixture mechanism |
| Review | `scripts/review-route.mjs` | two routed full-scope passes on stabilized head |

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 — Canonical Golden Frijoles workspace and SDK package | low |
| 1 | 1.2 — Breaking provider identity made explicit and tested | low |
| 1 | 1.3 — Footer ledger and public residue removed without losing honesty | low |
| 1 | 1.4 — Real signed-in mobile sweep on the existing auth rail | low |
| 1 | 1.5 — Publish, review, deploy, verify, and clear the owed ledger | low |

## Deploy order

No migration or env change. Run the complete local gate and rendered rails first. Publish and
clean-install `@golden-frijoles/sdk@0.4.0`, deprecate only the verified old version, then merge the
LOW-risk PR. The merge to `main` is the only Vercel deployment. Verify the new install line, absent
footer ledger, local honesty labels, and OFF badges on `https://goldenfrijoles.com`.

## Definition of Done (epic)

- [x] All stories merged to `main` and smoke-tested; actual gate output recorded
- [x] `sprint-1.md` carries a fool-proof smoke walkthrough with real URLs
- [x] `@golden-frijoles/sdk@0.4.0` installs/imports from a clean directory; §9 matches it
- [x] `@golden-beans/sdk@0.1.0` is deprecated only after the new package proof
- [x] Package/provider decisions A1–A9 are reflected in code/docs; every survivor is named
- [x] No public surface says “Golden Beans”; technical survivors from A3/A4/A6 are enumerated
- [x] Footer ledger and unused CSS are gone; local honesty assertions still pass
- [x] Authed mobile sweep reaches real signed-in routes and has an observed-red record
- [x] Two routed full-scope cross-family passes have read the stabilized result (quota downgrade, if
      any, recorded under the router’s refund rule)
- [x] Production verified by exercising `https://goldenfrijoles.com`, never by env listings
- [x] Retrospective, product poster, and durable learnings updated; older credential-gated debts named
- [x] Feature branch deleted; this README frontmatter `status: shipped`; build order regenerated
