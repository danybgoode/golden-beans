# Golden Frijoles rebrand close-out — Sprint 1: Identity, cleanup, and owed rails

**Status:** ✅ shipped 2026-08-13 — PR #96, merge `0a0beb0`

## Build contract (locked before implementation)

Follow epic amendments A1–A9 verbatim. In particular: change the SDK/provider identities; do not
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

**Shipped:** PR #96, merge `0a0beb0`.

### Story 1.2 — Breaking provider identity made explicit and tested

**As an** OpenFeature consumer, **I want** provider metadata to report the renamed product under a
version that declares the break, **so that** runtime assertions do not change invisibly.

**Acceptance:** flag and scenario providers return `golden-frijoles` and
`golden-frijoles-scenarios`; tests assert both values and are observed red against the old names;
the SDK README calls out the `0.4.0` provider-identity change and deliberately retained consumer
env examples.

**Risk:** low

**Shipped:** PR #96, merge `0a0beb0`.

### Story 1.3 — Footer ledger and public residue removed without losing honesty

**As a** landing reader, **I want** claims explained at their source instead of in a footer ledger,
**so that** the page ends cleanly and remains trustworthy.

**Acceptance:** the ledger paragraph, stale explanatory source comment, and unused `.footer__meta`
rule are gone; a browser assertion observed red on the pre-change page proves the ledger is absent;
every framed surface remains labelled real/illustrated, each resilience card reflects its own gate,
and the infomercial labels invented content; directly served SVG assets/README and the non-data
live-proof title use Golden Frijoles; final public-source/rendered sweeps name only A3/A4/A6 survivors.

**Risk:** low

**Shipped:** PR #96, merge `0a0beb0`.

### Story 1.4 — Real signed-in mobile sweep on the existing auth rail

**As a** signed-in owner on a phone, **I want** operating routes to fit and remain tappable,
**so that** product quality is measured after login rather than against a redirect.

**Acceptance:** a new `*.authed.spec.ts` imports `assertMobileClean`; reads the disposable tenant
record lazily after `auth-setup`; visits the current signed-in route set at 360px and 390px; asserts
200/session/no-login before measuring; reports the exact route/width/control on failure; and is
observed red through targeted auth/layout mutations that are reverted and verified clean.

**Risk:** low

**Shipped:** PR #96, merge `0a0beb0`.

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

**Shipped:** PR #96, merge `0a0beb0`; npm release and deprecation completed before merge.

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

## Build evidence (2026-08-13)

- The asserted package/import sweep stopped before writing when its first expected count was wrong
  (41 files, not 40), then rewrote 54 exact occurrences and proved the old scope absent.
- Both provider metadata assertions were observed red against the old runtime names, then passed
  12/12 targeted SDK tests after the provider change.
- The landing assertions were observed red against production before implementation: the footer
  still had one `.footer__meta` block and the new canonical mark URL returned 404. The complete
  15-test landing browser spec passes locally after the cleanup, including all local honesty labels.
- The mobile helper was mutation-checked with an impossible 440px target floor. After that mutation
  was reverted, the first real authed run exposed undersized sortable headers plus page overflow on
  scenario/destination tables. The shared component and table rails were fixed; all eight routes,
  setup, and teardown now pass (10/10) at 360px and 390px.
- Blocking gate: format check passed; ESLint passed with zero warnings; all four TypeScript projects
  passed; unit tests passed 1,068/1,068; production build passed (30 static pages); design drift
  passed across 95 component files. The hermetic API rail passed its 9 dark-gate tests, 5
  sync-with-serving-off tests, and 446 enabled tests with 33 skips; its sole failure was the
  documented accumulated-local-DB false alarm at `north-star-sync.spec.ts:69`. That spec and its
  north-star implementation path are byte-unchanged from `origin/main`.
- The complete authenticated project passed 44/44 after its required loopback-only
  `SUPABASE_DB_URL` was supplied. The complete landing browser spec passed 15/15, including every
  local honesty assertion after the footer ledger was removed.
- npm accepted `@golden-frijoles/sdk@0.4.0` with a registry PUT 200 after Daniel completed the
  security-key challenge. The first scoped publish required creating the free public-package
  `golden-frijoles` organization (epic A9); npm then reported public visibility, `latest: 0.4.0`,
  one published version, and the expected 24-file/41.6 kB tarball. After the first-package metadata
  cache propagated, a new temporary directory installed the named package with zero audit findings;
  Node loaded the growth-client, flag-provider, and scenario-provider exports, and the installed
  provider identities were `golden-frijoles` / `golden-frijoles-scenarios`. Only after that proof,
  npm accepted and served the verified `@golden-beans/sdk@0.1.0` deprecation pointer: “This package
  moved to `@golden-frijoles/sdk`. Install `@golden-frijoles/sdk` instead.”
- PR #96 merged to `main` as `0a0beb0` at 2026-08-13 14:21 UTC. GitHub deployment `5889853438`
  attached the exact SHA to Production and completed successfully; no manual Vercel deploy ran.
  Against `https://goldenfrijoles.com`, the committed landing browser suite passed 15/15: §9 served
  the new package, the footer ledger was absent, the canonical assets and public brand were renamed,
  every honesty label remained, and both resilience/security cards derived their honest OFF state.
  A direct rendered Chromium inspection showed the Golden Frijoles hero and no console errors.
- The shared `live-smoke` skill could not run because this repository does not contain its required
  `scripts/live-smoke.mjs` wrapper. The gap is explicit rather than hidden behind an invented
  equivalent; the committed production browser spec plus direct rendered inspection supplied the
  behavioral proof for this close-out.
