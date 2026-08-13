---
title: "Golden Frijoles rebrand close-out — SDK identity, footer cleanup, and authed mobile rail"
slug: frijoles-rebrand-closeout
status: scaffolded
area: "02"
type: chore
priority: null
appetite: S
underwritten_by: null
risk: low
epic: "02-commercial/frijoles-rebrand-closeout"
build_order: 19
updated: 2026-08-13
---

# Pitch — Golden Frijoles rebrand close-out

## Problem

`landing-frijoles-rebrand` deliberately stopped at the public brand boundary, leaving the published
SDK address, two runtime provider identities, live wire/data identifiers, and one public install
exception under the old name. Its footer also shipped a mockup-only footnote ledger, while the
signed-in product still lacks the reusable mobile sweep already built for public routes. The result
is a finished-looking rebrand with an unfinished integration seam and two explicitly owed quality
items.

## Appetite

**S — one fixed-scope builder session.** This buys the package identity change, the footer/public
residue cleanup, the authed mobile rail, the full deterministic gate, two routed cross-family reads,
the authorized npm release, and production verification. It does not buy a receiver migration, a
tenant data migration, or activation of dark scenario/security capabilities.

## Outcome & signal

An engineer can clean-install `@golden-frijoles/sdk@0.4.0`; every current app/script import resolves
through that package; OpenFeature reports the approved Golden Frijoles provider identities; the live
landing shows the installable package and no footer ledger; and signed-in operating routes are
measured as themselves at 360px and 390px rather than as login redirects. Daniel can verify the npm
artifact from a clean directory and the page behavior on `https://goldenfrijoles.com`.

## Stage-2.5 bucket

**Light enhancement.** No product primitive, route, table, telemetry path, or design component is
new. This closes named exceptions and debt using the SDK workspace, existing landing honesty specs,
`assertMobileClean`, and the existing `auth-setup`/`authed` Playwright rail.

## Bill of materials (What / Why)

| What | Why |
|---|---|
| New SDK/package identity | The public install line must name a package that actually exists |
| Provider identity bump | OpenFeature metadata is a runtime contract, not brand decoration |
| Footer/public residue removal | Mockup bookkeeping and directly served old-brand assets are not product copy |
| Authed mobile sweep | Signed-in routes must be measured after real login, not against `/login` |
| Release + verification | A renamed package is not shipped until a clean consumer can install it |

## Scope

**In v1:**

- Rename the private root/web workspace identities and the public SDK package to Golden Frijoles;
  bump the SDK to `0.4.0`; update workspace scripts/dependencies, lockfile, app/script imports,
  install snippets, SDK README, package description, and SDK-owned source comments.
- Change provider metadata to `golden-frijoles` and `golden-frijoles-scenarios`, pin both with tests,
  and state the breaking pre-1.0 identity change in the SDK README.
- Publish `@golden-frijoles/sdk@0.4.0`, install it from a clean directory, then deprecate
  `@golden-beans/sdk@0.1.0` with a pointer. Daniel explicitly authorized both outward actions on
  2026-08-13; npm authentication/OTP must still succeed on the CLI rail.
- Delete the footer ledger and its unused CSS; keep the local `SurfaceNote`, flag-badge, and
  infomercial honesty assertions; remove the directly served old-brand SVG/text residue and the
  non-data `connected: golden-beans` label found during orientation.
- Add an `*.authed.spec.ts` sweep that reuses `assertMobileClean` on real signed-in routes through
  the existing disposable tenant/session setup. Assert each target rendered without a login redirect.
- Run the project’s actual local/CI gates, the opted-in browser/authed rails relevant to the change,
  two routed full-scope cross-family reviews, Git-tracked deployment, and production behavior proof.

**Out of v1 (no-gos):**

- Do not change `golden_beans.webhook.test` or its signed test-envelope payload. They remain a named
  live wire-contract survivor until the Miyagi receiver can change in a coordinated release.
- Do not rename the production `golden-beans` / `golden-beans-demo` tenant slugs, migrate historical
  events, or change `SELF_PROJECT_SLUG` / `DEMO_PROJECT_SLUG` values.
- Do not rename the GitHub repository, Vercel/Supabase projects, existing `GOLDEN_BEANS_*` consumer
  env-var names, or the MCP server identity `golden-beans-connector`; these are integration addresses,
  not unattended labels. Every survivor is enumerated in the epic decision record.
- Do not enable `RESILIENCE_SCENARIOS_ENABLED` or `SECURITY_SIMULATIONS_ENABLED`; their honest OFF
  badges stay derived from the gates. Activation remains a separate env + deployment + proof rollout.
- Do not attempt the credential-gated signals-loop production write smoke or mint Daniel’s first real
  pod-report share links. Surface both as still owed.
- Do not edit stale `.claude/worktrees/` copies or rewrite historical Roadmap records that were true
  under the old package name when written.

