---
title: "Golden Frijoles CLI v1 — the write surface an agent can actually drive"
slug: golden-frijoles-cli
status: scaffolded
area: "02"
type: feature
priority: wave-2026-09-16
appetite: L
underwritten_by: wave-2026-09-16
risk: high
epic: "02-commercial/golden-frijoles-cli"
build_order: 28
updated: 2026-09-16
---

# Pitch — Golden Frijoles CLI v1

## Mirror-back
> Golden Frijoles is sold as the harness a product manager and their agent operate together — and
> today the only thing we hand an agent is a **read-only** MCP connector. There is nothing to write
> with. Build a real CLI, flags-first, installable in one line, so that an agent (and a human) can
> create a project, create a flag in every environment, set a rollout and kill a feature without
> opening a browser. Then bring MCP up to the CLI's level, not the other way round.

## Problem

Three specific failures, all the same root cause:

1. **The kill-switch story can't be completed by an agent.** Every `risk: high` epic in the
   dobby-foundation ways-of-work must ship behind a flag, and the story text *mandates* "create it
   in every env" — because a flag is invisible until it exists in the provider. There is no command
   for that. So the one line of a HIGH-risk epic that most needs to be reliable is the one line
   that stops and waits for a human to click.
2. **The MCP connector is read-only and token-scoped to one project** (`/api/v1/public/mcp/c/[token]`,
   AGENTS rule #3). It is a demo surface, not an operating surface.
3. **Consumers hand-roll the gap.** `medusa-bonsai` wrote `scripts/flags.mjs` — a 200-line Flagsmith
   Admin-API wrapper — because there was no vendor CLI. Every project that adopts Golden Frijoles
   under the dobby-foundation mandate would write that script again, against our API.

An agent-first product whose write path is "log into the console" is not agent-first.

## Appetite

**L — a multi-wave epic**, re-bet at each wave boundary. Three waves:
- **W1** — the CLI skeleton, auth, `init`, and the flag read path (ship something real).
- **W2** — the flag write path: create / set / rollout / rules / kill, plus the definition-sync bridge.
- **W3** — distribution (one-line installer, `npx`, CI mode) + the MCP parity audit.

The circuit breaker is per wave. If W2 exhausts its appetite on rule-expression ergonomics, we stop
and reshape rather than growing the budget.

## Outcome & signal

After this ships, a product owner can hand a fresh agent one line — `npx @golden-frijoles/cli init` —
and the agent completes an entire kill-switch story end to end, including creating the flag in every
environment, without a browser and without a human click.

**How you test it:** in a clean clone with no Golden Frijoles env vars set, run
`npx @golden-frijoles/cli init`, follow the device-code login, then
`gf flags create checkout.demo_enabled --type boolean --kill-switch --all-envs` and see the flag
appear in the console at `/app/flags/<project>` with polarity `default true`, enabled in every env.
Then `gf flags kill checkout.demo_enabled --env production` and see the rollout drop to 0 with an
audit row naming the CLI as actor.

## Stage-2.5 bucket

**Genuinely new.** Checked: there is no CLI anywhere in the repo (`packages/` holds only `sdk`; no
`bin` field in any `package.json`). The *API* mostly exists — this is a new client over a mostly
shipped control plane, which is what keeps an L rather than an XL.

## Bill of materials (What / Why)

| What | Why |
|---|---|
| `packages/cli` — `@golden-frijoles/cli`, `bin: gf` | A second published package beside the SDK; npm is already the distribution rail |
| **Command core** — pure functions, one per verb, zero I/O | The MCP tools and the CLI must not drift. Both call the same core; parity becomes structural, not a review checklist |
| `gf login` — device-code / PAT flow → `~/.config/golden-frijoles/credentials.json` | An agent can't complete a browser OAuth redirect. Device code is the shape that works headless |
| `gf init` | Creates/links a project, mints scoped keys, writes `.env.local` + `.gitignore` entry, prints next steps. This is the whole onboarding in one verb |
| `gf projects ls/create/use` | Multi-tenant by design; the CLI needs an active-project concept (reuse `lib/active-project.ts`) |
| `gf flags ls/get/create/set/rollout/rules/diff/history/kill` | The lifecycle the mandate depends on. `kill` is a first-class verb, not `set --value false` — it is the thing you reach for at 3am |
| `gf flags sync` | Wraps the shipped `createFlagDefinitionSyncClient` — catalog-in-source-control → registry, immutable versions, 409 on drift |
| `gf keys ls/create/revoke` with `--type ingest\|flag_read\|flag_sync` | The credential separation already exists in `lib/credential-inventory.ts`; the CLI must not flatten it |
| `gf whoami` / `gf doctor` | An agent that can't tell *why* it's unauthenticated burns a whole session guessing |
| `--json` on every command + stable exit codes | Non-negotiable for agent use: a CLI an agent scrapes prose from is a CLI that breaks on a copy edit |
| One-line installer (`curl \| sh` + `npx` path) | The plugin's onboarding prints exactly one command; it has to work on a machine with nothing installed |
| MCP parity audit → write tools behind the same core | W3. Audit first, then close the gap — don't widen MCP blind |

## Scope

**In v1:**
- Auth (device code + `GOLDEN_FRIJOLES_TOKEN` env for CI), `init`, projects, the full **flag**
  lifecycle, keys, `whoami`/`doctor`, `--json` everywhere, the installer, the MCP parity **audit**
  and the write tools that the audit says are on par with shipped CLI verbs.

**Out of v1 (no-gos):**
- Telemetry / `track` from the CLI (the SDK owns that path — AGENTS rule #1).
- Experiments, journeys, north-star, scenarios, destinations, breakers. They get the same
  command-core treatment in v2; naming them now would triple the appetite.
- An interactive TUI. `--json` + plain output only.
- Windows-native installer (npx path covers it).
- Billing / plan management.

## Rabbit holes

- **Device-code auth against Supabase Auth.** `lib/supabase-auth.ts` is a browser-SSR flow. A
  device-code grant is a new primitive; decide in the architecture lock whether it's a real OAuth
  device flow or a short-lived CLI token minted from the console and pasted once. **Recommendation:
  console-minted PAT for W1** (hours, not a wave), real device code only if W3 has budget.
- **`--all-envs` is the whole point and the whole risk.** Creating a flag in every environment is a
  multi-write with no transaction. Decide the partial-failure contract *before* building: idempotent
  per-env create + a report, never a silent partial.
- **Polarity is a product concept, not a flag field.** Kill-switch ⇒ default `true`, created
  ENABLED; enablement ⇒ default `false`, created DISABLED. The CLI should take `--kill-switch` /
  `--enablement` and derive the rest, so a caller can't express the wrong combination.
- **Rule expressions on a command line.** The visual rule builder has `MAX_FLAG_RULES` /
  `MAX_FLAG_CLAUSES` / `MAX_FLAG_VARIANTS` exported from the SDK — read the constants, never
  hardcode them (the SDK header says so explicitly). Prefer `--rules-file rules.json` over inventing
  a DSL; a DSL is an appetite-eating rabbit hole.
- **Key material on disk.** `flag_sync` is a write credential. `0600`, never in the repo, never
  echoed by `doctor`, and `init` must add the env file to `.gitignore` or refuse.
- **MCP parity must not widen the public surface.** AGENTS rule #2 — `/api/v1/public/*` serves the
  demo project only. CLI auth is *not* the public path; the audit must not "fix" parity by
  loosening rule #2 or #3.

## What already exists (reuse, don't rebuild)

- `packages/sdk/src/flags.ts` — `parseFlagDefinition`, `evaluateFlag`, `explainFlagEvaluation`,
  `validateFlagKey`, and the `MAX_FLAG_*` limit constants (already exported for exactly this reason).
- `packages/sdk/src/flag-sync.ts` — `createFlagDefinitionSyncClient`, request parsing, body limits.
- `apps/web/app/api/v1/flags/{admin,snapshot,sync}/route.ts` — the control plane.
- `apps/web/lib/`: `api-keys.ts`, `credential-inventory.ts`, `credential-hash.ts`, `auth.ts`,
  `active-project.ts`, `audit.ts`, `flag-*.ts`.
- `apps/web/app/api/v1/public/mcp/c/[token]/route.ts` (524 lines) — the parity baseline.
- `apps/web/app/install/page.tsx` — the existing install UX the CLI instructions must match.
- `apps/web/app/api/v1/public/signup/route.ts` + `lib/provisioning.ts` — account creation and tenant
  provisioning already work; the CLI links to them, it does not reimplement them.

## UX heuristics & rails check
- **CI guards covering this surface:** `check-design-drift.mjs`, `check-template-drift.mjs`,
  `design-coverage.mjs` — **none apply to a CLI.** A new guard is owed: a golden-file test on
  `--help` output and on `--json` shapes, so an agent-facing contract can't change silently.
- **Audits-lens findings that apply:** none — no `00-ideas/audits/` entry covers CLI/terminal UX.
- **Design-language debt:** n/a (terminal). But the **install page and the CLI's printed next-steps
  are one surface** and must say the same thing; `/install` currently only teaches the MCP connector.

## Kill-switch / runtime gate (risk: high — Stage 6b)

**Is there a runtime seam a kill-switch can gate?** Yes, for the server half.

- **Flag:** `cli.write_api_enabled`
- **Polarity:** **enablement** — default `false`, created **DISABLED in every env**, flipped on
  deliberately. This is a new *write* path against the flag control plane; it merges dark.
- **Seam:** one resolver checked by the CLI-authenticated write routes (the same place
  `isConnectorWritesEnabled()` sits for the connector), so the CLI, any MCP write tool, and the
  console are governed by one check.
- **Mechanism:** the repo's own `lib/flags.ts` (server-side). Note the recursion — the flag service
  gating its own CLI — so the resolver must **fail closed** here, which is the opposite of the
  product's normal fail-open rule. Name that inversion in the epic's `D`-decisions.

The client half (the published npm package) has no runtime flag; its gate is the version we publish.

## Acceptance criteria

1. On a machine with only Node installed, one command installs `gf` and `gf --version` prints.
2. `gf login` completes without a browser redirect being pasted back, and `gf whoami` names the
   account and active project.
3. `gf init` in an empty repo creates a project, writes a `.env.local` with a `flag_read` key, adds
   it to `.gitignore`, and prints the SDK snippet — and re-running it is idempotent.
4. `gf flags create <key> --kill-switch --all-envs` creates the flag **enabled in every environment**
   and the console shows it; a partial failure prints which envs succeeded and exits non-zero.
5. `gf flags kill <key> --env production` takes effect in a live app inside the snapshot TTL, and
   the audit trail names the CLI as actor.
6. Every command supports `--json`; a malformed request exits non-zero with a machine-readable error.
7. The MCP parity table is written into the epic README: every CLI verb, its MCP tool, or a stated
   reason there isn't one.
8. `gf doctor` correctly diagnoses: no credentials, expired credentials, wrong project, unreachable
   API, and an out-of-date CLI.

## Open risks / research

- **Device-code auth** against Supabase Auth is unvetted — see the rabbit hole; W1 should spike it
  in hours and fall back to a console-minted PAT.
- **npm package name.** `@golden-frijoles/sdk` is published under that scope; confirm the scope
  allows a second package and that `gf` doesn't collide on `PATH` with anything common.
- **Env-var naming.** The SDK README deliberately retains `GOLDEN_BEANS_FLAG_READ_KEY` /
  `GOLDEN_BEANS_FLAG_SYNC_KEY` as "caller-owned integration addresses" post-rebrand. `gf init` writes
  those names — decide once, in the lock, whether the CLI emits the legacy names (compat) or new
  `GOLDEN_FRIJOLES_*` names (consistency) and **do not let a builder decide it mid-build**.
- ~~Free tier~~ — **answered 2026-09-16.** The plan model copies Flagsmith's shape: **Free = 50,000
  evaluations/month, 1 project, 1 seat, unlimited flags · environments · segments**; Start-Up $45/mo
  (1M, 3 seats, unlimited projects); Scale-Up $300/mo (5M+, SSO + governance). Unlimited flags and
  environments on free is what makes the dobby-foundation mandate enforceable.
  **None of it is metered or enforced today, deliberately** — every account gets everything, we are
  the only users, and every account in the system is a disposable one of ours. So **the CLI must not
  build plan awareness, quota display, upgrade prompts or limit errors into v1.** It talks to an
  unlimited API. Metering + enforcement is a separate, later `golden-beans` epic; `gf` will learn
  about plans when there is a plan to learn about. Full table:
  [`medusa-bonsai` seed `flag-provider-mandate`](../../../../medusa-bonsai/Roadmap/00-ideas/seeds/flag-provider-mandate.md).
