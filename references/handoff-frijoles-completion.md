# Handoff — finish the Golden Frijoles rename, and pay off the owed ledger

> Paste this whole file as the opening prompt of a new session, from
> `/Users/cosmo/dobby/golden-beans` on `main`.

---

You are picking up immediately after `landing-frijoles-rebrand`, which shipped 2026-08-13
(PR #95, `5544c06`; close-out `5d12980`) and is **live on https://goldenfrijoles.com**. That epic
renamed every **public surface** to Golden Frijoles and deliberately stopped there — see its
**D1** in `Roadmap/02-commercial/landing-frijoles-rebrand/README.md`.

This session finishes the rename **below** the public surface, removes one piece of copy that was
never meant to ship, and clears the owed ledger.

## Orient first

Read, in this order — they are the source of truth and they change often:

1. `AGENTS.md` — the five rules that cannot be violated. Rule #4 in particular: **merging to `main`
   IS the deploy**, and env vars need a **new deployment** to reach running functions.
2. `Roadmap/WAYS-OF-WORKING.md` — cadence, Definition of Done (story *and* epic), and the
   **review & merge** policy. Route reviewers with `scripts/review-route.mjs`; never hand-pick.
3. `CODE-QUALITY.md` — the house style. Note **§5b**, added by the last epic: *your guards get the
   same suspicion as your code*.
4. `Roadmap/LEARNINGS.md` → **Review quality**. The last epic added five entries there; three of
   them are about mistakes that are easy to repeat in exactly this kind of work.
5. `Roadmap/02-commercial/landing-frijoles-rebrand/RETROSPECTIVE.md` — what shipped, what is owed.

The local gate recipe and its known-false-alarm failure modes are in team memory
(`reference-local-ci-gate-recipe`). **Two api specs fail locally and are pre-existing** —
`event-context.spec.ts:683` and `north-star-sync.spec.ts:69`. They are green on a fresh DB. Do not
spend the session on them; baseline against `origin/main` if they look new.

---

## Scope

### A. Rename the SDK — but read the decision points first

`packages/sdk` is `@golden-beans/sdk` at local version `0.3.0`.

**Four things make this more than a find-and-replace. Verify each yourself before deciding:**

1. **The package is PUBLISHED on npm.** `npm view @golden-beans/sdk` → `0.1.0`, one version,
   maintainer `danybgoode`. So the published artifact is *behind* the repo, and the rename means
   **publishing a new scoped package**, not editing a name. `@golden-frijoles/sdk` is currently
   **free** (404). Decide with Daniel: publish the new name and `npm deprecate` the old one with a
   pointer, or leave the old one untouched. **Publishing to npm is an outward-facing, hard-to-
   reverse act — confirm with Daniel by name before running `npm publish`.**

2. **`metadata: { name: 'golden-beans' }` is an OpenFeature provider identity**, not a label —
   `packages/sdk/src/flag-provider.ts:75,345` and `scenario-provider.ts:102,446`
   (`'golden-beans-scenarios'`). OpenFeature consumers can and do assert on provider name. Changing
   it is a **breaking change to a runtime contract**. Recommend: change it in the same major/minor
   bump that renames the package, and say so in the SDK README — or keep it and write down why.

3. **`type: 'golden_beans.webhook.test'` is a WIRE contract** (`apps/web/lib/delivery-payload.ts:98`)
   and is pinned by a **cross-repo fixture**
   (`apps/web/e2e/_fixtures/merchant-lifecycle.fixtures.json:292`). A receiver in the Miyagi repo
   verifies signed envelopes. The last epic deliberately did **not** touch this. If you change it,
   the consumer changes with it, in a coordinated order — otherwise you break live delivery.

4. **There is a live tenant whose slug is `golden-beans`.** Verified in the production DB:
   slugs are `golden-beans`, `golden-beans-demo`, `miyagi`, `miyagisanchez`. `golden-beans` is the
   engine's **self-tracking tenant** — the landing's own dogfood funnel
   (`apps/web/lib/self-track.ts`, `scripts/seed-self-project.mjs:31`, default `'golden-beans'`,
   overridable by `SELF_PROJECT_SLUG`). Renaming a slug is a **data migration plus an env change
   plus a redeploy**, and it orphans historical events unless done deliberately. Treat this as its
   own decision; the safe default is to leave the slugs alone and note it.

**What is unambiguously in scope for A:** the package `name` and `description` in
`packages/sdk/package.json`, `packages/sdk/README.md`, the SDK's own source comments, every
`@golden-beans/sdk` import across `apps/web` and `scripts/`, the workspace wiring in the root and
`apps/web` `package.json`, `package-lock.json`, and `§9`'s install line in
`apps/web/components/landing/SdkSection.tsx` — which currently reads
`npm install @golden-beans/sdk` **because that is the package that exists**. That line is the whole
reason D1 drew the boundary where it did; it changes in the epic that republishes the package.

⚠️ `.claude/worktrees/` contains stale copies of the repo. **Do not edit them.** Scope every sweep
to `apps/`, `packages/`, `scripts/`, `Roadmap/`, `references/` and the root manifests.

### B. Delete the footer ledger

`apps/web/components/landing/Footer.tsx` — the `<p className="footer__meta">` block beginning
"Footnote ledger, in order of appearance…". It was a mockup device and Daniel does not want it on
the shipped page.

- **Nothing asserts it.** Verified: the only reference in `e2e/` is a code *comment* in
  `landing.browser.spec.ts:61`. Removing it breaks no spec.
- Remove the now-unused `.footer__meta` rule (`apps/web/app/globals.css:1090`) if nothing else uses
  it — check, don't assume.
- **The honesty claims the ledger carried must not die with it.** Each surface already labels
  itself (`SurfaceNote`, the flag-derived badges, the infomercial's own disclaimers) and
  `landing.browser.spec.ts` asserts that. Confirm that is still true after removal rather than
  assuming — the ledger existed because someone once worried it wasn't.

### C. The owed ledger

1. **The authed mobile sweep** — the highest-value item, owed since `landing-redesign-v2`.
   `e2e/mobile-heuristics.browser.spec.ts` exports `assertMobileClean` and sweeps
   `PUBLIC_MOBILE_ROUTES`. The `browser` project is anonymous by construction, so a signed-in route
   currently gets measured against its login redirect. Write the `*.authed.spec.ts` counterpart on
   the existing `auth-setup` rail. `npm run test:e2e:authed` needs `SIGNUP_ENABLED=true` on the
   running server.
2. **`RESILIENCE_SCENARIOS_ENABLED` / `SECURITY_SIMULATIONS_ENABLED` are OFF in production.** That
   is the honest state and §Resilience says so by reading each gate. If Daniel wants either on, it
   is an env change **plus a new Git-tracked deployment**, and the badge clears itself.
3. **A final full-scope cross-family round.** Both families capped at the end of PR #95: Codex hit a
   hard quota after round 9 (its findings were fixed; it never saw the fixes), and agy fell back to
   `gpt-oss-120b-medium` at round 6. Quota permitting, run one clean full-scope pass over the
   merged result.
4. Older owed items, still open, from team memory: the **signals-loop prod write smoke** and
   **Daniel minting the first real pod-report share links**. Both need credentials only he can
   mint — surface them, don't attempt them.

---

## How to work this

- **Plan first.** This is a rename with four genuine decision points and a data question. Enter plan
  mode, put the either/ors to Daniel **with a recommendation**, and record the answers as dated
  **amendments in the epic README** — never as a silent reinterpretation.
- Scaffold `Roadmap/02-commercial/<epic-slug>/` docs **before code**.
- Branch `feat/<epic-slug>` off `main`. Merges are pre-authorized at LOW tier; that changes *who
  decides to pause*, not *whether the gates run*.
- **Assert every scripted edit** (`CODE-QUALITY.md` #6). The last epic's rename sweep listed twelve
  files that matched nothing, and that failure is how the exception set got enumerated instead of
  guessed. Reuse that shape.
- **Run the full gate and report its actual output** — format · lint · typecheck (4 projects) ·
  test:unit · build · design-drift · Playwright `api`. "Should pass" is not a result.
- Every new spec is **observed red at least once**, by mutation where the code came first.

## Two traps this specific work sets

- **A rename touches wire contracts that look like strings.** The provider metadata names, the
  webhook envelope `type`, and the tenant slug are all identifiers other systems resolve. Grep for
  the *value*, then ask what reads it, before changing it.
- **`grep` for the siblings of every fix.** The last epic corrected a flag-honesty claim in a
  section's lead paragraph and left the identical claim in its card copy one level down — a reviewer
  caught it six rounds later. When you change one instance of a string or a rule, find the rest.

## Definition of Done

`Roadmap/WAYS-OF-WORKING.md`'s epic checklist, plus:

- The SDK decision points are **recorded with their answers**, not silently resolved.
- If the package is republished: it installs from a clean directory and `§9`'s line matches it.
- No public surface says "Golden Beans" — and any deliberate survivor is **named and justified**,
  the way D1 named `@golden-beans/sdk`.
- The footer ledger is gone and the page's honesty claims are still asserted by a spec.
- Production verified **by exercising behaviour**, on `https://goldenfrijoles.com`, never by
  reading `vercel env ls`.
