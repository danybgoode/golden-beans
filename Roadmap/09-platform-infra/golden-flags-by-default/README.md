---
status: shipped   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: golden-flags-by-default
build_order: 31
title: "✅ Epic: Golden Frijoles by default — a spawned project already carries the flag provider"
area: 09-platform-infra
risk: high
type: feature
phase: Shipped
sprints_total: 1
stories_total: 0
---

# ✅ Epic: Golden Frijoles by default — a spawned project already carries the flag provider

> **Area:** 09-platform-infra · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/golden-flags-by-default.md`](../../00-ideas/seeds/golden-flags-by-default.md)
> **Appetite:** M (one wave — architect session + builder fan-out + one review round) · **Bet:** [`bets/wave-2026-09-16-plugin.md`](../../bets/wave-2026-09-16-plugin.md)

> ✅ **Unblocked and shipped.** The [`golden-beans` → `golden-frijoles-cli`](https://github.com/danybgoode/golden-beans/tree/main/Roadmap/02-commercial/golden-frijoles-cli)
> epic closed on 2026-09-18 with all three sprints merged, and `@golden-frijoles/cli@0.1.0` +
> `@golden-frijoles/sdk@0.5.0` are **published on npm** — verified with `npm view`, and the real
> binary was installed and exercised in this epic's smoke walkthrough. Every `gf` command this epic
> prints exists.

> **Renamed.** This was `flag-provider-mandate`, which bundled two different jobs: making the
> distributable template carry Golden (this epic), and finishing Miyagi's own cutover (now
> [`medusa-bonsai` → `golden-flags-single-source`](https://github.com/danybgoode/miyagi-product-management/tree/main/Roadmap/09-platform-infra/flag-provider-mandate)).
> A product you distribute should not carry one consumer's migration.

## Why

Anyone — you, or anyone you distribute this plugin to — spawns a project from `dobby-foundation` and
should get Golden Frijoles already wired, with the agent asking for an account and handing over the
one command that creates it. Today they get the opposite: `groom` Stage 6b tells every consuming
project to extend **`lib/flags.ts` `DEFAULT_FLAGS`** — which is *one consumer's in-house Supabase
table*, hardcoded into the supposedly project-agnostic planning skill. `check-plugin-leaks.mjs`
doesn't catch it because the filename is generic. **The template leaks a consumer's flag architecture
into every future project.**

Every `risk: high` epic in this operating system must answer the kill-switch question, and the answer
names a flag mechanism. Today that mechanism is whatever the project happened to build.

After this ships, a spawned project cannot reach a merged kill-switch story without a real Golden
Frijoles project, and the path to having one is a single command the agent prints.

## The plan model — decided 2026-09-16

Copy Flagsmith's shape. Proven flags business model, and it maps onto what Golden Frijoles already
meters (`lib/quota.ts`, `lib/quota-window.ts`, `lib/rate-limit.ts`).

| Tier | Price | Evaluations / mo | Projects | Seats | Flags · Envs · Segments |
|---|---|---|---|---|---|
| **Free** | $0 | 50,000 | 1 | 1 | **Unlimited** |
| **Start-Up** | $45/mo | 1,000,000 | Unlimited | 3 | Unlimited |
| **Scale-Up** | $300/mo | 5,000,000+ | Unlimited | 5 (+15 @ $50) | Unlimited |

**Unlimited flags and environments on the free tier is what makes this enforceable** — a project
creates every kill-switch it needs without paying. The metered axis is evaluations, and the SDK's
background-snapshot design consumes them at refresh rate, not per request.

> ⚠️ **NOT ENFORCED, DELIBERATELY.** Every account gets everything, unlimited. This table is the
> *written definition* the template references. **Metering and enforcement is a separate, later
> `golden-beans` epic** — building it now would be billing for a user base of one. So the template
> and the CLI must build **no plan awareness, no quota display, no upgrade prompts, no limit errors.**

## Platform-first note

Almost nothing here is new. The SDK, the control plane and the credential model all ship. What is new
is **one preflight check**, a rewritten `groom` Stage 6b, one `check-plugin-leaks` rule, and the
onboarding prompt.

**Data ownership:** flags belong to Golden Frijoles. No parallel flag store, in the template or in any
project spawned from it.

## What already exists (reuse, don't rebuild)

- `@golden-frijoles/sdk` — `createFlagProvider` (OpenFeature-shaped, background snapshot, synchronous
  resolution against a caller-supplied safe default), `createFlagDefinitionSyncClient`,
  `parseFlagSnapshot`, `explainFlagEvaluation`, and the `MAX_FLAG_*` limit constants.
- `golden-beans/apps/web/lib/credential-inventory.ts` — the three-key model (`ingest` / `flag_read` /
  `flag_sync`), already tested.
- `scripts/check-plugin-leaks.mjs` — the guard to extend, with its ALLOW-with-a-written-reason discipline.
- `plugins/ways-of-work/skills/groom/SKILL.md` Stage 6b — the **polarity doctrine is correct and
  already matches the SDK's semantics.** Only the mechanism changes.
- `golden-beans/apps/web/app/install/page.tsx` — the onboarding copy to stay consistent with.
- `template/scripts/permissions-smoke.mjs` — the shape `preflight.mjs` copies: a reviewable file that
  asserts rather than a paragraph that claims.

## Architecture decisions to lock before any builder starts

- **D1 — fail LOUD at init, fail SOFT at runtime.** The preflight fails hard when a project has no
  Golden credentials. A *transient* outage must never break a build, a test run or a deploy — the
  provider resolves synchronously against a caller-supplied default. **Getting this backwards breaks
  every consuming project's CI**, and it is the single most important line in the epic.
- **D2 — Edge-runtime constraints of `createFlagProvider`, verified against the actual package.**
  Stage 6b already warns SDKs are often not Edge-compatible. Write the verified answer into the
  template, or the first middleware-gated feature rediscovers it the hard way.
- **D3 — credential placement.** `gf init` writes **only** `flag_read` to `.env.local`. `flag_sync` is
  an operator/deploy credential and belongs in CI secrets. Never both in one place.
- **D4 — definitions are catalog-as-code, activations are not.** A spawned project syncs its flag
  *definitions* from source control; *activating* a flag is a deliberate human act in Golden.
  **Miyagi's live state is the cautionary tale: definitions synced, activations never created, so 39
  of 42 flags read "Never turned on here" while the runtime served compile defaults through the
  fallback chain.** The template must make the activation step explicit in the kill-switch story, not
  assume sync implies on.

## Scope — stories

| Sprint | Story | Risk | Landed |
|---|---|---|---|
| 1 | 1.1 `groom` Stage 6b rewritten to the Golden Frijoles contract | low | ✅ #24 |
| 1 | 1.2 `scripts/preflight.mjs` — the mandate becomes checkable | high | ✅ #24 |
| 1 | 1.3 `check-plugin-leaks.mjs` gains a flag-mechanism rule | low | ✅ #24 |
| 1 | 1.4 Agent-guided onboarding in the plugin's install path | low | ✅ #24 |
| 1 | 1.5 `template/AGENTS.md` gains the cannot-be-violated rule + the plan table | low | ✅ #24 |
| 1 | 1.6 Template SDK wiring | high | ✅ #24 |


> **The per-story SHAs below are the FEATURE BRANCH's commits.** The PR was squash-merged and the
> branch deleted, so none of them is an ancestor of `main` — the one commit that is, and the only
> citation `epic-dod --check` can verify, is the squash **`5db30c6`** (PR #24). They are kept
> because the commit messages carry each story's reasoning, and they are reachable from the PR.

### What each decision actually turned out to be

- **D1** landed as one status map in `evaluatePreflight` plus one try/catch in the seam, and it is
  proven by test rather than asserted: 794 tests, the template's checks and a running app all pass
  with Golden pointed at a dead host. **There is deliberately no `--strict` flag.**
- **D2** was verified by *executing* the published SDK under Edge-only globals, not by reading its
  docs. The answer has two halves and only ever hearing the first is how a middleware seam gets
  planned that cannot work: **the API surface is Edge-safe; the lifecycle is not.**
  `template/references/flags-runtime.md` §2 carries the answer *and its reproduction*, so it can be
  re-checked when the SDK majors instead of quietly going stale.
- **D3** confirmed against the CLI's source: `gf init` writes three names and deliberately no
  `flag_sync`. The three-key table is in `flags-runtime.md` §3.
- **D4** became a command in the story template — `gf flags get <key>`, whose PRODUCTION row must not
  read `—` — rather than a paragraph. *It shipped as `gf flags ls --env production` first, which does
  not exist; see the DoD line below and the retrospective.*

## Deploy order

No runtime deploy — the plugin and template are the product. Merging to `main` publishes both.
**Nothing merges until the CLI's Sprint 2 has shipped**, because 1.2 and 1.4 print `gf` commands.

## Definition of Done (epic)
- [x] All stories merged to `main` + smoke-tested (gaps stated) — PR #24
- [x] `sprint-1.md` has its smoke walkthrough, **with its 2026-09-19 results recorded per step**
- [x] This README marked ✅; sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Poster (`Roadmap/README.md`) updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [x] **Kill-switch: carve-out.** Config, docs and one check script; git is the rollback.
- [x] **Proven on a real spawn** — *with one stated gap.* A project spawned from `template/` with no
      credentials fails preflight and prints `npx @golden-frijoles/cli init` verbatim (step 1, real).
      The **pass** side was proven against a local stub of the real snapshot route, because
      completing `gf init` needs a CLI token minted from the console by a signed-in human — a
      production credential this build did not take unasked. `gf init` was run for real and refused
      correctly. **Owed to the product owner: one live `gf login` + `gf init`.** See sprint-1 step 2.
- [x] **Every `gf` command the epic prints was RUN against the published CLI, not grepped for.**
      `check-onboarding-parity.mjs --exec` parses each one (`unauthorized` = the parser accepted it;
      `invalid` = it does not exist), and CI installs the CLI to run it. Added because this epic
      shipped `gf flags ls --env production`, which does not exist, welded into five surfaces by a
      guard that could only see that they agreed. See the retrospective.
- [x] **A Golden outage does not break a build or a test run** — proven by a test, not asserted:
      `apps/example-app/flags.test.mjs` runs the whole contract with the SDK **not installed at
      all**, and step 4 of the walkthrough ran 794 tests, every template check and a live server
      against a dead host. All green.
- [x] Branch deleted; frontmatter `status: shipped` (run `node scripts/build-order.mjs`)
- [x] **Consuming projects carry the new rail** — `golden-beans` and `medusa-bonsai` receive
      `scripts/preflight.mjs` + `scripts/lib/golden-onboarding.mjs`, byte-identical to the
      template's, so `check-skill-scripts --repo-root` stays 10/10 there.
