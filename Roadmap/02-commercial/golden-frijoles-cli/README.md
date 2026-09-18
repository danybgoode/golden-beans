---
status: in-progress   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
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

## Architecture decisions — LOCKED (verified against live code, 2026-09-17)

> Each decision below was checked against the running system, not against the plan. Where the
> check disproved the plan, the decision says so and an **amendment** records it. Builders **cite**
> these by number; a paraphrase drifts permissive.

### D1 — the auth grant: a console-minted PAT, scoped to the ACCOUNT, in its own table

`lib/supabase-auth.ts` is a browser-SSR cookie flow; a device-code grant against it is a new OAuth
primitive and an appetite trap (the seed says so). **Locked: a console-minted personal access
token**, `gf_pat_…`, hashed through the one `hashCredential`, pasted once by `gf login` or supplied
as `GOLDEN_FRIJOLES_TOKEN`.

**It gets its own table, `cli_tokens`, and that is not the default answer here.** The house rule
(`CODE-QUALITY.md` #1, and both the `agent_write` and share-link migrations) is *reuse the seam,
never build a second revoke path*. It does not apply, for a reason checked in the schema rather
than assumed: **`api_keys.project_id` is `NOT NULL`** (`20260720130000_api_keys.sql`) and every one
of the six scopes resolves *through a project*. A CLI token must answer "which projects does this
caller have?" **before** a project is known — `gf projects ls`, `gf whoami`, `gf init` in an empty
directory all need it. No row in `api_keys` can express that, and making `project_id` nullable
would weaken the predicate that every existing scope filter leans on.

So the CLI token is **user-bound**, and every project-scoped thing it then does is authorized the
way the console authorizes it: resolve `user_id` → `project_members` → owner/member. The CLI gets
**no authority the console session does not already have.**

### D2 — `--all-envs` partial-failure contract

Three environments, three writes, no transaction. Locked: **idempotent per environment, a per-env
report, non-zero exit if any environment failed** — and the report is part of the `--json` contract,
not prose. Never a silent partial, and never a rollback attempt (a "rollback" across three
non-transactional writes is a fourth thing that can half-fail).

### D3 — polarity is a CLI concept, and BOTH polarities activate

`--kill-switch` ⇒ variants `on=true` / `off=false`, **default `on`**, activated in every
environment ⇒ the flag serves `true` everywhere on the day it is born.
`--enablement` ⇒ same variants, **default `off`**, activated in every environment ⇒ it serves
`false` everywhere.

⚠️ **Both polarities ACTIVATE. That is a correction to the scope doc's wording** and it is the
whole point of the kill-switch story. In this control plane a definition with no activation is
absent from the environment's snapshot, so a consumer resolving it gets `FLAG_NOT_FOUND` and falls
back to its own literal — which is exactly the "a flag is invisible until it exists in the
provider" failure the epic exists to end. "Created disabled" therefore means **serving `false`**,
not **not serving**. The caller still cannot express the wrong combination: the CLI derives the
default variant *and* the activation from the polarity flag, and `--kill-switch --enablement` is a
usage error.

### D4 — the command core is pure and shared, and it lives in the SDK

One function per verb, zero I/O. **Locked: `packages/sdk/src/flag-commands.ts`, not
`packages/cli`.** The MCP write tools live in `apps/web`, which already depends on
`@golden-frijoles/sdk` and must not start depending on the CLI. Putting the core in the SDK is what
makes parity *structural*: `apps/web` and `packages/cli` import the same module, so a CLI verb and
its MCP tool cannot disagree about what a flag definition is.

The core is a **planner**: it takes parsed input and returns the definition + the list of
environments to activate. It does no fetch, reads no env, touches no disk. The I/O lives in
`packages/cli/src/api.ts` (HTTP) and the route handlers (database).

### D5 — the `--json` contract is a golden-file test

`packages/cli/src/__golden__/` holds the exact bytes of `gf --help`, every subcommand's help, and a
representative `--json` envelope per verb. `npm run test:unit` diffs them. An agent-facing output
shape that a copy edit can change is a contract with no teeth.

### D6 — env var naming: `GOLDEN_FRIJOLES_*`

**Checked, and the premise in the scope doc was wrong in a way that makes this easy.** The SDK reads
**no** environment variable — `createFlagProvider` takes `flagReadKey` as an argument, and the
`GOLDEN_BEANS_FLAG_READ_KEY` / `GOLDEN_BEANS_FLAG_SYNC_KEY` names appear only in
`packages/sdk/README.md` **examples**. They are caller-owned addresses, exactly as the README says.

So there is no compatibility to preserve — nothing in shipped code resolves either name. Locked:
`gf init` writes **`GOLDEN_FRIJOLES_URL`**, **`GOLDEN_FRIJOLES_FLAG_READ_KEY`** and
**`GOLDEN_FRIJOLES_ENVIRONMENT`** — exactly the three `ENV_KEYS` in `packages/cli/src/commands/init.ts`
— and it **prints the snippet that reads them in the same breath**, so the file and its reader are
generated together and cannot drift.

⚠️ *Corrected in review (Codex, round 5).* This paragraph originally listed
`GOLDEN_FRIJOLES_FLAG_SYNC_KEY` and `GOLDEN_FRIJOLES_API_KEY` too. `gf init` deliberately writes
neither: a `flag_sync` key authorizes writing definitions and an ingest key sends events, and a
verb whose job is "let this app READ its flags" must not put wider credentials on disk as a side
effect. They are minted on purpose with `gf keys create --type flag_sync|ingest`. The decision was
right; the sentence describing it was not. The SDK
README gains one line naming the new default; the legacy names stay valid because they were never
lookups. Existing consumers are untouched.

### D7 — no plan awareness in v1

Unchanged. No quota display, no upgrade prompt, no limit error. `gf` learns about plans when there
is a plan to learn about.

### D8 — the gating seam: `CLI_WRITE_API_ENABLED`, and it is **born ON**

The seam the scope doc asked for is built: one resolver, `isCliWriteApiEnabled()` in
`apps/web/lib/flags.ts`, checked by every CLI-authenticated write route before any credential work,
so OFF is a whole-surface kill switch and not a credential-validity oracle.

⚠️ **Its polarity is inverted from the scope doc, by a standing product-owner instruction** (Daniel,
2026-08-31, restated for this epic 2026-09-17: *"nothing is dark, all is enabled, nothing is waiting
for me"*). The gate reads `process.env.CLI_WRITE_API_ENABLED !== 'false'` — **enabled unless
explicitly disabled** — which is the only polarity that ships live on merge with no Vercel env var
owed. Every other gate in `lib/flags.ts` is `=== 'true'`; this one is deliberately not, and says so
where it is defined.

**On the "fails CLOSED" line in the bet:** that clause exists to stop the flag service gating its
own CLI *through its own flag service* — a read that fails would grant write access. This gate does
not do that. It reads an environment variable, there is no read that can fail, and the recursion the
bet warned about does not exist. The inversion is recorded rather than quietly resolved.

### D9 — `gf projects create` is an idempotent **ensure**, not a second creation path

**Disproved by the schema.** `projects_one_per_creator_idx`
(`20260721100000_self_serve_tenants.sql`) is a partial UNIQUE index on `projects(created_by)`: a
self-serve account owns **exactly one** project, enforced by the database. It is a signup-race
guard, not a plan limit, and dropping it would reopen the race a cross-review closed.

So there is no second project for `gf projects create` to create, and building one would mean
either lifting that index or writing a second provisioning path. Locked: `gf projects create` calls
the **existing** `lib/provisioning.ts`, is idempotent, and returns `{ created: false }` naming the
account's existing project when there is one. That is a real capability — `?provision=failed` is a
reachable state — and it is honest about the ceiling instead of pretending to a `create` that
cannot happen.

### D10 — the CLI writes through routes, never through a second control plane

Every CLI write lands on `lib/flag-registry.ts`'s existing RPCs (`create_flag_definition_version`,
`set_flag_activation`, `deactivate_flag`, `import_flag_definition_catalog`) — the same functions the
console's server actions call, with the same optimistic-concurrency `expected_snapshot_version` and
the same audit rows. **No new SQL touches flag state.** The one new migration creates the credential
table and nothing else.

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

**Backend-first, client-published — and nothing merges dark (D8).**

1. **The migration is applied to production BEFORE the PR that reads it merges.** Merging deploys;
   code reading `cli_tokens` against an unmigrated database would break at the first request. The
   migration is expand-only and nothing reads the new table until Sprint 1's routes do, so it is
   safe to apply early.
2. **Sprint 1 merges → production serves the CLI write API immediately** (`CLI_WRITE_API_ENABLED`
   is born ON; no Vercel env var is owed, no flip is owed).
3. **The npm package is published once the routes answer on `goldenfrijoles.com`**, verified by
   exercising them — not by reading a deploy list. A published client pointing at a route that 404s
   is worse than no client.

Branches stack: `feat/golden-frijoles-cli` → `-s2` → `-s3`, one PR per sprint, merged in order.

All three sprints share `packages/cli/` and the command core by construction — **stack or pay.**

**Model routing:** Sprint 2 defines the write contract everything else imports — stronger model.
Sprint 1 is mostly mechanical once D1 is locked; Sprint 3 is mechanical apart from 3.4. Review is
inverted: Sprint 2's PR gets the strongest available fresh reviewer.

## MCP parity table (Story 3.3 — the audit, written before 3.4 wrote any code)

**Derived from the registered tool names**, not from memory: `grep -oE "registerTool\(\s*'[a-z_]+'"`
over `app/api/v1/public/mcp/c/[token]/route.ts` and `lib/mcp-flag-tools.ts`.

| CLI verb | MCP tool | Notes |
|---|---|---|
| `gf flags ls` | `list_flags` | ✅ closed by 3.4 |
| `gf flags get` | `get_flag` | ✅ closed by 3.4 |
| `gf flags create` | `create_flag` | ✅ closed by 3.4 — same planner |
| `gf flags set` | `set_flag` | ✅ closed by 3.4 — same planner |
| `gf flags rollout` | `rollout_flag` | ✅ closed by 3.4 — same planner |
| `gf flags kill` | `kill_flag` | ✅ closed by 3.4 — same planner |
| `gf flags rules` | — | **Deliberate.** Its input is a rules FILE, and the shaping named a rule DSL as the appetite trap. An MCP tool would either take the whole rule array inline (which `create_flag`/`set_flag` do not need and which no agent composes by hand today) or invent the DSL. Revisit when something asks for it. |
| `gf flags diff` · `history` | — | **Deliberate, and not a gap.** `get_flag` already returns every version and the audit window; the CLI's diff is a *rendering* of that, in the console's own words. A tool that returned pre-rendered English would be a second place for those sentences to live. |
| `gf flags sync` | — | **Deliberate — credential shape.** Sync rides a `flag_sync` key precisely so a catalog publisher cannot also roll out or kill. An MCP tool would ride the connector token, which reunites what that split exists to separate. |
| `gf keys ls/create/revoke` | — | **Deliberate — blast radius.** Minting credentials over a connector is how a read surface becomes a credential factory. It stays owner-only, in the console and the CLI, where a human or a named account is the actor. |
| `gf projects ls/create/use` | — | **Structural.** A connector token resolves to ONE project and no tool schema accepts a project argument — that is what makes cross-project isolation true by construction (AGENTS rule #2/#3). A `projects` tool would have to break it. |
| `gf login` · `whoami` · `doctor` · `init` | — | **N/A.** Local-machine concerns: a credentials file, a `.env.local`, a `.gitignore`. There is nothing on the other side of an MCP transport for them to do. |

**Neither rule was relaxed.** `/api/v1/public/*` still serves the demo project only; the connector is
still enablement-gated and still needs its token. Story 3.4 closed the gap by bringing MCP **up** to
the CLI — the write tools require a THIRD credential (a `gf_pat_…` whose holder owns the connector's
project) on top of the existing two, because the flag control plane's RPCs are owner-attributed and
an `agent_write` key is not a person. `lib/mcp-flag-tools.ts` states the two alternatives and why
both are worse.

## Known gaps and follow-ups (named, not dropped)

- **Concurrent identical writes can each create a version.** `lib/cli-flag-write.ts` checks "is the
  newest version identical?" in application code, while `create_flag_definition_version` takes its
  advisory lock inside the RPC. Two identical `gf flags create` calls racing each other can produce
  v1 and v2. Every environment still serves the same values (the definitions are identical), and
  neither `create` nor `kill` has a rollout rule to re-bucket; the residual case is two agents
  running the *same* `gf flags rollout` at once. **The fix is to move the comparison into the RPC,
  under its existing lock — a migration on the control plane's core write function**, deliberately
  not done mid-release. Raised in review of #150, round 2.
- **Setup › CLI access has no approved reference state.** The console prototype predates the CLI, so
  the route claims no design coverage (28 of 29) and carries a dated deferral naming Daniel. It is
  exercised end to end by `cli-access.authed.spec.ts` rather than by the visual gate.

## Definition of Done (epic)
- [x] All sprints merged to `main` + smoke-tested (gaps stated)
- [x] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [x] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Product poster (`Roadmap/README.md`) updated
- [x] Team memory + index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [x] **Kill-switch (planned at grooming — Stage 6b), AMENDED by D8:** the seam exists —
      `isCliWriteApiEnabled()` in `apps/web/lib/flags.ts`, checked by every CLI-authenticated write
      route before any credential work. ⚠️ **Its polarity is inverted from the scope doc, on a
      standing product-owner instruction** (Daniel 2026-08-31, restated 2026-09-17): it is **born
      ON** (`CLI_WRITE_API_ENABLED !== 'false'`), so the epic ships live on merge and no Vercel env
      var is owed. The "fails CLOSED" clause in the bet addressed a recursive read of the product's
      own flag service; this gate reads an env var and has no read that can fail. See **D8**.
- [ ] **`@golden-frijoles/cli` is published to npm** and `npx @golden-frijoles/cli --version` works on
      a machine that has never seen it. *Done means shipped — a merged PR that isn't installable is
      not done.*
- [x] The **MCP parity table** is written into this README: every CLI verb, its MCP tool, or a stated
      reason there isn't one.
- [ ] Feature branches deleted; **this README's frontmatter `status: shipped`** (run `node scripts/build-order.mjs`)
