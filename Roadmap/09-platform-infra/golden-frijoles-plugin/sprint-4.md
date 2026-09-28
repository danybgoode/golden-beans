---
epic: golden-frijoles-plugin
sprint: 4
title: "One config file"
risk: high
phase: Shipped
stories_total: 3
stories:
  - id: S4.1
    title: "One config file and one loader"
    as_a: "a user"
    i_want: "one `golden-frijoles.config.json`"
    so_that: "I can read my whole setup in one place"
    risk: high
    status: done
  - id: S4.2
    title: "Every rail reads through the loader"
    as_a: "a rail"
    i_want: "to read my settings through one seam"
    so_that: "there's one place config is interpreted"
    risk: high
    status: done
  - id: S4.3
    title: "Ask once, just in time"
    as_a: "a skill"
    i_want: "to ask for an unset setting the first time I need it, then save it"
    so_that: "the user is never interviewed about things they don't use"
    risk: low
    status: done
---
# One plugin, one install — Golden Frijoles ships as a public plugin whose skills run in anyone's repo — Sprint 4: One config file

**Status:** ✅ shipped 2026-09-24. golden-frijoles/skills#49 (`42334ad`, release `v0.4.0`, kit 0.4.0), then the copy-in review fixes #51 (`d101dff`, 0.5.1), #53 (`ad941ac`, 0.5.2) and #54 (`6438be1`); copy-ins danybgoode/golden-beans#165 (`f3e7d42`, Vercel production ✅) and danybgoode/miyagi-product-management#196 (`7a7c709`) · **Wave:** 2

**Wave 2, re-bet at the boundary.** One `golden-frijoles.config.json` a person can read, one loader every rail reads through, and a just-in-time registry so nothing is asked before it's needed. The seven legacy files keep working.

## Build contract (locked by the architect before the builder started)

Cites the epic README's D2, D3, D4, D9, D10, D11, D12 and deviations X15, X16, X19, X20. **Builder:** the orchestrator (Opus).
**Branch:** `feat/golden-frijoles-plugin-s4` off `main`. One PR here, which releases kit **0.4.0**. Then copy-in PRs to
golden-beans and medusa-bonsai in the same wave. The copy-in rule is the wave-1 one: an unmodified copy of *some*
template version is replaced; a fork is untouched.

**S4.1: `template/scripts/lib/config.mjs` (D9) + X20.**
- **Exports:** `CONFIG_FILENAME` (`golden-frijoles.config.json`); `SECTIONS` (the 12 in the story); `LEGACY` (the
  one table of section → legacy source):
  - `jev` ← `jev.config.json`
  - `reporting` ← `reporting.config.json`, honouring `REPORTING_CONFIG` as today
  - `smoke` ← `live-smoke.config.json`, plus `smoke.triage` ← `smoke-triage.config.json` and `smoke.perf` ←
    `perf-probe.config.json`
  - `review` ← `scripts/review-config.json`, through `projectAsset`
  - `ways.fillIns` ← `'Roadmap/fill-ins.yml'` (X15)
- **Functions:** `loadConfig()`, returning `{ sections, sources, duplicates }`; `section(name)`, returning the merged raw
  object or `null`; `getKey(path)`; `setKey(path, value)` (creates the file; 2-space JSON plus a trailing newline;
  atomic via temp + rename); `migrate({ dryRun })` (writes the new file, **never touches a legacy file**);
  `ConfigError`.
- **Precedence** is per top-level key within a section. Duplicates are reported, never thrown. A malformed file
  throws `ConfigError` naming it; an absent one falls back silently.
