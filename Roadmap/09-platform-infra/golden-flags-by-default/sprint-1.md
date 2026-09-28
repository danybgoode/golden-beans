---
epic: golden-flags-by-default
sprint: 1
title: The mandate, the preflight and the agent-guided onboarding
risk: low
phase: Shipped
stories_total: 0
stories: []
---
# Golden Frijoles by default — Sprint 1: The mandate, the preflight and the agent-guided onboarding

**Status:** ✅ Shipped — PR #24, `5db30c6` (2026-09-19)

**Epic:** [Golden Frijoles by default](README.md) · **Risk: MIXED (LOW + HIGH)** — 1.2 and 1.6 are HIGH (they define how every future project reads flags); the rest LOW

✅ **Unblocked 2026-09-18.** The CLI epic shipped all three sprints and closed
(`golden-beans` #149/#150/#151, close-out #153), and `@golden-frijoles/cli@0.1.0` +
`@golden-frijoles/sdk@0.5.0` are **published on npm** — verified with `npm view` before a line was
written here. Every `gf` command named below exists in the published binary.

## Build contract (locked by the architect before the builder started)

Each of these was verified **against live code and live data**, not against the scope doc.

- **D1 (fail LOUD at init, fail SOFT at runtime) lands in `evaluatePreflight`'s status map and
  nowhere else.** Absent configuration and a rejected credential (401) fail hard; an unreachable
  deployment — network error, timeout, a 404 from a deployment with flag serving switched off — is a
  `warn` and exits 0. **There is deliberately no `--strict`**: a flag that turned the warning into a
  failure would be in someone's CI file within the week and the promise would be gone with nobody
  deciding to give it up.
- **D2's answer, verified by EXECUTION, not by reading.** The published `@golden-frijoles/sdk@0.5.0`
  `dist/` was run inside a `node:vm` context carrying only Edge globals (no `process`, no `Buffer`,
  no `require`, no `__dirname`) and completed `initialize()` → `resolveBooleanEvaluation()` →
  `shutdown()`, resolving a served value and falling back for an unknown key. Zero Node builtins in
  the bundle; only `fetch` / `AbortController` / timers, with `unref()` behind a `typeof` guard. So
  the **API surface is Edge-safe and the LIFECYCLE is not** — the full answer, with its
  reproduction, is `template/references/flags-runtime.md` §2.
- **D3 confirmed against `packages/cli/src/commands/init.ts`:** `gf init` writes exactly
  `GOLDEN_FRIJOLES_URL`, `GOLDEN_FRIJOLES_FLAG_READ_KEY`, `GOLDEN_FRIJOLES_ENVIRONMENT` — and
  deliberately no `flag_sync` and no ingest key. Those three names are the whole env-var contract.
- **D4's cautionary tale is not restated, it is a COMMAND.** The story template carries the
  activation check as a verb, because `gf flags sync` pushes definitions and activates nothing.
  ⚠️ *The command locked here was `gf flags ls --env production` — **which does not exist.** It
  shipped that way, was caught in review, and is now `gf flags get <key>` (PRODUCTION must not read
  `—`). The lock was right about the shape and wrong about the fact; see step 5 and* Review round.
- **The flag mechanism the epic replaces was verified present before it was removed**, and the
  sweep found three more incidental matches that no ALLOW entry should ever have covered.

### Deviations from the scope doc, named rather than absorbed

1. **The smoke walkthrough's step 4 said `GROWTH_ENGINE_URL`.** That name predates the CLI epic's D6
   lock; the variable is `GOLDEN_FRIJOLES_URL`. The walkthrough below uses the locked name.
2. **Story 1.4's "install path" is not a `/install` command** — this plugin ships no commands. The
   install path here is the four shipped surfaces that tell someone how to wire the provider, and
   the detector is `scripts/preflight.mjs`. `scripts/check-onboarding-parity.mjs` welds them.
3. **`flagsmith` is not repeated in the new leak rule.** The decommissioned-tooling rule already
   fails on it; listing it twice would report one line as two leaks. A test asserts it still fails.
4. **`preflight.mjs` is not added to the template's CI gate.** `.env.local` is gitignored, so a CI
   checkout has no credential and the check would fail for a reason that is not a defect. It reads
   the process environment as a fallback, so a project that wants it in CI injects the three names
   from secrets. Written down in the script header and in `guards.yml`.

## Stories

### ✅ Story 1.1 — `groom` Stage 6b rewritten to the Golden Frijoles contract
**As a** groom session planning a HIGH-risk epic, **I want** the kill-switch story to name a real,
project-agnostic flag mechanism, **so that** the planning skill stops hardcoding one consumer's
architecture into every future project.
**Acceptance:** Stage 6b names `gf flags create <key> --kill-switch --all-envs` and the SDK's
`createFlagProvider` in place of *"extending `lib/flags.ts` `DEFAULT_FLAGS`"*. **The polarity doctrine
is unchanged** — it is correct and already matches the SDK's semantics. Per **D4**, the story template
makes **activation an explicit step**, distinct from syncing the definition.
**Risk:** low
**Landed:** PR #24 (two commits on the branch) — D4 was only half-applied at first. The kill-switch *reference*
made activation explicit while the three **scaffolder templates** every future epic is rendered from
still said the flag must *"exist in this project's own flag provider"* — and existing is exactly what a
synced-but-never-activated definition does. The generated epic DoD, the generated kickoff's *done means
shipped*, and the scope-seed block now all close on `gf flags get <key>` — originally on
`gf flags ls --env production`, corrected in the same round that found it does not exist.

### ✅ Story 1.2 — `scripts/preflight.mjs` — the mandate becomes checkable
**As the** maintainer, **I want** the mandate enforced by a check rather than a sentence,
**so that** "always use Golden Frijoles" is a property of the system instead of a hope.
**Acceptance:** verifies a project is linked, a `flag_read` key resolves, and the CLI is installed and
current. On failure it prints **the exact install command**. Per **D1** it **fails hard on init-time
absence and SOFT on runtime unreachability**. Declared in the skill's `requires_scripts` so
`check-skill-scripts.mjs` keeps it honest. Follows `permissions-smoke.mjs`'s shape — a reviewable file
that asserts, not a paragraph that claims.
**Risk:** high — **D1 backwards is how this story breaks every consuming project's CI.**

### ✅ Story 1.3 — `check-plugin-leaks.mjs` gains a flag-mechanism rule
**As the** maintainer, **I want** the leak that caused this epic to be catchable,
**so that** a consumer's flag architecture can't quietly re-enter the template.
**Acceptance:** the guard fails when a template or plugin file names a project-specific flag mechanism
(a bare `lib/flags.ts`, `DEFAULT_FLAGS`, `platform_flags`, `flagsmith`). Deliberate matches go in
`ALLOW` **with a written reason**, and a stale entry fails — the discipline the guard already applies.
**Risk:** low

### ✅ Story 1.4 — Agent-guided onboarding
**As a** developer installing the plugin, **I want** the agent to ask for a Golden Frijoles project
and hand me the command, **so that** onboarding is one line rather than a docs hunt.
**Acceptance:** the install path has the agent detect the absence of a linked project and print
**one command** — `npx @golden-frijoles/cli init`. The text matches what `/install` and `gf init`
themselves print; **the three are one surface and must say the same thing.**
**Risk:** low

### ✅ Story 1.5 — `template/AGENTS.md` gains the rule and the plan table
**As a** builder agent in any spawned project, **I want** the flag rule stated where the
cannot-be-violated rules live, **so that** it carries the same weight as the other invariants.
**Acceptance:** a numbered rule — *"Feature flags are Golden Frijoles. Never build a parallel flag
store."* The plan table lands in `template/AGENTS.md` and the plugin README **with the "not enforced
yet" note intact**, so nobody builds against limits that don't exist.
**Risk:** low

### ✅ Story 1.6 — Template SDK wiring
**As a** newly spawned project, **I want** the flag client already wired,
**so that** the first kill-switch story is a flag creation rather than an integration.
**Acceptance:** `createFlagProvider` configured with the env var names decided in the CLI epic's D6,
the server-only warning prominent (`flagReadKey` must never reach a browser bundle), `.env.local`
gitignored, and **D2's verified Edge-runtime answer written down**. Per **D3**, only `flag_read` is
written locally; `flag_sync` is documented as a CI secret.
**Risk:** high

## Sprint QA
- **api spec(s):** unit tests for `preflight.mjs` across all five states (no project · no key · CLI
  absent · CLI outdated · all good) **plus the fail-soft case**: API unreachable at runtime must not
  fail a build. A `check-plugin-leaks` fixture asserts the new rule fires and that a stale `ALLOW`
  entry fails.
- **browser smoke owed:** no.
- **deterministic gate:** `node --test` + `check-plugin-leaks.mjs` + `check-skill-scripts.mjs` green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: local · a freshly spawned project from `template/`

**Run 2026-09-19** against a real spawn (`cp -R template/. <tmp>/`, `git init`, `npm install
@golden-frijoles/cli@0.1.0 @golden-frijoles/sdk@0.5.0` — the published packages, not the source
tree). Result per step below. **Step 2 is the one with a stated gap; everything else passed as
written.**

1. Spawn a new project from the template and run `node scripts/preflight.mjs` with no credentials.
   → It **fails**, and the message names `npx @golden-frijoles/cli init` verbatim.
   **✅ PASS.** Exit 1, two ❌ (`cli`, `project`), and the block printed:
   ```
   npx @golden-frijoles/cli login
   npx @golden-frijoles/cli init
   ```
   After `npm install @golden-frijoles/cli`, the same run reports `✅ cli Found at
   node_modules/.bin/gf` and `✅ cli-version 0.1.0 (>= 0.1.0)` — the real published binary, version-
   checked — and still fails on `project`, which is correct.

2. Run that command, complete `gf init`, then re-run preflight.
   → It passes.
   **⚠️ PARTIAL, and the gap is stated rather than glossed.** `gf init` was run for real and refused
   correctly: `Not signed in. Run \`gf login\`, or set GOLDEN_FRIJOLES_TOKEN.` (exit 2). Completing it
   needs a **Golden Frijoles CLI token minted from the console by a signed-in human** — a production
   credential, which is not something this build takes unasked.
   So the PASS path was proven against a **local stub of the real snapshot route** (same Bearer
   contract, same `contractVersion: 1` body, 401 on a bad key) with the `.env.local` `gf init`
   writes, byte-for-byte in its format. Result: all five checks ✅, `Resolved snapshot v12 for
   development (1 flags)`, exit 0.
   **What remains owed to the product owner: one `gf login` + `gf init` against the live
   goldenfrijoles.com account.** Everything it exercises on this side — the file format, the
   variable names, the snapshot route, the Bearer credential, the environment match — is what the
   stub reproduced. Flag serving IS enabled on production (a bogus key returns 401, not 404), so the
   live run should differ only in minting a real key.

3. Create a flag with `gf flags create demo.hello_enabled --kill-switch --all-envs`, then start the app.
   → The SDK resolves it. Value `true`, enabled everywhere.
   **✅ PASS** (against the stub's `demo.hello_enabled`, a kill-switch definition serving `true`).
   The **real published `@golden-frijoles/sdk@0.5.0`** resolved it through
   `apps/example-app/flags.mjs`:
   ```
   GET /api/flags → {"demo.hello_enabled":true,"provider":{"ready":true,"state":"READY",
                     "snapshotVersion":12,"environment":"development"}}
   GET /         → <p data-testid="demo-flag">demo.hello_enabled: on</p>
   ```

4. Point `GOLDEN_FRIJOLES_URL` at a dead host and run the test suite and the template's checks.
   → **All still pass.** Evaluation falls back to the caller-supplied default. *(This is D1. If
   anything fails here, the story is not done.)*
   **✅ PASS — the load-bearing step.** With `GOLDEN_FRIJOLES_URL=http://127.0.0.1:1`:
   - `node --test scripts/*.test.mjs scripts/lib/*.test.mjs apps/example-app/flags.test.mjs` →
     **794/794 pass**.
   - `build-order --check`, `render-ways-of-working --check`, `permissions-smoke` → all green.
   - The app **boots and serves**: `/api/health` → `{"ok":true}`, `/api/flags` →
     `{"demo.hello_enabled":false,…}` — the call-site default — with one log line saying why.
   - `node scripts/preflight.mjs` → `⚠️ snapshot … NOT a failure`, **exit 0**.
   *(This step found the one real defect of the epic: the health payload served `ready: true` beside
   `state: 'NOT_READY'`. Fixed on the branch with a spec that goes red on the old behaviour.)*

5. Start a groom session on a HIGH-risk ask.
   → The kill-switch story names a **Golden Frijoles** flag, the right polarity, one resolver seam,
   the CLI command to create it in every env, **and activation as its own step**. It does not
   mention `DEFAULT_FLAGS`.
   **❌ FAILED on the first run, and the correction is the most useful thing in this document.**

   What was originally recorded here as a ✅ was a check that the required strings were **present**
   in `references/kill-switch.md`. They were. One of them was
   `gf flags ls --env production`, **a command that does not exist** — `gf flags ls` accepts only
   `--project`, so it exits `1` with `Unknown flag for \`gf flags ls\`: --env` *before* it ever
   reaches auth. The annotation beside it (*"it must not read 'never turned on'"*) quoted the **web
   console's** vocabulary; the CLI's `describeServing` prints `—`. A reader following it literally
   would have run a command that cannot run, looking for a string the tool never prints.

   Caught by the fresh reviewer, not by this step, and it had already been welded into five surfaces
   by `check-onboarding-parity.mjs` — a guard enforcing that the wrong command stayed everywhere.
   *Presence in every surface is not the same as the command existing.*

   **✅ PASSES NOW**, and the check is no longer a grep. The command is
   `gf flags get <domain>.<feature>_enabled` (one row per environment; **PRODUCTION must not read
   `—`**), and `check-onboarding-parity.mjs --exec` now RUNS each advertised command against the
   real published CLI:
   ```
   ✅ gf flags create <domain>.<feature>_enabled --kill-switch --all-envs  →  unauthorized
   ✅ gf flags get <domain>.<feature>_enabled                              →  unauthorized
   ✅ gf flags kill <domain>.<feature>_enabled --env production            →  unauthorized
   ```
   `unauthorized` (exit 2) is the pass: the parser accepted the command and the dispatcher then
   asked for a credential. `invalid` (exit 1) is the failure, and re-running `--exec` against the
   old string reproduces it exactly. CI installs the CLI and runs this, skipping — never failing —
   if the install cannot happen.

6. Add a `lib/flags.ts` with a `DEFAULT_FLAGS` export to the template and run `node scripts/check-plugin-leaks.mjs`.
   → It **fails**. *(Then revert.)*
   **✅ PASS.** Exit 1, `project-specific flag mechanism`, citing `template/lib/flags.ts:1`. Reverted;
   the guard reads clean again.

7. Open `template/AGENTS.md`.
   → The flag rule sits among the cannot-be-violated rules; the plan table carries the "not enforced
   yet" note.
   **✅ PASS.** Rule **1**, above the project's own fill-in slot, with the full tier table and the
   `NOT ENFORCED, DELIBERATELY` callout intact.

8. Compare the onboarding text the agent prints, `/install`'s CLI block, and `gf init`'s next-step line.
   → All three identical.
   **✅ PASS**, and now checked rather than compared by eye. `scripts/check-onboarding-parity.mjs`
   asserts five shipped surfaces carry the canonical strings, and it **fired on its first run** over
   a credential name one file described but never spelled. Cross-repo, by hand:
   | | this repo | `golden-beans` |
   |---|---|---|
   | init | `npx @golden-frijoles/cli init` | `CLI_NPX_INIT` = same |
   | login | `npx @golden-frijoles/cli login` | `CLI_NPX_LOGIN` = same |
   | global | `npm i -g @golden-frijoles/cli` | `CLI_GLOBAL_INSTALL` = same |
   | env names | `GOLDEN_FRIJOLES_{URL,FLAG_READ_KEY,ENVIRONMENT}` | `ENV_KEYS` in `init.ts` = same |

## Review round — 2026-09-19

One fresh reviewer (context independence). The external cross-family pass is **DARK in this repo**
and was said out loud on the PR: `dobby-foundation/scripts/` carries no `review-route.mjs`,
`cross-review.mjs` or `review-config.json` — `Roadmap/fill-ins.yml` states the families are routed
*"in a consuming project's checkout"*. So the layer WAYS-OF-WORKING describes for a repo whose
`reviewScope` is `every-pr` cannot run here at all, and never could. **That is worth its own chore
epic** — this is the repo that changes the process every project imports. Not fixed by this PR.

The reviewer confirmed D1 (no path where an outage fails a build, a test, a deploy or a boot),
credential handling, D3, the leak-sweep population, and re-ran the D2 Edge reproduction from the
doc's own instructions. It found five things. All five are fixed:

| | Finding | Fix |
|---|---|---|
| **B1** | `gf flags ls --env production` does not exist — and the parity guard was about to hold it in place across five files | Corrected to `gf flags get <key>`; `check-onboarding-parity --exec` now **runs** each advertised command; CI does too |
| **S1** | "a spawned project already carries the flag provider" — it carried the seam, not the package. Nothing anywhere said to install `@golden-frijoles/sdk`, so the reachable end state was **five green checks and every flag defaulting forever** | The SDK is a declared dependency of the example app, the spawn step installs it, and preflight gained an `sdk` check (⚠️ not ❌ — an uninstalled fresh clone is not a misconfiguration) |
| **S2** | `flags.mjs` invented `environment: 'development'` and handed it to the SDK as a **hard assertion**. On the CI-secrets path preflight's own header endorses, a valid production key was rejected as `PARSE_ERROR` and served defaults permanently, silently | The field is **omitted** when unset, letting the first snapshot establish it; preflight warns that nothing asserts which environment this is. **Reproduced both ways** — see below |
| **S3** | `e2e/flags.spec.ts` hard-asserted `false`, so a project that followed this very walkthrough (`--kill-switch` = born serving `true`) turned its own shipped gate red — green only while flags were broken | Asserts the **shape**: a resolved boolean either way, the provider named, no credential material |
| **N1** | any 200 with parseable JSON could land as `wrong-environment` → exit 1: the one shape of weather that could still fail a build | `contractVersion === 1` is required before the body is believed; anything else is `unreachable` |

The reviewer also verified two things the build had not: that `gf flags get`'s PRODUCTION row is
**always present** (`cli-flag-view.ts` maps over `FLAG_ENVIRONMENTS`, not over stored rows), so
*"PRODUCTION must not read `—`"* cannot be defeated by a missing row; and that the hard-coded
`contractVersion === 1` matches both `FLAG_CONTRACT_VERSION` in the SDK and what the live route
emits, so the guard cannot silently disable the probe.

**S2, reproduced side by side** — a valid production key and production snapshot, with
`GOLDEN_FRIJOLES_ENVIRONMENT` unset:

```
AFTER  initialize: {"ready":true,...,"snapshotVersion":12}   demo.hello_enabled → true    environment: production
BEFORE initialize: {"ready":false,"reason":"... (PARSE_ERROR) ..."}   demo.hello_enabled → false   environment: undefined
```

Two nits accepted as-is: the consumer copy-ins land in this same wave (both merged **before** this
PR — see below), and the plan table now says in two places that it is the flag-plan model and **not
the public pricing page**, which prices differently.

### Round two — the fix to B1 had a defect of its own

The same reviewer re-verified all five by execution and confirmed them fixed. It then found one
thing that did not exist before this round, and it is the more serious of the two:

| | Finding | Fix |
|---|---|---|
| **B2** | `--exec` spawned the CLI **inheriting `process.env` and `$HOME`**, and two of the three advertised commands are WRITE verbs. On any machine that had run `gf login` — precisely the machine this epic still owes a live `gf init` on — a **documentation parity check would have created and activated a flag in the real production catalog, then killed it** | The child gets a scrubbed environment (blank token, `XDG_CONFIG_HOME` **and** `HOME` at an empty temp dir), **and `unauthorized` is now REQUIRED rather than merely accepted** — if the isolation ever fails the probe returns `ok`, which now FAILS loudly instead of passing as "well, it parsed" |
| **SF1** | the `--exec` skip printed to stdout and exited 0, so a skipped run read green in the checks list — the same ambiguous-green shape the mode exists to end | the skip branch emits `::warning::` itself, so it is annotated wherever the install succeeded but `gf` was not on `PATH` |
| **SF2** | four documents still asserted in the present tense that the shipped artifacts carry the command that does not exist | reconciled; every remaining mention is historical and marked as such |

**The B2 isolation, proven with a negative control** — `gf doctor` reports the credential *source*
without needing a valid token:

```
UNSCRUBBED   credentials-file → ok   "Readable at <tmp>/golden-frijoles/credentials.json."
             credential       → ok   "Found, from the saved credentials file."
SCRUBBED     credentials-file → warn "No file at <empty>/golden-frijoles/credentials.json."
             credential       → fail "No credential."
```

And `--exec` was run three ways — clean, with `GOLDEN_FRIJOLES_TOKEN` set, and with a credentials
file on disk. All three: `unauthorized` on every command, nothing written.

**Why this one is worth remembering.** B1's fix was *"stop trusting a string, execute the command"* —
correct, and it immediately created a check that executes **write verbs** against whatever
credential happens to be lying around. Making a check real makes it capable of doing what the thing
it checks can do. The fix is not "be careful": it is to make the harmless state a **constructed
guarantee** (a scrubbed environment) and then **assert** it (`unauthorized` required), so that a
future failure of the guarantee is loud instead of silent.

If any step fails, note the step number + what you saw — that's the bug report.

**Step 4 is the load-bearing one.** A flag provider that can break your CI when it hiccups is a
dependency nobody should accept, mandate or not.
