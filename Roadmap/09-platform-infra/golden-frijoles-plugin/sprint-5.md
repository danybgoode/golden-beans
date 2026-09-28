---
epic: golden-frijoles-plugin
sprint: 5
title: "Setup and adjust"
risk: high
phase: Verifying
stories_total: 5
stories:
  - id: S5.1
    title: "Five skippable setup questions"
    as_a: "a stranger"
    i_want: "to answer at most five questions, each with a default"
    so_that: "I'm configured in about two minutes"
    risk: low
    status: done
  - id: S5.2
    title: "`gf setup` and `gf config`"
    as_a: "a terminal user"
    i_want: "`gf setup` and `gf config list|get|set`"
    so_that: "I can configure without asking an agent"
    risk: high
    status: done
  - id: S5.3
    title: "Doctor names every module's state"
    as_a: "a user"
    i_want: "`gf doctor` to show each module as configured, not configured or could not look"
    so_that: "I know exactly what's missing and how to fix it"
    risk: low
    status: done
  - id: S5.4
    title: "Jev egress is the user's explicit choice"
    as_a: "a stranger"
    i_want: "to be asked before my diffs are sent to a third party"
    so_that: "nothing leaves my machine by default"
    risk: high
    status: done
  - id: S5.5
    title: "Stranger walkthrough #2: set up, then adjust"
    as_a: "a stranger"
    i_want: "to set up and later change one setting"
    so_that: "configuration is something I can live with, not a one-shot"
    risk: low
    status: planned
---
# One plugin, one install — Golden Frijoles ships as a public plugin whose skills run in anyone's repo — Sprint 5: Setup and adjust

**Status:** 🟦 verifying: S5.1–S5.4 are merged and deployed (golden-frijoles/skills#50 `00f5ce4`, release `v0.5.0`; danybgoode/golden-beans#164 `2e2ae50` and #166 `d37ce20`; CLI **0.2.1** hand-published by Daniel, on kit 0.5.2). S5.5, the walkthrough on a clean machine, is owed to Daniel, so the sprint isn't closed · **Wave:** 2

The five-question setup in the agent, `gf setup` / `gf config` in the terminal through the **same core**, one doctor line per module, and Jev egress as a stranger's explicit choice.

## Build contract (locked by the architect before the builder started)

Cites the epic README's D9–D14 and deviations X17, X18. **Builder:** a Sonnet builder, per the routing. **Branches:**
`feat/golden-frijoles-plugin-s5` here (stacked on `-s4`), which releases kit **0.5.0**; `feat/golden-frijoles-plugin-s5`
in golden-beans (the CLI).

**S5.1: setup in the umbrella skill (X18).** The umbrella skill's setup asks **Q1 mode** (required: existing repo /
new project / planning only), **Q2 start point** (idea / know what to build / already building) and **Q4 account**
(later / now). Every question says its default, and only Q1 is required.
- Answers are written with `gf-kit config set` through the kit core. Q4 "now" is `gf login` + `gf init` (it
  writes `.env.local`, never the config file).
- Next steps:
  - Q1 "existing repo" runs `gf-kit init`. "Planning only" writes nothing but the config file.
  - The first skill offered follows Q2: idea and "know what to build" → `groom` (the Think chain is a displaced
    seed; say so); "already building" → `live-smoke`.
- The skill stays ≤ its budget. **QA:** a conversation-level check in the S5.5 walkthrough.

**S5.2: `gf setup` / `gf config` in `packages/cli` (D10, D14).**
- `gf config list | get <key> | set <key> <value>` and `gf setup` (the same three questions, arrow-key choices on a
  TTY, `--yes` for defaults; a non-TTY without `--yes` is a usage error).
- Both load the core with `await import('@golden-frijoles/kit/config')` (the CLI is CommonJS). Add
  `@golden-frijoles/kit` as a dependency at the **exact** released version.
- `ConfigError` → `EXIT.USAGE`, and success → `EXIT.OK`. `--json` works everywhere. Add golden help files for the
  new commands, plus unit tests.