## Rabbit holes

- **A string may be an identifier.** Provider metadata, webhook type/payload, tenant slugs, env vars,
  and MCP server name are classified before the sweep; only approved identities change.
- **Release order is part of correctness.** Green gate and pack inspection come first; new npm package
  publication and clean install precede the public install-line deployment; old-package deprecation
  follows successful new-package installation.
- **Workspace resolution can lie.** Confirm `require.resolve('@golden-frijoles/sdk')` points at the
  intended local workspace before trusting package-touching tests; clean-dir installation proves the
  registry artifact independently.
- **A mobile guard can test the wrong page.** Each authed route asserts status/session/URL before
  calling the shared helper, and the new spec is mutation-checked against a real layout/session fault.
- **A sweep can silently miss.** Every scripted replacement asserts its old match count; final searches
  are path-scoped and their deliberate exception set is compared explicitly.

## What already exists (reuse, don’t rebuild)

- `packages/sdk` — buildable/publishable workspace with `prepack`, typed exports, and README.
- Root and `apps/web` workspace scripts — the one app-to-engine SDK path required by AGENTS rule #1.
- `packages/sdk/src/{flag-provider,scenario-provider}.ts` — the two provider metadata contracts.
- `apps/web/components/landing/SdkSection.tsx`, `apps/web/app/install/page.tsx`, and onboarding snippets
  — current copy-paste install/import surfaces.
- `apps/web/e2e/landing.browser.spec.ts` — public brand, `SurfaceNote`, resilience-gate, and infomercial
  honesty assertions.
- `apps/web/e2e/mobile-heuristics.browser.spec.ts` — exported `assertMobileClean` plus the 360/390 and
  44px control contract.
- `apps/web/e2e/auth.setup.ts`, `helpers/authed-fixture.ts`, and Playwright’s `authed` project — real
  disposable login/provision/storage-state/teardown rail.
- `scripts/review-route.mjs` — the only reviewer selector; two external passes, no hand-picking.

## UX heuristics & rails check

- **CI guards covering this surface:** lint, new-file format guard, four-project typecheck, unit tests,
  build, `check:design-drift`, Playwright `api`; opt-in `browser` and `authed` projects for rendered QA.
- **Audits-lens findings that apply:** `app-ux-audit-2026-08-01.md` identifies `ProductShell` as the
  common signed-in rail, so a parameterized sweep is preferable to route-specific copied checks.
- **Design-language debt:** none introduced; the footer deletion removes copy/CSS, and brand assets
  stay within the existing material system.

## Acceptance criteria

1. **As an application engineer, I want the Golden Frijoles SDK identity to be installable and
   internally canonical, so that copied setup instructions work.** Acceptance: workspace tests build
   through `@golden-frijoles/sdk`; all current app/script imports and install snippets use it; provider
   metadata returns the approved names; `npm pack --dry-run` contains only the intended files; a clean
   directory installs and imports `@golden-frijoles/sdk@0.4.0`; the old published version is deprecated
   only after that proof.
2. **As a landing reader, I want claims explained where they appear rather than in a footer ledger,
   so that the page ends cleanly without losing honesty.** Acceptance: the ledger element and unused
   rule are absent; framed surfaces, gate-derived state, and invented infomercial content remain
   asserted locally; directly served brand assets and rendered labels no longer present old branding,
   except the enumerated wire/data addresses.
3. **As a signed-in owner on a phone, I want operating routes to fit and remain tappable, so that the
   product is usable rather than merely login-page-clean.** Acceptance: an authed parameterized spec
   reaches real owner routes without redirect, then proves no horizontal overflow and no in-scope
   control below 44px at 360px and 390px; the spec is observed red by a targeted mutation.
4. **As the product owner, I want the owed ledger closed with evidence, so that “done” means released,
   reviewed, deployed, and behaviorally verified.** Acceptance: actual full-gate outputs are recorded;
   both reviewer families see the stabilized full diff; production serves the new install line and no
   ledger; OFF badges remain honest; credential-only older items are named, not attempted.

## Open risks / research

- Registry checks on 2026-08-13: `@golden-beans/sdk` exposes only `0.1.0` (maintainer `danybgoode`),
  while the repo is `0.3.0`; `@golden-frijoles/sdk` returns npm 404 before publication.
- The new scoped name may still require scope ownership plus interactive OTP despite CLI login.
- `packages/sdk@0.4.0` intentionally carries a breaking provider-identity change; package-name change
  alone would not make that runtime contract non-breaking.
- Two local API specs are known fresh-DB false alarms (`event-context.spec.ts:683` and
  `north-star-sync.spec.ts:69`); baseline against `origin/main` instead of changing unrelated code.
- Advisory planning panel was offered because npm namespace/provider identity is expensive to reverse;
  Daniel approved the recommended direct decisions without requesting the optional panel.
