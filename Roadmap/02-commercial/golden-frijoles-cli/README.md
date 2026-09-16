---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: golden-frijoles-cli
build_order: 28
---

# Epic: Golden Frijoles CLI v1 — the write surface an agent can actually drive

> **Area:** 02-commercial · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/golden-frijoles-cli.md`](../../00-ideas/seeds/golden-frijoles-cli.md)
> **Appetite:** L (multi-wave — one wave per sprint, re-bet at each boundary) · **Bet:** [`bets/wave-2026-09-16.md`](../../bets/wave-2026-09-16.md)

> **Cross-repo:** this epic is the dependency for `dobby-foundation`'s
> [`flag-provider-mandate`](../../../../medusa-bonsai/Roadmap/09-platform-infra/flag-provider-mandate/README.md).
> That epic's onboarding prints `npx @golden-frijoles/cli init` — **it must not merge until Sprint 2
> here has shipped**, or it prints a command that doesn't exist.

## Why

Golden Frijoles is sold as the harness a product manager and their agent operate together. Today the
only thing we hand an agent is a **read-only, demo-scoped MCP connector**. There is nothing to write
with.

Three concrete failures follow from that:

1. **The kill-switch story cannot be completed by an agent.** Every `risk: high` epic in the
   dobby-foundation ways-of-work ships behind a flag, and the story text *mandates* "create it in
   every env" — because a flag is invisible until it exists in the provider. There is no command for
   that. The one line of a HIGH-risk epic that most needs to be reliable is the line that stops and
   waits for a human to click.
2. **The MCP connector is read-only and token-scoped to one project** (`/api/v1/public/mcp/c/[token]`,
   AGENTS rule #3). It is a demo surface, not an operating surface.
3. **Consumers hand-roll the gap.** `medusa-bonsai` wrote a 200-line Flagsmith Admin-API wrapper
   (`scripts/flags.mjs`) because there was no vendor CLI. Under the dobby-foundation mandate, every
   adopting project would write that script again — against *our* API.

After this ships, a product owner hands a fresh agent one line and the agent completes an entire
kill-switch story end to end, including creating the flag in every environment, with no browser and
no human click.

## Platform-first note

**The control plane already exists.** This is a new *client* over a mostly-shipped API, which is
what keeps it an L rather than an XL. Read before building:

- `/api/v1/flags/admin`, `/api/v1/flags/snapshot`, `/api/v1/flags/sync` — the write, read and
  catalog-sync paths are live (`flag-serving-and-prd-g`, 20/20 shipped).
- `packages/sdk/src/flags.ts` exports `parseFlagDefinition`, `evaluateFlag`, `explainFlagEvaluation`,
  `validateFlagKey` **and the `MAX_FLAG_RULES` / `MAX_FLAG_CLAUSES` / `MAX_FLAG_VARIANTS` constants** —
  exported deliberately so a client never hardcodes the numbers the parser enforces. The SDK's own
  header states the failure this prevents: a builder that caps at a literal 20 disagrees with the
  parser the first time the parser changes, and it disagrees **silently**, by refusing input the
  backend would have accepted. **The CLI reads the constants.**
- `lib/credential-inventory.ts` already models the three key types (`ingest` / `flag_read` /
  `flag_sync`) with different blast radii. The CLI must not flatten them.
- `lib/active-project.ts` already models an active project.
- `/signup` + `lib/provisioning.ts` already create accounts and provision tenants. The CLI **links**
  to them; it does not reimplement them.

**Data ownership (AGENTS rule #1):** the growth engine owns telemetry. **The CLI never sends events.**
That path is the SDK's, and adding a second one would be a parallel pipeline.

**AGENTS rule #2 (`/api/v1/public/*` serves the demo project only) is not relaxed by this epic.** CLI
auth is a *credentialed* path, not the public one. Sprint 3's parity work must not "fix" parity by
loosening rule #2 or #3.

## What already exists (reuse, don't rebuild)

- `packages/sdk/src/flags.ts` · `flag-sync.ts` · `flag-provider.ts` — parsing, evaluation, limits,
  the sync client.
- `apps/web/app/api/v1/flags/{admin,snapshot,sync}/route.ts` — the control plane.
- `apps/web/lib/`: `api-keys.ts`, `credential-inventory.ts`, `credential-hash.ts`, `auth.ts`,
  `active-project.ts`, `audit.ts`, `flag-*.ts`, `quota.ts`, `rate-limit.ts`.
- `apps/web/app/api/v1/public/mcp/c/[token]/route.ts` (524 lines) — the parity baseline for Sprint 3.
- `apps/web/app/install/page.tsx` — the existing install UX the CLI's printed next-steps must match.
- `apps/web/app/app/{flags,flag-credentials,keys,agent-keys,onboarding,setup}/…` — the console flows
  the CLI mirrors; their server actions are the behaviour contract.
- `packages/sdk/package.json` — the publishing shape for a second package under the same scope.

## Architecture decisions to lock before any builder starts

- **D1 — the auth grant.** Real OAuth device code vs. a console-minted PAT. **Recommendation:
  console-minted PAT for Sprint 1** (hours, not a wave); real device code only if Sprint 3 has
  budget. Locked against `lib/supabase-auth.ts`'s actual browser-SSR flow, not against a guess.
- **D2 — `--all-envs` partial-failure contract.** Creating a flag in every environment is a
  multi-write with no transaction. Idempotent per-env create, a per-env report, non-zero exit on any
  failure. **Never a silent partial.**
- **D3 — polarity is a CLI concept.** `--kill-switch` ⇒ default `true`, created ENABLED everywhere;
  `--enablement` ⇒ default `false`, created DISABLED everywhere. The caller cannot express the wrong
  combination because the CLI derives value + initial state from the polarity flag.
- **D4 — the command core is pure and shared.** One function per verb, zero I/O. Both the CLI and any
  MCP write tool call it. **Parity becomes structural, not a review checklist.**
- **D5 — the `--json` contract is a golden-file test.** An agent-facing output shape that can change
  on a copy edit is a contract with no teeth.
- **D6 — env var naming.** The SDK README deliberately retains `GOLDEN_BEANS_FLAG_READ_KEY` /
  `GOLDEN_BEANS_FLAG_SYNC_KEY` as "caller-owned integration addresses" post-rebrand. Decide **once,
  here**, whether `gf init` emits the legacy names (compat) or `GOLDEN_FRIJOLES_*` (consistency).
  A builder must not decide this mid-build.
- **D7 — no plan awareness in v1.** Every account is unlimited today and every user is one of ours.
  No quota display, no upgrade prompts, no limit errors. The plan table lives in the mandate epic;
  `gf` learns about plans when there is a plan to learn about.

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `packages/cli` skeleton — `bin: gf`, `--json`, exit codes, golden-file help | low |
| 1 | 1.2 `gf login` / `gf whoami` — headless-capable auth | high |
| 1 | 1.3 `gf projects ls/create/use` | low |
| 1 | 1.4 `gf init` — the whole onboarding in one verb | high |
| 1 | 1.5 `gf flags ls/get` + `gf doctor` | low |
| 2 | 2.1 `gf flags create` with polarity and `--all-envs` | high |
| 2 | 2.2 `gf flags set` / `rollout` / `rules` | high |
| 2 | 2.3 `gf flags kill` — a first-class verb | high |
| 2 | 2.4 `gf flags diff` / `history` | low |
| 2 | 2.5 `gf flags sync` — the catalog bridge | high |
| 2 | 2.6 `gf keys ls/create/revoke` | high |
| 3 | 3.1 The one-line installer + `npx` path | low |
| 3 | 3.2 CI mode — `GOLDEN_FRIJOLES_TOKEN`, non-interactive, stable exits | low |
| 3 | 3.3 The MCP parity **audit** — a written table, no code | low |
| 3 | 3.4 MCP write tools behind the shared command core | high |
| 3 | 3.5 `/install` page + docs teach the CLI, not just the connector | low |

## Deploy order

**Backend-gated, client-published.** The server half (any new CLI-authenticated write route) merges
**dark** behind `cli.write_api_enabled`; the npm package is published only once the routes are live
and the flag is flipped. Migrations, if any, are **applied before merge** — merging deploys, and code
reading a new column against an unmigrated table breaks an actively-used path rather than staying dark.

Branches stack: `feat/golden-frijoles-cli` → `-s2` → `-s3`, one PR per sprint, merged in order. All
three sprints share `packages/cli/` and the command core by construction — **stack or pay.**

**Model routing:** Sprint 2 defines the write contract everything else imports — stronger model.
Sprint 1 is mostly mechanical once D1 is locked; Sprint 3 is mechanical apart from 3.4. Review is
inverted: Sprint 2's PR gets the strongest available fresh reviewer.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch (planned at grooming — Stage 6b):** `cli.write_api_enabled` exists **in every
      env, created DISABLED** (enablement polarity), gating the CLI-authenticated write seam.
      ⚠️ **Note the inversion:** the flag service gating its own CLI must **fail CLOSED** here —
      the opposite of this product's normal fail-open rule. `D`-decisions must name it.
- [ ] **`@golden-frijoles/cli` is published to npm** and `npx @golden-frijoles/cli --version` works on
      a machine that has never seen it. *Done means shipped — a merged PR that isn't installable is
      not done.*
- [ ] The **MCP parity table** is written into this README: every CLI verb, its MCP tool, or a stated
      reason there isn't one.
- [ ] Feature branches deleted; **this README's frontmatter `status: shipped`** (run `node scripts/build-order.mjs`)