- It never writes a secret: `set` goes through the core's secret guard.
- CLI version bump to **0.2.0**. **Publishing it is owed (D14)**: ask the product owner once the PR is green.
- `check-onboarding-parity --exec`: add a local-command probe (`gf config list --json` in a temp project with a
  scrubbed HOME → exit 0 + parseable JSON). It **skips** when the resolved `gf` is < 0.2.0, which is true until the
  release.

**S5.3: doctor module lines (D13).**
- One line per module (Plan, Build, Ship, Measure, Spend, Operate), derived from the registry plus presence checks.
  The states are *configured* / *not configured* (with the fix command) / *could not look*.
- **Exit code unchanged by module states.**
- Golden tests cover each of the three states.

**S5.4: Jev egress is the user's explicit choice (D12).**
- `template/jev.config.json`: `"egress": null` with a `$comment` saying what null means.
- `lib/jev.mjs`: the tri-state. `null` and `false` never call the network, and `null` emits a non-blocking
  `needSetting('jev.egress')`. The fallback reason is `jev could not look (egress not answered)`.
- **Tests:** a fresh (null) config never calls `fetch` (a stub asserts zero calls) and emits the marker once;
  `egress: true` behaves as before; `false` behaves as today.
- `node template/scripts/jev-eval.mjs` stays green. Consumers keep `true`. The golden-beans / medusa copy-in follows
  the wave-1 rule and never touches their `jev.config.json`.

**S5.5: stranger walkthrough #2 (X17).** Written as this sprint's walkthrough:
1. install via the prompt;
2. run setup;
3. `gf config set jev.egress false` then `true`, and on the next report run observe the change (the fallback
   reason names it);
4. `gf doctor` shows the module lines.

The review-scope variant runs in a template-spawned repo. **Owed to Daniel**: running it on a clean machine.

**Release:** 0.5.0 on merge; the CLI 0.2.0 publish is owed (D14).

**Stop and escalate** on any trigger in WAYS-OF-WORKING → *Escalate, don't guess*.

## Stories

### Story 5.1 — Five skippable setup questions
**As** a stranger, **I want** to answer at most five questions, each with a default, **so that** I'm configured in about two minutes.
**Acceptance:** The umbrella skill's setup asks the audit §4.2 questions (mode · start point · board · account · proof depth). Every one can be skipped and has a default, and only Q1 (mode) is required. Answers are written through the kit's config core, and the next step is offered (the first skill for the chosen start point).
**QA:** a conversation-level check in the walkthrough; the core is unit-tested in S4
**Risk:** low

### Story 5.2 — `gf setup` and `gf config`
**As** a terminal user, **I want** `gf setup` and `gf config list|get|set`, **so that** I can configure without asking an agent.
**Acceptance:** In golden-beans `packages/cli`: `gf setup` (the same five questions, arrow-key choices, `--yes` for defaults) and `gf config` (`list/get/set`, `--json`). Both **import the kit's config core** (`@golden-frijoles/kit` as a dependency; the kit ships `.d.ts` for that module) (D10). Golden help-text files are added and CLI exit codes are reused.
**QA:** CLI golden tests + unit tests; `check-onboarding-parity --exec` covers the new commands
**Risk:** high

### Story 5.3 — Doctor names every module's state
**As** a user, **I want** `gf doctor` to show each module as configured, not configured or could not look, **so that** I know exactly what's missing and how to fix it.
**Acceptance:** One line per module (Plan, Build, Ship, Measure, Spend, Operate), read from the registry (S4.3), with the fix command beside anything not configured. Three states, never two (LEARNINGS).
**QA:** golden test for the doctor output in each state
**Risk:** low

### Story 5.4 — Jev egress is the user's explicit choice
**As** a stranger, **I want** to be asked before my diffs are sent to a third party, **so that** nothing leaves my machine by default.
**Acceptance:** The template's `jev.config.json` default becomes `egress: false` until answered. The question is asked at the first PR (S4.3 registry) in plain words ("send diffs to TypeSafe to judge review quality?"). **Existing consumers keep their committed `true`**, and the `jev-eval` CI job is unaffected.
**QA:** a unit test that a fresh config never calls Jev; a consumer with `egress: true` behaves as before
**Risk:** high