- **Secret guard:** `setKey` / `migrate` refuse a value that looks like a credential (known token prefixes, or a key
  named `*token|*secret|*password|*apiKey` whose value isn't an `UPPER_SNAKE` env var name), with a `ConfigError`
  saying "put the env var NAME here".
- **Validation stays in each rail's parser.** The core never checks a section's shape.
- `lib/config.d.mts`: hand-written types for the exports (D10).
- `kit/package.json`: `"exports": { ".": "./bin.mjs", "./config": "./dist/lib/config.mjs", "./package.json":
  "./package.json" }`, and `types` for `./config`.
- **`template/scripts/config.mjs` = `gf-kit config`:** `list | get <key> | set <key> <value> | migrate [--dry-run]`,
  with `--json`. A value is parsed as JSON when it is valid JSON, and is a string otherwise. The umbrella skill's
  `requires_scripts` declares `config.mjs`, `lib/config.mjs`, `lib/config-registry.mjs` and `lib/config.d.mts`, so
  the kit carries them (one list).
- **X20:**
  - `projectAsset()` throws `ConfigError` when the project file's realpath leaves the realpath of the project. A
    symlink out is loud: configuration, not weather.
  - `loadPersonaAndTask(scriptsDir)` uses `project = scriptsDir === kitRoot() ? projectRoot() : dirname(scriptsDir)`.
- **Tests:** every precedence case; malformed vs absent; duplicates; the secret guard; `migrate --dry-run` writes
  nothing; `set` round-trips; X20 containment (a symlinked persona → `ConfigError`) and the explicit `scriptsDir`.
  Mutation-check each new spec.

**S4.2: every template rail reads through the loader (X16 scopes it to the template/kit).**
- Converted: `lib/jev.mjs` `loadJevConfig`, `lib/reporting-config.mjs` `loadReportingConfig`, `live-smoke.mjs`
  `loadConfig` (the `smoke` section minus `triage`/`perf`), `smoke-triage-scope.mjs` `loadPolicy`, `perf-probe.mjs`
  `loadProbeConfig`, `review-route.mjs` + `cross-review.mjs` (template copies), and `render-ways-of-working.mjs`
  (the fill-ins path).
- Each hands `section(...)` to **its own existing parser**, and keeps its absent-file behaviour (for example
  `jev` → `DEFAULT_CONFIG`) and its error class.
- **The guard** is `scripts/check-config-reads.mjs` (zero deps). It fails when a non-test file under
  `template/scripts/` does `JSON.parse(readFileSync(` on a path naming a config file, except inside
  `lib/config.mjs`. Fixtures must fire on a direct read and must not fire on `lib/config.mjs` or on non-config JSON
  (fixtures, benchmarks). Wire it into CI.
- **Legacy-only repos behave identically.** Before merge, golden-beans' and medusa's existing tests for every
  converted rail they carry as an unmodified copy run against the new code (LEARNINGS: *run the consumer's old
  tests against the new code*).

**S4.3: the registry + the ask protocol (D11, X19).**
- `lib/config-registry.mjs` holds the audit §4.3 table as data. Each entry is `{ key, section, askWhen, default,
  question, secret?, store? }`:
  - `project.mode` (setup, required), `project.startPoint`
  - `account` (`store: 'env'`, written by `gf init`)
  - `board.sink` and `verify.depth`, both `askWhen: 'never-yet'` (X18)
  - `roadmap.areas`, `ways.fillIns`
  - `review.families`, `review.reviewScope` (default `security-paths-only` for new users),
    `review.securityPaths`
  - `jev.egress` (default `null`)
  - `smoke.envs`, `reporting.destination`, `deploy.vercelProject`, `ship.killSwitchPolicy`, `spend.telemetry`
- `lib/config.mjs` gains `needSetting(key, { blocking })`, which prints
  `GF-NEEDS-SETTING {"key","question","default"}` to stderr. Blocking exits **7**; non-blocking returns the
  default and continues.
- The generated run rule (render-skill-adverts) gains one sentence: on `GF-NEEDS-SETTING`, ask that question once,
  `gf-kit config set` the answer, tell the user they can change it later with `gf config set <key>`, and re-run if
  the script exited 7.
- **Tests:** an unset key emits once and a set key never emits; blocking exits 7 and non-blocking continues.

**Release:** bump to **0.4.0** (plugin, kit, CHANGELOG). Merging publishes. Then the copy-ins. Consumer forks are listed,
untouched, in each consumer PR.

**Stop and escalate** on any trigger in WAYS-OF-WORKING → *Escalate, don't guess*.

## Stories

### Story 4.1 — One config file and one loader
**As** a user, **I want** one `golden-frijoles.config.json`, **so that** I can read my whole setup in one place.
**Acceptance:** A schema (sections `project`, `board`, `verify`, `roadmap`, `ways`, `review`, `jev`, `smoke`, `reporting`, `deploy`, `ship`, `spend`) and `lib/config.mjs` in the kit. The **legacy files are a fallback**: `jev.config.json`, `reporting.config.json`, `live-smoke.config.json`, `smoke-triage.config.json`, `perf-probe.config.json`, `scripts/review-config.json`, `Roadmap/fill-ins.yml`. Precedence (D9): **the new file wins per key**, legacy files fill gaps, and a key defined in both is reported. `gf-kit config migrate` folds legacy into the new file and leaves the old files untouched. Secrets never go in it; only env var *names* do.
**QA:** unit tests on every precedence case, including a malformed file = *configuration* failure (fails) vs an absent file (falls back)
**Risk:** high

### Story 4.2 — Every rail reads through the loader
**As** a rail, **I want** to read my settings through one seam, **so that** there's one place config is interpreted.
**Acceptance:** Review routing, Jev, reporting, live-smoke, smoke-triage, perf-probe and the WAYS-OF-WORKING renderer read through `lib/config.mjs`, with no direct `JSON.parse(readFileSync(...config.json))` left (a guard greps for it). **A repo with only legacy files behaves byte-identically**: golden-beans' existing tests for those rails run green against the new code before merge.
**QA:** the grep guard (fires + doesn't fire fixtures); golden-beans' old tests against the new code
**Risk:** high

### Story 4.3 — Ask once, just in time
**As** a skill, **I want** to ask for an unset setting the first time I need it, then save it, **so that** the user is never interviewed about things they don't use.
**Acceptance:** A registry: each setting declares `{ key, askWhen, default, section, secret? }`. A skill that hits an unset key asks one question, writes the answer through the loader, and says *"change this later with `gf config set <key>`"*. The registry is the audit §4.3 table in code, and doctor (S5.3) reads it too.
**QA:** unit test: an unset key asks once; a set key never asks
**Risk:** low

## Sprint QA
- **specs:** named per story above. This repo's gate is `node --test` + the CI checks in `.github/workflows/ci.yml`; golden-beans stories use its own gate (`tsc` + build + Playwright `api`).
- **owed to Daniel:** nothing
- **deterministic gate:** every CI check green before merge; high-risk stories → Daniel merges

## Sprint 4 — Smoke walkthrough (do these in order)
Env: production (npm). Run after the S4 PR merges and `@golden-frijoles/kit@0.4.0` is on npm.

1. In an empty folder: `git init demo && cd demo && npx -y @golden-frijoles/kit@0.4.0 config migrate`
   → `Nothing to migrate: no legacy settings the new file does not already have.` and `ls` shows no new file.
2. Same folder: `npx -y @golden-frijoles/kit@0.4.0 config set review.reviewScope every-pr`, then `cat golden-frijoles.config.json`
   → `{ "review": { "reviewScope": "every-pr" } }`: one readable file.
3. Same folder: `npx -y @golden-frijoles/kit@0.4.0 config set reporting.botToken xoxb-123`
   → Refused (exit 2) with *"looks like a secret … put the env var NAME here"*. The file is unchanged.
4. In `~/dobby/golden-beans`: `npx -y @golden-frijoles/kit@0.4.0 config migrate --dry-run`
   → It prints the `golden-frijoles.config.json` it *would* write from golden-beans' existing files, lists any secret-looking
     key it skipped, and writes nothing (`git status` clean).
5. In golden-beans, open any PR and let the review routing run
   → It routes exactly as before (same reviewers, same security lens). Legacy config still works, by D9's fallback.

If any step fails, note the step number + what you saw — that's the bug report.
