# Golden Frijoles rebrand close-out — Sprint 1: Identity, cleanup, and owed rails

**Status:** ⬜ not started

## Build contract (locked before implementation)

Follow epic amendments A1–A8 verbatim. In particular: change the SDK/provider identities; do not
change the webhook envelope, tenant slugs, integration env names, or MCP server identity; reuse the
auth/mobile helpers; publish before deploying the new install line; assert every scripted match.

## Stories

### Story 1.1 — Canonical Golden Frijoles workspace and SDK package

**As an** application engineer, **I want** the package and every current integration import to use
the Golden Frijoles identity, **so that** the setup command I copy is the package the product owns.

**Acceptance:** root/web private workspace names and the public SDK package name/description/version
are updated; root/app scripts and dependencies build the new workspace; every current app/script
import and live install snippet uses `@golden-frijoles/sdk`; the lockfile is regenerated rather than
hand-waved; SDK-owned comments/README say Golden Frijoles; historical docs and A3/A4/A6 identifiers
remain explicit exceptions; pack contents are inspected.

**Risk:** low

### Story 1.2 — Breaking provider identity made explicit and tested

**As an** OpenFeature consumer, **I want** provider metadata to report the renamed product under a
version that declares the break, **so that** runtime assertions do not change invisibly.

**Acceptance:** flag and scenario providers return `golden-frijoles` and
`golden-frijoles-scenarios`; tests assert both values and are observed red against the old names;
the SDK README calls out the `0.4.0` provider-identity change and deliberately retained consumer
env examples.

**Risk:** low

### Story 1.3 — Footer ledger and public residue removed without losing honesty

**As a** landing reader, **I want** claims explained at their source instead of in a footer ledger,
**so that** the page ends cleanly and remains trustworthy.

**Acceptance:** the ledger paragraph, stale explanatory source comment, and unused `.footer__meta`
rule are gone; a browser assertion observed red on the pre-change page proves the ledger is absent;
every framed surface remains labelled real/illustrated, each resilience card reflects its own gate,
and the infomercial labels invented content; directly served SVG assets/README and the non-data
live-proof title use Golden Frijoles; final public-source/rendered sweeps name only A3/A4/A6 survivors.

**Risk:** low

### Story 1.4 — Real signed-in mobile sweep on the existing auth rail

**As a** signed-in owner on a phone, **I want** operating routes to fit and remain tappable,
**so that** product quality is measured after login rather than against a redirect.

**Acceptance:** a new `*.authed.spec.ts` imports `assertMobileClean`; reads the disposable tenant
record lazily after `auth-setup`; visits the current signed-in route set at 360px and 390px; asserts
200/session/no-login before measuring; reports the exact route/width/control on failure; and is
observed red through targeted auth/layout mutations that are reverted and verified clean.

**Risk:** low

### Story 1.5 — Publish, review, deploy, verify, and clear the owed ledger

**As the** product owner, **I want** the rename released and the carry-over ledger resolved with
evidence, **so that** completion means installable, reviewed, deployed, and observed.

**Acceptance:** the actual format/lint/four-project typecheck/unit/build/design-drift/API outputs are
recorded; relevant browser/authed projects pass; two full-scope cross-family passes are routed with
`review-route.mjs`; the new package publishes and clean-installs before the old package is deprecated;
the LOW-risk PR merges on green; the production landing behavior is exercised; the signals-loop
production write smoke and Daniel’s first real share links remain surfaced as credential-gated debts,
not attempted.

**Risk:** low

## Sprint QA

- **unit specs:** provider metadata identities, exercised through the real factory return values;
  package build/type resolution through the renamed workspace.
- **browser specs:** `landing.browser.spec.ts` for ledger absence, brand residue, surface notes,
  flag-derived badges, infomercial disclaimers, and the new §9 install line.
- **authed browser spec:** `mobile-heuristics.authed.spec.ts` on the existing disposable-tenant rail;
  run against a locally built server with `SIGNUP_ENABLED=true` and local Supabase.
- **observed red:** provider test fails on old metadata; footer-absence assertion fails before
  deletion; authed sweep fails against targeted auth and layout mutations. Revert and diff-clean.
- **deterministic gate:** `npm run lint` → `npm run format:changed` → `npm run test:unit` →
  `npm run typecheck` (four projects) → `npm run build` → `npm run check:design-drift` → locally
  built Playwright `api`; report actual counts/results.
- **review:** exactly two external full-scope passes selected by
  `node scripts/review-route.mjs --builder codex --tier low <PR#>`; no hand-picked family and no LOW
  tier reviewer subagent. A capped family triggers the router’s refund window/downgrade record.

## Sprint 1 — Smoke walkthrough (do these in order)

Env: registry + production · https://goldenfrijoles.com

1. In a new temporary directory, install `@golden-frijoles/sdk@0.4.0` from npm and import it in Node.
   → Installation succeeds from the registry and the SDK exports load without using this checkout.
2. Inspect `@golden-beans/sdk@0.1.0` on npm.
   → Its deprecation message points to `@golden-frijoles/sdk`; the old artifact remains available.
3. Go to https://goldenfrijoles.com/#sdk.
   → §9 shows `npm install @golden-frijoles/sdk`; no old package exception remains.
4. Go to https://goldenfrijoles.com and scroll to the footer.
   → The brand/agent-manifest links remain and the “Footnote ledger” paragraph is absent.
5. On the same page, inspect the framed surfaces, infomercial, and Resilience section.
   → Frames say real/illustration; invented testimonials disclaim themselves; both OFF capabilities
   say “not switched on yet” from their own live gates.
6. Run `npm run test:e2e:authed` against the locally built server with local Supabase and
   `SIGNUP_ENABLED=true` on the running process.
   → A disposable real session visits the signed-in route set; every route passes the shared
   360/390px overflow and 44px target checks; teardown removes the tenant and auth user.
7. Open the production directly served canonical brand SVG URLs.
   → The accessible titles and visible lockup text say Golden Frijoles; old asset paths no longer
   serve stale-brand content.

Still owed, not part of this smoke: the signals-loop production write proof and Daniel minting the
first real pod-report share links; both need credentials only Daniel can mint.

If any step fails, note the step number and what you saw — that is the bug report.