### Story 5.5 — Stranger walkthrough #2: set up, then adjust
**As** a stranger, **I want** to set up and later change one setting, **so that** configuration is something I can live with, not a one-shot.
**Acceptance:** On a clean machine: install via the prompt, run setup, then `gf config set review.scope every-pr`, and the next PR's routing reflects it. `gf doctor` shows the expected lines.
**QA:** **owed to Daniel**: running it
**Risk:** low

## Sprint QA
- **specs:** named per story above. This repo's gate is `node --test` + the CI checks in `.github/workflows/ci.yml`; golden-beans stories use its own gate (`tsc` + build + Playwright `api`).
- **owed to Daniel:** Story 5.5
- **deterministic gate:** every CI check green before merge; high-risk stories → Daniel merges

## Sprint 5 — Smoke walkthrough (do these in order)
Env: production (GitHub, npm and https://goldenfrijoles.com), after kit 0.5.0 and CLI 0.2.0 are published.
Before the CLI publish, run `node <golden-beans>/packages/cli/dist/bin.js` wherever this says `gf`.

1. In a fresh empty repo (`mkdir s55 && cd s55 && git init`) with the plugin installed, tell your agent
   "set up golden-frijoles"
   → Three questions (what you're working on, where you're starting, connect an account now or later), each
   saying its default. Only the first is required; skipping the other two still finishes.
2. `cat golden-frijoles.config.json`
   → One readable file with `project.mode` and `project.startPoint`, and no secrets. The account answer is
   not in it.
3. `npx @golden-frijoles/cli doctor`
   → After the sign-in checks: one line per module, each *configured*, *not configured* (with the command that
   fixes it) or *could not look*. Plan reads *configured*; Build names `jev.egress`. The exit code is the same
   as before you ran setup.
4. In a template-spawned repo (its `jev.config.json` turns the rails on and ships `"egress": null`), print what
   the prose rail would do:
   `node --input-type=module -e "const j=await import('./scripts/lib/jev.mjs'); const c=j.jevContext('prose'); console.log(c.mode+' — '+c.why)"`
   → `GF-NEEDS-SETTING {"key":"jev.egress",…}` on stderr, then `off — egress not answered`. Nothing is sent.
5. `npx @golden-frijoles/cli config set jev.egress false`, run the one-liner again; then `… config set jev.egress
   true` and run it again (X17)
   → `off — egress disabled (jev.egress: false)`, with no question. Then, with `true`: `jev — configured jev` if a
   `TYPESAFE_API_KEY` is set, else `off — no TYPESAFE_API_KEY`. `jev.config.json` is unchanged throughout: the
   answer lives in `golden-frijoles.config.json`. (A kit-only repo with no `jev.config.json` has every rail
   off, so there is nothing to ask there.)
6. In a template-spawned repo (its `scripts/review-config.json` says `every-pr`):
   `npx @golden-frijoles/cli config set review.reviewScope security-paths-only`, then
   `node scripts/review-route.mjs <PR>`
   → The plan's `review scope:` line reads `security-paths-only`: the new file won over the legacy one, and
   `scripts/review-config.json` is unchanged (`git diff` is empty). The agent reads the scope from there
   (WAYS-OF-WORKING → *Review & merge*).

If any step fails, note the step number + what you saw — that's the bug report.

**Checked by the builder, 2026-09-24** (not a substitute for step 1's clean machine, owed to Daniel):
- Steps 2, 3 and 6's `config set` against the built CLI 0.2.0, in a temp repo: the file, the module lines and
  a subdirectory resolving to the same root.
- Steps 4 and 5 in a copy of `template/`: null → the ask and `egress not answered`; false; true without a key.
- `gf setup` on a pseudo-terminal: down arrow + Enter, Esc for the default, Enter. Off a terminal without
  `--yes` it exits 1 and writes nothing.
- `check-onboarding-parity --exec` against CLI 0.2.0: `gf config list --json` exits 0 with JSON, with no
  credential.
