# Golden Frijoles CLI v1 — Sprint 2: The flag lifecycle write path

**Status:** ⬜ not started

**Epic:** [Golden Frijoles CLI v1](README.md) · **Risk: HIGH — the product owner merges** (this is the write path against the flag control plane)

**Wave 2 of 3.** The sprint that makes the dobby-foundation mandate possible, and the sprint that
defines the contract Sprint 3's MCP tools import. **Stronger model; strongest available reviewer.**

**Everything in this sprint merges dark** behind `cli.write_api_enabled` (enablement polarity,
created DISABLED in every env). Note the inversion the epic's `D`-decisions must name: **the flag
service gating its own CLI fails CLOSED** — the opposite of this product's normal fail-open rule,
because a flag-read failure must not silently grant write access.

## Stories

### Story 2.1 — `gf flags create` with polarity and `--all-envs`
**As an** agent completing a kill-switch story, **I want** one command that creates the flag in every
environment with the right polarity, **so that** the mandated "create it in every env" line is
executable instead of a manual click.
**Acceptance:** per **D3**, `--kill-switch` creates the flag with default `true`, **ENABLED in every
env**; `--enablement` creates it with default `false`, **DISABLED in every env**. The caller cannot
express the wrong combination — value and initial state are derived from the polarity flag, not
passed separately. Per **D2**, `--all-envs` is an idempotent per-env create that emits a per-env
report and exits **non-zero on any failure**. **A silent partial is the failure this story exists to
prevent**, and it is tested by forcing one env to fail.
**Risk:** high

### Story 2.2 — `gf flags set` / `rollout` / `rules`
**As an** operator, **I want** to change a flag's value, rollout percentage and targeting rules from
the terminal, **so that** the console isn't the only place the flag lifecycle can happen.
**Acceptance:** `set` changes a variant per env; `rollout` sets a percentage; `rules` takes
**`--rules-file rules.json`** — *not* a bespoke command-line DSL (see the epic's rabbit holes; a DSL
is an appetite-eating trap). Limits are read from the SDK's `MAX_FLAG_RULES` / `MAX_FLAG_CLAUSES` /
`MAX_FLAG_VARIANTS` exports, **never hardcoded** — the SDK header states exactly why: a client that
caps at a literal number disagrees with the parser the first time the parser changes, and disagrees
*silently*, by refusing input the backend would have accepted.
**Risk:** high

### Story 2.3 — `gf flags kill` — a first-class verb
**As the** product owner at 3am, **I want** one obvious command that kills a feature,
**so that** the emergency path isn't "remember that kill means `set --value false`".
**Acceptance:** `gf flags kill <key> [--env production]` disables the flag and drops its rollout to 0,
prints the before/after state, and requires `--yes` or a confirmation when run interactively against
production. Takes effect in a live app within the snapshot TTL. The audit trail names the **CLI** as
actor, distinguishably from a console action.
**Risk:** high

### Story 2.4 — `gf flags diff` / `history`
**As an** operator, **I want** to see what changed and when, **so that** a flag's version history is
readable without the console.
**Acceptance:** `diff` renders the plain-language difference between two definition versions (reusing
the shipped version-diff logic from `flags-visual-rule-builder`, not a second implementation);
`history` lists versions with actor, timestamp and change summary.
**Risk:** low

### Story 2.5 — `gf flags sync` — the catalog bridge
**As a** deploying operator, **I want** to register my source-controlled flag catalog with one command,
**so that** catalog-as-code has a front door.
**Acceptance:** wraps the shipped `createFlagDefinitionSyncClient`. Honours the v1 bounds (100
definitions, 4 MiB body). A new key creates immutable version 1; an identical definition reports
`created: false`; **semantic drift surfaces the HTTP 409 as a readable conflict for an owner to
resolve**, never as a silent overwrite. Requires a `flag_sync` credential and **refuses an `ingest`
or `flag_read` key by name**. Sync never activates, deactivates or deletes a flag — and the CLI says so.
**Risk:** high

### Story 2.6 — `gf keys ls/create/revoke`
**As an** operator, **I want** to manage the three credential types from the terminal,
**so that** key rotation isn't a console-only operation.
**Acceptance:** `--type ingest|flag_read|flag_sync` is required on create — **no default**, because
defaulting a credential type is how a write key ends up in a browser bundle. Secrets print **once**,
never again, and never in `--json` output that might be logged. `revoke` is immediate and audited.
Reuses `lib/credential-inventory.ts`; the three blast radii stay distinct.
**Risk:** high

## Sprint QA
- **api spec(s):** `e2e/cli-flag-lifecycle.spec.ts` drives create → set → rollout → rules → kill →
  history against a disposable project, asserting the live snapshot changes. A dedicated spec forces a
  **per-env failure** during `--all-envs` and asserts the non-zero exit + per-env report. Unit tests
  for polarity derivation (all four combinations) and for the `flag_sync`-key-type refusal.
- **browser smoke owed:** **yes, to the product owner** — confirming a `kill` reaches a live app and
  that the audit row attributes the CLI correctly is a signed-in console read.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` + unit tests green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: production · https://golden-beans-gamma.vercel.app · a disposable project

1. Run `gf flags create checkout.demo_enabled --type boolean --kill-switch --all-envs`.
   → Per-env report; every env reports created. Exit 0.
2. Open https://golden-beans-gamma.vercel.app/app/flags/<project>.
   → `checkout.demo_enabled` is present and **ENABLED in every environment**, default `true`.
3. Run `gf flags create demo.dark_launch --type boolean --enablement --all-envs`, then look at the console.
   → Created **DISABLED everywhere**, default `false`. *(The polarity did the opposite thing — that's the check.)*
4. Run `gf flags rollout checkout.demo_enabled --env production --percent 50`, then `gf flags get checkout.demo_enabled`.
   → 50% in production; other envs untouched.
5. Apply a rules file with `gf flags rules checkout.demo_enabled --rules-file rules.json`.
   → Accepted. Now edit it to exceed the clause limit and re-run.
   → Rejected with the **limit read from the SDK**, and the message names the actual maximum.
6. Run `gf flags kill checkout.demo_enabled --env production --yes`.
   → Before/after prints; the console shows it disabled with rollout 0.
7. Open https://golden-beans-gamma.vercel.app/app/flag-audit/<project>.
   → The kill is attributed to the **CLI**, distinguishably from a console action.
8. Run `gf flags sync --file catalog.json` with a definition that semantically conflicts with an existing key.
   → A readable **409 conflict** for an owner to resolve. Nothing was overwritten.
9. Run `gf flags sync` using a `flag_read` key.
   → Refused **by name** — it says the wrong credential type was supplied.
10. Run `gf keys create` with no `--type`.
   → Usage error. No key is minted.
11. Run `gf keys create --type flag_read`, note the secret, then run `gf keys ls`.
   → The secret is shown once and never again; `ls` shows metadata only.
12. (money/auth path — **owed to the product owner by name**) In a live app wired to this project,
    flip `checkout.demo_enabled` off with `gf flags kill` and exercise the gated path.
   → The feature is off within the snapshot TTL, and the app did not error while the flag was unreachable.

If any step fails, note the step number + what you saw — that's the bug report.

**Steps 1–3 and 9 are the load-bearing ones.** Wrong polarity ships a feature live that was meant to
be dark, and a write credential accepted where a read one belongs is a tenancy incident.
