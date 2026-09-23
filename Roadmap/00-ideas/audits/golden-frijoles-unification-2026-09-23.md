# Audit: one product. dobby-foundation merges into Golden Frijoles, and scenarios move to Mutiny (2026-09-23)

**Scope:** the product owner's integration brief (2026-09-23), read against `golden-beans` (the Golden Frijoles
product), `dobby-foundation` (the `ways-of-work` plugin + `template/`) and `mutiny/New-Product-Idea-mutiny.md`.
This is input to grooming. No code has been written. Every "exists today" claim below cites the file it came from.

---

## 0. The verdict

1. **The merge is mostly packaging and naming. There's very little new product in it.** The two repos are
   already welded: the template ships the Golden Frijoles flag provider by default (`golden-flags-by-default`),
   `preflight.mjs` fails without a linked GF project, and `lib/golden-onboarding.mjs` + `check-onboarding-parity.mjs`
   already treat `gf init` as one onboarding surface. What's missing is **one name, one install, one config and one setup
   flow**.
2. **The copy-paste prompt can't work as written, for two reasons.** (a) It names three different
   identities (`golden-frijoles/skills`, `@danybgoode`, `danybgoode/skills`). The part after `@` is the `name` in
   `marketplace.json`, not a GitHub owner. (b) **A skill is inert without its scripts.** Every `ways-of-work` skill
   declares `requires_scripts` that live in the *consuming repo's* `scripts/`, and it stops when they're missing. A
   stranger who installs the plugin into an existing repo gets ten skills that stop. So packaging comes first (§3).
3. **Jev can't do what the TLA+/Lean section asks of it.** Jev returns typed *decisions* (Choice / Score / Noul).
   It doesn't generate text or code. TypeSafe's own docs say so, and so does this repo's `jev-fit-audit-2026-09-19.md`
   ("Jev judges text it's given… it can't find a vulnerability, since that takes reasoning and generation"). It can't
   write invariants, emit Lean types or fill proof obligations. The pipeline is still worth building, with the roles
   re-cast: **the frontier model writes, TLC/Apalache and the Lean kernel check, and Jev triages and routes.** A
   confidence score should never stand in for a proof that failed or is missing (§10).
4. **Scenarios and drills belong in Mutiny.** They're also Mutiny's best asset: GF already built a *bounded,
   owned-target, closed-template, audited* execution kernel. That's the safety kernel Mutiny's PRD describes in its own §7
   and doesn't have yet. **Circuit breakers stay in GF** because they're flag primitives. Transfer the scenario code later.
   For now, freeze it (it's already dark) (§11).
5. **The default board already exists, and it's yours: the Roadmap Hub.** It shipped 2026-07-26 with journey · epic ·
   horizon views and revocable share links. A 2026-07-15 decision already recorded that SmallDocs' license/fork posture
   "weighs against coupling the commercial product to it". Recommendation: **the Claude mod for local use, the Hub as the
   hosted default, and Notion/SmallDocs as adapters over the one `roadmap-extract.mjs` projection** (§6).
6. **The portfolio view collides with the tenancy invariant.** AGENTS.md says *"no request-derived read
   path can cross projects"*, and there is no workspace/org entity, only `projects` + `project_members`. A portfolio needs
   an explicit decision from you, because a comment can't amend that rule (§7).
7. **FinOps is `availability: 'unbuilt'` on the landing today (`lib/maker-ops.ts`), and it's more buildable than it
   looks.** Claude Code exports `claude_code.cost.usage` / `claude_code.token.usage` over OpenTelemetry, with
   `skill.name` and `plugin.name` attributes. Attribution to groom vs build and to each skill comes for free. Epic
   attribution needs one small addition: record `session.id` → branch at session start (§8).
8. **Experiments are the fastest visible win.** The "New experiment" modal (`app/app/experiments/[projectSlug]/page.tsx`)
   wraps `experiment-manager.tsx`, which is still a **24-row JSON textarea**, plus a separate "bind a flag version"
   step. The contract (`lib/experiment-definition.ts`) already has every field a guided flow needs. It's a UI epic
   with one missing read (an event catalog with baselines) and no migration (§9).
9. **When to groom: after you answer the eight decisions in §13.** Two seeds are groomable the moment D1 is
   settled: *one plugin, one install* and *experiments for humans*. The formal-methods layer should start as a
   **spike on GF's own outbox and flag evaluator**, not as an epic or a landing claim (§14).

---

## 1. What exists today (inventory)

| Capability | Where | State |
|---|---|---|
| 10 skills (groom, build-order-sync, doc-hygiene, live-smoke, pmo-report, prose-draft, standup-post, babysit-pr, vercel-prune, weekly-recap) + `pr-reviewer` agent | `dobby-foundation/plugins/ways-of-work/` | Live, internal. `plugin.json`: "every git commit is a new version" (no semver) |
| Build view: a Claude mod (function hooks) | `plugins/ways-of-work/hooks/` + `scripts/build-state.mjs` | Needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` (pre-release) |
| Copy-once project skeleton | `dobby-foundation/template/` | Roadmap/, AGENTS.md, CI, 55 scripts (133 files with tests and templates), example app |
| Pre-planning coaches: PMF narrative, North Star workshop, Deliberate Risk Validation | `dobby-foundation/references/*.md` | **Not skills.** Chat prompts with a fenced YAML header, no frontmatter, no `requires_scripts`, no output contract |
| Jev semantic guards (review + prose rails) | `template/scripts/lib/jev.mjs`, `jev.config.json` | Promoted to `jev` 2026-09-23. Template ships `egress: true` |
| Flags: registry, versions, rule builder, kill switch, snapshot serving | `golden-beans` 01-growth-engine | Live |
| `gf` CLI | `packages/cli` | `@golden-frijoles/cli@0.1.0`: login/logout, init, doctor, whoami, projects, keys, flags (create/set/rules/rollout/kill/get/ls/diff/history/sync). **No experiments, no config, no setup** |
| TARS, North Star, entity journeys | `lib/{tars,north-star,journey}*.ts` | Live, single-project |
| Experiments: governed registry, SRM, decision record | `lib/experiment-*.ts` | Live. **Authoring is JSON** |
| Scenarios (resilience faults), security simulations (4 templates), impact evidence | `lib/scenario-*.ts`, `lib/security-template.ts`, 6 migrations | Code live, gates OFF; `scenarios-pm-operable` "in progress" with status drift |
| Circuit breakers | `lib/breaker-*.ts`, `breaker_*` tables | Live; trips a **flag** |
| Roadmap Hub + Pod Report + share links | `app/hub/`, `report_artifacts`, `api/v1/roadmap` | Live |
| Signals loop → `tasks` for the customer's agent | `tasks` table | Live. Table comment: *"there is no LLM anywhere in this engine and that is the product claim"* |
| FinOps | `lib/maker-ops.ts` surface `fin` | `availability: { kind: 'unbuilt' }` |
| Workspace / org entity | none | Only `projects` + `project_members` |

---

## 2. The product shape: one product, four layers

```
                    ┌────────────────────────────────────────────────────────────────┐
  in the agent      │  PLUGIN  golden-frijoles   (skills · hooks/Claude mod · agents) │  Claude Code: full
                    │  one umbrella skill routes to: think · plan · build · ship ·   │  other agents: skills only
                    │  measure · spend · operate                                     │  (npx skills: no hooks)
                    └───────────────┬────────────────────────────────────────────────┘
                                    │ calls
  on the machine    ┌───────────────▼──────────────┐   ┌───────────────────────────────┐
                    │  KIT  @golden-frijoles/kit    │   │  CLI  gf  (@golden-frijoles/cli)│
                    │  the 55 template scripts,     │   │  account, flags, experiments, │
                    │  versioned, zero-dep, npx     │   │  setup, config, doctor         │
                    └───────────────┬──────────────┘   └───────────────┬───────────────┘
                                    │ optional (only with an account)  │
  hosted            ┌───────────────▼──────────────────────────────────▼───────────────┐
                    │  ENGINE  goldenfrijoles.com   (no LLM inside, per the tasks table) │
                    │  flags · experiments · TARS/North Star/journeys · Hub/board ·     │
                    │  portfolio · FinOps actuals · destinations · breakers · MCP       │
                    └────────────────────────────────────────────────────────────────────┘
  in the repo       Roadmap/ (docs = source of truth) · golden-frijoles.config.json · AGENTS.md
```

**The modules a user sees,** named by the job, which is how the console's four sections (Today · Measure · Ship · Setup) already work:

| Module | Contents | Needs an account? |
|---|---|---|
| **Think** (pre-planning) | PMF Narrative → North Star workshop → Deliberate Risk Validation, run in that order | No |
| **Plan** | groom, scrumban board (Claude mod + board), bets/waves | No (the hosted board needs one) |
| **Build** | build view, cross-review rails, Jev guards, live-smoke, **Verify** (formal methods, §10) | No |
| **Ship** | flags, kill switches, experiments, breakers, destinations | Yes |
| **Measure** | TARS, North Star, journeys, experiment readouts, **portfolio** | Yes |
| **Spend** | FinOps: quotes, actuals, budgets, token management | Actuals need one |
| **Operate** | standup, weekly recap, PMO report, babysit-pr, doc-hygiene, vercel-prune | No (chat destinations are opt-in) |

**Keep the engine LLM-free.** The `tasks` migration states it as the product claim. Jev, the frontier model and every
formal-methods tool run in the **plugin/kit on the customer's machine or CI**, never inside the engine. That's also
the BYO-agent stance the landing already takes.

---

## 3. Install: one repo, one name, three channels

### 3.1 The prompt, corrected

Pick **one identity** (decision D1). The recommended identity is a GitHub org `golden-frijoles`, repo `skills`, marketplace name
`golden-frijoles` and plugin name `golden-frijoles`. The org name's availability still has to be checked.

> Install the golden-frijoles plugin. If you're in Claude Code, run `claude plugin marketplace add golden-frijoles/skills`,
> then `claude plugin install golden-frijoles@golden-frijoles`. If you're in another agent, run
> `npx skills add golden-frijoles/skills --skill golden-frijoles` and select your agent. Use one installation method.
> You can read the skill directly at https://github.com/golden-frijoles/skills/blob/main/plugins/golden-frijoles/skills/golden-frijoles/SKILL.md
> (raw: https://raw.githubusercontent.com/golden-frijoles/skills/main/plugins/golden-frijoles/skills/golden-frijoles/SKILL.md).
> Then use the golden-frijoles skill when working on this project, and start with its setup.

Why each change:
- `claude plugin install <plugin>@<marketplace>`: the suffix is the **`name` in `.claude-plugin/marketplace.json`**. The repo
  name doesn't count. `golden-frijoles@danybgoode` only works if the marketplace is literally named `danybgoode`, which
  puts a personal handle in the product's install line.
- `npx skills add` discovers skills declared in `.claude-plugin/marketplace.json` / `plugin.json`, so **one repo serves
  both channels**. It installs **SKILL.md folders only, with no hooks and no agents**, so a Codex/Cursor user gets no build-view
  mod and no `pr-reviewer` agent. The umbrella skill has to say what that channel lacks, not pretend it's parity.
- "Start with its setup" makes the first thing the agent does the setup interview (§4). A user who pasted the prompt
  shouldn't have to know a second command exists.
- **The Claude app** (no terminal) is covered by the raw URL: the agent reads SKILL.md and follows it. `pack-skills.mjs`
  already builds `.skill` archives for a saved-skill install. Offer that as a link on `/install`, not in the prompt.

**Where the prompt lives:** it replaces or joins `handoffPrompt()` in `apps/web/lib/landing-prompts.ts`. Put it in one module,
and extend `check-onboarding-parity.mjs` so the landing, `/install`, the plugin README and the umbrella SKILL.md carry the
identical string. Add `--exec` for the `claude plugin …` lines too, since that check exists precisely because a
perfectly consistent string once pointed at a command that didn't exist.

### 3.2 The packaging change the prompt depends on

Today: *skill → `requires_scripts` → the consuming repo's `scripts/`, copied once from `template/`*. That was the right call
for sibling repos you own. It fails for a stranger's repo. Options:

| Option | How | Verdict |
|---|---|---|
| A. Keep copy-once | setup copies `template/scripts/` into the repo | 133 files land in someone's repo. Drift returns, which is the "fork drift" the foundation exists to prevent |
| **B. `@golden-frijoles/kit` on npm** | skills call `npx -y @golden-frijoles/kit@<pinned> <script>`; the plugin release pins the kit version | **Recommended.** Versioned, one place, works in every agent channel, no files in the user's repo. `check-skill-scripts.mjs` checks kit exports instead of paths |
| C. Scripts inside each skill folder | `${CLAUDE_PLUGIN_ROOT}/…` | Shared libs get duplicated across skills. Works, but it's a second copy of every lib |

**Stays copy-once:** only what's genuinely the project's own: the `Roadmap/` skeleton, the `AGENTS.md` rules slot,
project-specific checks (`prod-smoke.checks.mjs`) and CI workflow examples. The WAYS-OF-WORKING fill-ins move into the config file (§4.3).

### 3.3 What public distribution adds

- **Semver + changelog.** "Every commit is a version" is fine for you. For strangers, `claude plugin update` should
  move between tagged releases, with the kit pinned per release.
- **A license.** `golden-beans` is "Private / internal, all rights reserved", and the CLI's `package.json` says
  `UNLICENSED` while `publishConfig.access` is `public`. A public skills repo needs an explicit license choice.
- **The leak guard earns its keep.** `check-plugin-leaks.mjs` already sweeps for origin residue. Widen it to the
  internal-only skills below.
- **Migration for the two consumers.** `golden-beans/.claude/settings.json` enables `ways-of-work@dobby-foundation`, and so does
  `medusa-bonsai` per the foundation README. Keep that marketplace for one release as a thin alias that points forward (the same move as the
  deprecated `@golden-beans/sdk` pointer in `frijoles-rebrand-closeout`).

---

## 4. Onboarding and configuration

### 4.1 Principle: three stages, and nothing is asked before it's needed

| Stage | Trigger | What happens | Mandatory? |
|---|---|---|---|
| **0 · Installed** | plugin present, no config | The umbrella skill detects "no `golden-frijoles.config.json`" and offers setup once per session (a SessionStart nudge in Claude Code, the skill's own first instruction elsewhere) | Nothing |
| **1 · Setup** (≈2 min, 5 questions, all skippable) | "set up golden-frijoles" / first use | Writes `golden-frijoles.config.json` and, per answer, the `Roadmap/` skeleton | Only the project mode (Q1) |
| **2 · Just-in-time** | first time a module needs something | Asks for that one thing, writes it to the config, and says where to change it | Per module |

### 4.2 The setup interview (Stage 1)

| # | Question (plain words) | Options → default | Writes |
|---|---|---|---|
| Q1 | What are we working on? | **existing repo** (adopt: add `Roadmap/`, keep everything else) · new project (spawn skeleton) · planning only (docs, no repo changes) | `mode` |
| Q2 | Where are you starting? | **idea** (Think: PMF → North Star → Risk) · know what to build (Plan: groom) · already building (Build) | first skill it runs |
| Q3 | Where should the board live? | **in the terminal** (Claude mod + generated `BUILD-ORDER.md`) · Golden Frijoles board (needs account) · Notion · SmallDocs (self-hosted) | `board.sink` |
| Q4 | Connect a Golden Frijoles account? | **later** · now (`gf login` + `gf init`) | account + `.env.local` via `gf init` |
| Q5 | How much proof do you want? | off · **light** (state machines + property tests on risky stories) · standard (+ TLA+/Quint on concurrency hot spots) · deep (+ Lean on core logic) | `verify.depth` (groom can raise it per epic) |

The agent version runs as a conversation. The CLI version (`gf setup`) is the same questions with arrow-key choices and `--yes`
for defaults. Both write through **one command core** (the pattern `gf flags` already uses with the MCP tools, where
parity is structural).

### 4.3 Just-in-time settings (Stage 2), and every option in one registry

Today configuration is spread over **seven files**: `jev.config.json`, `reporting.config.json`, `live-smoke.config.json`,
`smoke-triage.config.json`, `perf-probe.config.json`, `scripts/review-config.json`, `Roadmap/fill-ins.yml` (plus `.env.local`
and `.claude/settings.json`). Fold the non-secret ones into `golden-frijoles.config.json` sections. Secrets stay in env,
and only their *names* go in config, which is the existing `live-smoke` convention.

| Setting | Asked when | Default | Mandatory | Section |
|---|---|---|---|---|
| Project mode, start point, board, verify depth | setup | see 4.2 | mode only | `project`, `board`, `verify` |
| GF account + project link | setup Q4, or the first flag/experiment/measure command | not linked | for Ship/Measure/Spend | `.env.local` (`gf init`) |
| Roadmap areas / macro-sections | first groom | `09 Platform & Infra` (reserved) plus one area named from the first seed; today `01` is an unfilled `TEMPLATE FILL-IN` | no | `roadmap` |
| WAYS-OF-WORKING fill-ins (deploy rail, language policy, tooling table) | first groom that needs one | the template's neutral text | no | `ways` (was `fill-ins.yml`) |
| Review families (codex/agy/vibe/claude) + review scope | first PR | `claude` only; scope `security-paths-only` for new users (the template's own default is `every-pr`) | no | `review` |
| Security path globs | first PR | the template's list | no | `review.securityPaths` |
| Jev rails + egress | first PR, **as an explicit yes/no about sending diffs to TypeSafe** | **off** until a key exists *and* the user said yes | no | `jev` |
| Live-smoke envs / role flows | first "verify it rendered" | `local` only | no | `smoke` |
| Chat destination (Telegram/Slack) for standup/recap/PMO | first report | none (prints to terminal) | no | `reporting` |
| Deploy provider (Vercel project) | first `vercel-prune` / deploy count | none | no | `deploy` |
| Kill-switch policy for `risk: high` | first high-risk groom | "every risk:high story names its flag" | no | `ship` |
| FinOps telemetry export | first "what did this cost?" | off | no | `spend` (writes the OTel env block) |
| Build-view mod | setup (Claude Code only) | on if function hooks are enabled | no | `.claude/settings.json` |

**Adjusting later:** `gf config` (interactive, list/get/set, `--json`) and the umbrella skill's "change a setting"
route. Both read and write the same file through the same core. `gf doctor` (already exists) grows one line per module:
*configured / not configured / could not look*. That's the three-state rule from `LEARNINGS`, applied to setup.

### 4.4 The plugin audit: what ships to whom

| Skill | Verdict | Stage | Why |
|---|---|---|---|
| **golden-frijoles** (new) | core, umbrella | 0 | the router the prompt names |
| pmf-narrative, north-star, risk-validation (new, from `references/`) | core | Think | the pre-planning chain (§5) |
| groom | core | Plan | the front door, unchanged in role |
| build view (hook) | core, Claude Code only | Build | default visualization |
| live-smoke | core | Build | agent-neutral render check |
| **verify** (new) | opt-in | Build | §10 |
| experiments / flags skills (new, thin wrappers over `gf`) | core with account | Ship | the CLI exists, but nothing teaches an agent when to reach for it |
| build-order-sync, doc-hygiene | core, silent | Plan | they keep the board honest |
| standup-post, weekly-recap, pmo-report | opt-in | Operate | needs a chat destination; prints locally otherwise |
| babysit-pr | opt-in | Operate | GitHub-only |
| prose-draft | opt-in | Operate | needs a second model family CLI |
| vercel-prune | **opt-in, provider-specific** | Operate | Vercel-only. Keep it, but it shouldn't be in the default advert |
| cross-review / cross-panel rails (`codex`/`agy`/`vibe`) | **internal toolchain → opt-in** | Build | this is your multi-vendor setup. A stranger has at most one family, so the rail must degrade to "one family + fresh reviewer" |

---

## 5. Think → Plan: the pre-planning chain

The three coaches are good content in the wrong shape. To make them product:
1. **Convert to SKILL.md with frontmatter** (`name`, `summary`, `description`, and `requires_scripts: []`). The fenced-YAML header
   isn't read by any loader.
2. **Give each an output contract** under `Roadmap/00-strategy/`: `pmf-narrative.md`, `north-star.md`, `risk-validation.md`,
   each with frontmatter (`status`, `date`, `riskiest_dimension`, `nsm`, `inputs[]`). This is the same
   "frontmatter is the machine contract" discipline the build view proved.
3. **Chain them explicitly.** Each ends by offering the next, and each reads the previous one's file. The chain is "encouraged in
   order", not enforced: groom works without them and just says so.
4. **Close the loop into the engine.** `north-star.md` → `gf north-star set` (the engine has `north_star_metrics`,
   `leading_inputs` and `/api/v1/north-star/sync`; the CLI verb doesn't exist yet). The workshop's metric becomes the
   Measure module's metric with no retyping.
5. **Groom reads them at orientation.** A seed gets checked against the riskiest dimension ("does this test the risk
   you named, or build around it?"). That's the point of Deliberate Risk Validation.

One source for the public copy too: `/northstar-self-serve.md` on the landing is already a North Star workshop. Make the
skill and that route render from one module, like `lib/methodology-chapters.ts` does for `/methodology`.

---

## 6. Visualization: the default board

**What "scrumban" means here needs writing down once.** Today the system is Shape Up bets/waves + epics + sprints + a
status board generated from frontmatter (`roadmap-status-buckets.mjs`). Scrumban adds three things: **columns as explicit
policies** (entry/exit criteria per status, which the DoD already has), **WIP limits per column**, and **pull, not push**
(a story starts when capacity frees, and the bet sets the appetite). All three can live in frontmatter + config, with no new
service.

| Option | For | Against |
|---|---|---|
| **Claude mod + `BUILD-ORDER.md`** (local default) | zero accounts, already built, agent-native | terminal-only, one person |
| **GF Roadmap Hub** (hosted default) | yours end to end, shipped, share links (team/client/investor), same account as Measure | needs an account; board/WIP view not built yet |
| SmallDocs (your fork) | yours, self-hosted on Cloud Run | the 2026-07-15 decision recorded its license/fork posture weighs against coupling the product to it; it's a document renderer, not a board |
| Notion | where many PMs already are | external; one-way only today (`template/optional/notion/`) |

**Recommendation:** make **one projector, many sinks** explicit. `roadmap-extract.mjs` is already the single projection that
`BUILD-ORDER.md`, `doc-hygiene`, `pmo-report` and the Notion push read. Give it a `sink` interface: `terminal` (default),
`hub` (default when an account is linked, pushed via `/api/v1/roadmap`), `notion`, `smalldocs`, and later GitHub Projects,
which is the likeliest third-party ask because your users are already on GitHub. Nothing is removed; the default changes.

---

## 7. Measure: TARS and a portfolio view

TARS, North Star and journeys are live and **single-project by construction**. A portfolio view is cross-project by
definition, and AGENTS.md says:

> **no request-derived read path can cross projects** … If you genuinely cannot, stop and put an explicit either/or
> decision to Daniel — **a comment or a commit message cannot amend this rule.**

So here's that either/or (D5):

| Option | Shape | Consequence |
|---|---|---|
| **A. Workspaces become the tenant** (recommended) | new `workspaces` + `workspace_members`; `projects.workspace_id`; the invariant is restated as *no tenant (workspace) observes another's data* | Clean, and it's also what billing, FinOps budgets and "one person, many products" need. It's a large migration and touches every auth path, so it's risk: high and gets its own epic |
| B. Membership-scoped fan-out | the page runs N single-project reads for projects the session belongs to | No schema change, but it is literally the thing the rule forbids on a request path |
| C. Portfolio from pushed artifacts | each project pushes a Pod Report / outcome artifact; the portfolio reads artifacts the user can see | Cheapest, stale by design, and still a cross-project read |

**What the portfolio shows** is already in your method. The landing's maker loop is *Consider · Operate · Exit*, so each
product is a row placed on that loop, with North Star + WoW, TARS stage, running experiments, open kill switches, epic lead
time (Pod Report) and spend vs appetite (FinOps). The bets table becomes cross-product: which product gets the next wave.

---

## 8. Spend: FinOps (quotes, actuals, token management)

**Actuals** are the buildable half now:
- Claude Code exports `claude_code.token.usage` (`type`: input/output/cacheRead/cacheCreation) and `claude_code.cost.usage`
  (USD) with `model`, `session.id`, `skill.name`, `plugin.name`, `agent.name`, `query_source`, `effort` attributes. That's
  per-skill and per-subagent attribution with nothing to instrument.
- **Epic attribution:** the existing session journal (`template/scripts/lib/session-journal.mjs`) records intent lines
  (timestamp, label, kind, text), but not the OTel `session.id` or the branch. Add a session-start hook that writes
  `session.id → branch`, and `feat/<epic-slug>` gives the epic. Setup writes the OTel env block pointing at GF.
- **Rule #1 applies:** usage lands through the existing ingest core (an OTLP receiver that normalizes into `/api/v1/track`
  semantics), **never a second event table or pipeline**.
- Other agents (Codex, etc.) come later through their providers' usage APIs. Jev's cost is small enough not to model.

**Quotes** close the loop with groom: an appetite (S/M/L) gets a token/$ **range** calibrated from *your own past epics'
actuals* (the Pod Report already computes epic history). Then show quote vs actual per epic, and cost per shipped story /
per experiment decision / per North Star point. That's the "value-linked unit economics" the landing promises.

**Token management** is budgets that *alert*, then *rate-limit*, then *stop* at a boundary you set. Budgets are data on the
workspace (D5 A), the same way quotas are "data, not env" today (`projects.monthly_event_quota`).

Flip `maker-ops.ts`'s `fin` surface from `unbuilt` to `gated` only when a real gate exists. The module's own comment
already forbids doing it any other way.

---

## 9. Ship: experiments a human can build

**Today.** "+ New experiment" opens `NewThingDialog`, and inside it is `ExperimentManager`: an experiment-key field, a
**24-row "Definition JSON" textarea** pre-filled with an example, and then every experiment's version table, all in the modal.
Binding a flag is a second, separate action, and it only offers flags whose variant keys match exactly (`sameVariantKeys`).
Everything the flow needs is already in the contract (`ExperimentDefinition`: hypothesis, assignment entity, eligibility,
variants + control, primary metric + direction, guardrails, segments, planned window, minimum sample).

**What the best tools do** (their docs, 2026):
- **Statsig:** name + hypothesis → primary/secondary metrics ("scorecard") → allocation % → targeting (inline, or reuse an
  existing gate) → ID type → groups & parameters → target duration via its power-analysis calculator.
- **LaunchDarkly:** name + hypothesis (with AI assist) → pick or create the flag → audience rule → randomization unit →
  allocation → variation split + control → metrics → Bayesian/frequentist → start an iteration.
- **PostHog:** a running-time calculator driven by minimum detectable effect (default 30%), a baseline taken from the metric,
  and daily exposures. It switches to live data after 1 day / 100 exposures and shows remaining time as progress.
- **Eppo:** *protocols*, pre-approved templates of metrics, methods and decision criteria, so creating a test becomes
  choosing a design.

**The design: five questions, one sentence, no JSON on screen.**

| Step (the words on screen) | What the person does | Contract fields it fills |
|---|---|---|
| 1 · What are you changing, and why? | pick a feature (or create its flag inline); fill *"We believe [change] for [who] will [raise/lower] [what] because [why]"*. An agent can draft it | `hypothesis`, flag binding (**automatic**) |
| 2 · Who's in it? | the **same rule builder flags use** (generalize the private `RuleBuilderRow`); "% of those people"; "count each [user / merchant / device]", chosen from entity types *seen in your events* | `eligibility`, `assignmentEntityType` |
| 3 · What do they see? | control + one or more versions, a split slider (50/50 default), names | `variants`, `controlVariantKey` → flag variants created to match |
| 4 · How will you know? | pick the metric from **your event catalog, with last-14-day counts and a baseline beside each name**; direction is suggested; guardrails come pre-filled from the template | `primaryMetric`, `guardrailMetrics`, `segmentFields` |
| 5 · How long? | "Detect a change of at least [10%]" slider; traffic is estimated from real exposures → **"≈ 12 days at your current traffic"** | `minimumSamplePerVariant`, `plannedWindow` |
| Review | one plain sentence: *"New copy goes to 50% of consented founding-store applicants in Mexico; it wins if completed applications rise and abandonment doesn't."* Then the checklist, then **Save draft** or **Start** | — |

**The pre-launch checklist is computed, never ticked by hand.** It covers: the flag exists and is served in that
environment; the metric event arrived in the last 24h (with the count); **the eligibility tags actually appear on recent
events**; weights are valid; the planned window ≥ the estimated duration; SRM detection is armed. The third check is the
2026-07-28 Tiendas dogfood lesson: "the v1 plan declared an eligibility tag the emitter never sends". Governance
caught it *after* launch. The wizard should catch it *before*.

**Templates (your "protocols"):** copy/CTA test, pricing page, onboarding step, and "guarded rollout" (guardrails only, no
winner). Each pre-fills metrics, guardrails and a default detectable effect.

**The readout leads with the decision:** *"New copy is ahead, +8% (range +2% to +14%). Guardrails fine, SRM clear. 60% of
planned sample, so don't call it yet."* It then hands off to the decision recorder, which already exists.

**Agents get parity, not a different product:** `gf experiments create` (interactive, or `--from plan.yaml`) plus an MCP tool,
through one command core, the way `gf flags` and the connector's flag tools already share one. JSON stays as an
agent/API export only.

**Backend it needs:** one project-scoped read, the **event catalog** (event names, last-N-day counts, baseline rate
per assignment entity, tag keys seen, entity types seen). It goes through the existing query libs (rule #1). No migration is
expected. The sample-size maths is standard (for a conversion metric, *n ≈ 16·p(1−p)/δ²* per variant at 80% power,
α = 0.05). Show it as days, not as a formula.

---

## 10. Build: the verification layer (TLA+ · Lean · Jev), re-cast so it can be built

### 10.1 What the brief assumes vs what's true

| The brief says | Reality |
|---|---|
| Jev auto-generates inductive invariants | Jev emits Choice/Score/Noul answers. **No text, no code.** A frontier model drafts invariants; TLC/Apalache checks them |
| Jev outputs Lean type definitions from TLA+ state | It can't emit a string. The **bridge is a typed spec manifest** with generators (below) |
| Jev chooses lemmas and fills proof obligations inside Lean | Proof search is generation. It's done by the frontier model + Lean's own automation, and **checked by the Lean kernel** |
| High Jev confidence → compile and deploy | **A checker verdict gates deploy, never a probability.** Confidence may *add* a human review, and never removes one. That's your own doctrine: asymmetric authority, `jev-fit-audit` §0 |
| "193× faster than traditional LLMs" | That figure compares Jev (0.4 s) against the slowest baseline in TypeSafe's table. Against TypeSafe's own peer model it's about 25×. Latency of 70–500 ms is independently confirmed. **Keep the number out of product copy** |
| Write the execution code in Lean 4 | Your customers write TypeScript and Python. Lean-as-implementation is a rare, deliberate choice for an isolated component. Lean-as-**model** (proofs + differential testing against the real code) is the proven path |

### 10.2 The pipeline that works

```
 story (groom sets verify depth) ──► SPEC MANIFEST  verify/<name>.spec.json
                                      state vars + types · actions · invariants (plain words + formal)
                                        │ generators (kit)
            ┌───────────────────────────┼─────────────────────────────┐
            ▼                           ▼                             ▼
   TLA+ / Quint skeleton         Lean `structure`s + props      TS types + fast-check arbitraries
   frontier model completes      frontier model writes proofs   property tests in the repo's own suite
            │                           │                             │
   TLC / Apalache (bounded, CI)   Lean kernel (CI)              differential random testing:
   counterexample → plain story   theorem checked or not        Lean model vs TS implementation
            └────────────── trace validation: real runs / audit rows checked against the spec ────────┘

   Jev (raise-only, logged, three-state):  does this diff touch a spec'd variable? (Noul → run the checker)
   · counterexample = spec bug | code bug | bound too small? (Choice → route) · how hard is this obligation? (Score → human sooner)
   · groom: which depth does this story need? (Choice, a suggestion the PO confirms)
```

- **The refinement mapping, in practice, is the spec manifest.** One typed vocabulary of state variables that the TLA+
  spec, the Lean model and the TS types are *generated from*, so they can't disagree about names or types. What the
  code *does* is tied to the design by **trace validation** (replay real executions against the spec's next-state relation;
  GF's `*_lifecycle_audit` and `event_delivery_attempts` tables are ready-made traces) and by **differential random
  testing** against the Lean model. That's the approach AWS used for Cedar (a formal model about a sixth the size of the
  production code, ~100M differential tests nightly, which found real bugs including one in a dependency).
- **Evaluate Veil in the spike.** It's a Lean 4 framework for verifying transition systems and distributed protocols (CAV 2025),
  which could replace "TLA+ *then* Lean" with one language for the protocol layer. Quint is the other candidate: TLA+
  semantics with developer syntax, easier for your users to read.

### 10.3 Adapted to scale: the depth ladder groom assigns

| Depth | When groom suggests it | What runs | Cost to the user |
|---|---|---|---|
| off | chores, copy, UI-only | nothing | none |
| **light** (default) | any `risk: high` story | explicit state machine in the story (states, transitions, forbidden transitions) → generated property tests | seconds in CI, no new toolchain |
| standard | concurrency or async data flow: queues, retries, leases, webhooks, sagas | + TLA+/Quint spec, bounded model check in CI, trace validation | Java or Node toolchain; minutes in CI |
| deep | pure core logic that money or access depends on: evaluators, pricing, authz, ledgers | + Lean model, proofs of the named properties, differential testing vs the implementation | Lean toolchain; a real proof effort |

The three archetypes in the brief map onto this ladder: concurrency → standard; data flow (CQRS/brokers) → standard with
trace validation; state management (ledgers, LSM-like logs) → standard for the protocol, deep for the core. Setup only
installs toolchains when a project opts into standard or deep.

### 10.4 Dogfood on Golden Frijoles first

| Target | Archetype | Property worth proving |
|---|---|---|
| Event destination router: transactional outbox, bounded retry, dead-letter, replay | data flow | at-least-once; no event lost while a sink is down; replay doesn't duplicate past the documented bound |
| Scenario leases + the scheduler exemption | concurrency | no two workers hold one lease; the exemption returns identifiers only |
| Experiment lifecycle | state | a stopped version never runs again; only a higher version can start |
| Flag activation / kill | state | kill clears every rule in that environment; "never turned on here" ≠ "turned off" |
| `evaluateFlag` / `matchesRule`, bucketing, SRM χ² | pure core → **Lean** | determinism; weights → proportions; the explanation is built from the same two halves as the verdict |

**Evidence renders in the Hub per epic, with its bounds stated:** "3 invariants model-checked to depth 12 with 3 workers;
1 theorem; 1M differential cases agreed". Never a bare "verified". That's the same honesty rule the Pod Report enforces.

---

## 11. Scenarios and drills → Mutiny

### 11.1 What's in Golden Frijoles today

- **Resilience scenarios:** a versioned definition registry; faults `none` / `delay` / `synthetic_error` delivered through
  **flag versions** (`scenario-fault-flag-summary.ts`); cohorts synthetic/internal/external; hard caps (100 requests, 5
  concurrency, 30 s lease, 2 s delay, 10 abort failures, 1 h duration); runs with leases; owner approvals.
- **Security simulations:** four *closed, defensive* templates (`malformed_payload_v1`, `rate_limit_v1`,
  `invalid_credential_v1`, `revoked_credential_v1`), all against target kind **`miyagi_resilience_probe_v1`**. It isn't
  generic yet; the target kind is Miyagi's.
- **Target ownership proof** (`scenario-target-proof.ts`, `/api/internal/resilience/ownership`): you can only exercise a
  target you've proven you own.
- **Impact evidence:** a control-vs-treatment comparison of the run window over engine telemetry.
- **Circuit breakers:** manual and automatic policies that trip a **flag**.
- Gates `RESILIENCE_SCENARIOS_ENABLED`, `SECURITY_SIMULATIONS_ENABLED` and `SCENARIO_AUTHORING_ENABLED` are OFF.
  `scenarios-pm-operable` is "in progress" in frontmatter and "shipped" by derivation (BUILD-ORDER status drift).

### 11.2 The split

| Piece | Goes to | Why |
|---|---|---|
| Security templates + runner | **Mutiny** | security verification is Mutiny's whole proposition |
| Target ownership proof, caps, closed templates, owner approvals, append-only audit | **Mutiny, as its safety kernel v0** | this is Mutiny PRD §7 (scope guardrail, non-destructive policy, audit trail), already built and reviewed |
| Resilience drills: authoring, runs, leases | **Mutiny** | chaos engineering sits with DevSecOps, not product management |
| Fault *delivery* through flags | **stays in GF** | Mutiny becomes a GF customer and injects faults through the flags API/SDK like anyone else |
| Impact evidence | **stays in GF, generalized** | "annotate a window → impact on North Star / TARS / guardrails" is useful for any run, deploy or incident. Mutiny writes the annotations |
| Circuit breakers | **stays in GF** | "stop damage without stopping work" is a flag capability, and the landing's DevOps surface lists it |

The two products stay coupled by contract, not code: **Mutiny executes and proves; GF gates (flags, breakers) and
measures (impact).**

### 11.3 Timing: freeze now, extract later

1. **Now (a small chore):** set `scenarios-pm-operable` to `archived` with the reason "transferred to Mutiny", clearing the BUILD-ORDER drift;
   keep all three gates OFF; change the landing's **SecOps** surface (`lib/maker-ops.ts`), which today lists
   "Security scenarios" and "Resilience drills" as a gated surface, to point at Mutiny as `unbuilt`, or drop to three
   surfaces. `gatedDrillNote` / `DrillGateReadings` go with it.
2. **Announce the SDK deprecation.** `@golden-frijoles/sdk` exports the scenario API (`SCENARIO_COHORTS`,
   `parseScenarioFault`, the types). Removing it is a semver-major change, so deprecate first.
3. **When Mutiny has a repo and a runtime:** port `lib/scenario-*`, `security-*`, the target proof and the SDK module; export
   the data; then run a contract migration that drops the `scenario_*` tables.

### 11.4 Where Mutiny should start, strategically

The PRD aims at enterprise CISOs with an autonomous offensive agent. That market is crowded and heavy on authorization,
and it's a different buyer from Golden Frijoles'. The asset you already have points somewhere else: **owned-target
verification for teams that ship with agents.** A PR-level CI check plus scheduled drills against *your own* staging,
gated by the ownership proof and measured in GF. It proves controls hold (authz/IDOR from the OpenAPI spec, rate limits,
credential revocation, input validation) before it tries to write exploits. Offensive PoC generation can come in phase 2,
once the safety kernel has carried real traffic. The PRD's three Jev ideas fit Jev's actual contract (they're triage and
gating, not generation). Keep the Jev safety gate **raise-only**, with the deterministic scope proxy as the hard boundary.

**Flags for the Mutiny session:** "zero false positives" and "mathematically verifies" are claims the architecture can't
back. The CLI name `strix-verify` collides with the open-source Strix project the PRD cites. The model tier table
(Qwen 2.5, Llama 3.1, Gemini 2.0 Flash) should be re-picked at design time. Mutiny can also consume §10's invariants as
security oracles later, since a violated invariant is a finding with a proof attached.

---

## 12. Gaps the brief doesn't cover yet

1. **Packaging and versioning** (§3.2–3.3): the kit, semver, a changelog, a license. Without these the prompt installs nothing usable.
2. **An account model.** No workspace/org, no billing. The dobby README says plan tiers are "written down but NOT ENFORCED".
   Portfolio, FinOps budgets and pricing all need D5.
3. **Your own activation funnel.** Instrument *installed → setup done → first groom → first epic shipped → first flag → first
   experiment decision* in GF's self tenant, and run the North Star workshop on Golden Frijoles itself. The landing sells the
   method, so the product should visibly use it.
4. **Egress and privacy defaults.** The template ships `jev.config.json` with `egress: true`. For strangers, sending diffs to a
   third party must be an explicit yes. The FinOps OTel export should be **metrics only** by default, never prompt logs.
5. **Permissions.** Installing a plugin doesn't install your allow/deny list (`.claude/settings.json`, the permissions
   ledger, the `supabase db push` / `vercel deploy` denies). Setup should offer it.
6. **The default visualization rides a pre-release flag** (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`). It needs a fallback: a
   status line, a SessionStart summary, or `gf board` in the terminal.
7. **Non-Claude agents** get skills without hooks or agents. Say so in the umbrella skill and on `/install`.
8. **Role assumptions.** Skills say "the product owner" and "Cowork plans, Claude Code builds". A solo maker is both people,
   in one tool. The wording has to hold for one person.
9. **Vocabulary.** The landing and `/methodology` say *Consider · Operate · Exit* and **Design** (not Shape). The plugin speaks
   Shape Up (appetite, bets, shaping). Pick one and sweep, the way `lib/positioning.ts` did for the category name.
10. **Strangers read SKILL.md.** The skills carry a lot of house history (incident anecdotes, internal PR numbers). That's
    right for you and noise for a new user. Move it to `references/` (progressive disclosure) and keep SKILL.md
    about the job.
11. **Multi-repo projects.** Reporting's `repos` list assumes you know them. Setup should discover them (git remotes, a monorepo's
    workspaces) and confirm.
12. **Offboarding.** Say what uninstall leaves behind (`Roadmap/` stays, because it's theirs) and how to export engine data.

---

## 13. Decisions needed from you

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Identity: GitHub org/repo, marketplace name, plugin name | `golden-frijoles/skills` · `golden-frijoles@golden-frijoles` (check the org name is free) |
| **D2** | Repo strategy for the public plugin | transfer + rename `dobby-foundation` → `golden-frijoles/skills` (history, CI and guards come along; GitHub redirects the old URL); internal-only toolchain becomes opt-in |
| **D3** | How skills get their scripts | `@golden-frijoles/kit` on npm, pinned per plugin release; only project-owned files stay copy-once |
| **D4** | Default board | Claude mod locally + Roadmap Hub hosted; Notion and SmallDocs as sinks; SmallDocs stays out of the product's critical path (re-affirms 2026-07-15) |
| **D5** | Tenancy for portfolio/FinOps | **A: workspaces become the tenant**, with the invariant restated at workspace level. This needs your explicit amendment to AGENTS.md |
| **D6** | Scenarios | freeze now (archive + landing copy + SDK deprecation notice); extract when Mutiny has a repo |
| **D7** | Formal methods | a spike on GF's own outbox + flag evaluator first; TLA+ vs Quint vs Veil chosen by the spike; no landing claim until it ships |
| **D8** | License and price posture of the public plugin | open-source the plugin + kit (the funnel), keep the engine proprietary. The alternative is source-available. Either needs a written choice before the repo goes public |

---

### Decisions of record — approved by Daniel, 2026-09-23 08:09 (America/Mexico_City)

All eight recommendations above were approved as written ("all approved; D1 through D8 use the suggested options"):

- **D1** — identity is `golden-frijoles/skills`, marketplace `golden-frijoles`, plugin `golden-frijoles` (org-name availability still to be confirmed at build).
- **D2** — `dobby-foundation` is transferred and renamed to `golden-frijoles/skills`; the internal toolchain becomes opt-in.
- **D3** — skills get their scripts from `@golden-frijoles/kit` on npm, pinned per plugin release; only project-owned files stay copy-once.
- **D4** — the default board is the Claude mod locally plus the Roadmap Hub hosted; Notion and SmallDocs are sinks; SmallDocs stays off the product's critical path.
- **D5** — **workspaces become the tenant.** This is the explicit either/or the tenancy invariant in `AGENTS.md` requires. The rule text itself is amended by the workspaces epic (Seed 7), in the same change that introduces the table — not before, and not by this note.
- **D6** — scenarios are frozen now (archive, landing copy, SDK deprecation notice) and extracted when Mutiny has a repo.
- **D7** — formal methods start as a spike on Golden Frijoles' own outbox and flag evaluator; TLA+ vs Quint vs Veil is chosen by the spike; no landing claim until it ships.
- **D8** — the plugin and kit are open-sourced (the funnel); the engine stays proprietary. The specific license is picked in Seed 1.

---

## 14. Sequencing, and when to groom

**Start grooming as soon as D1–D4 are answered.** Seeds 1–3 don't depend on the tenancy or formal-methods decisions. Groom's
own rule holds: pitch first, scaffold only on approval.

| Wave | Seed | Class · appetite · risk | Depends on | Lives in |
|---|---|---|---|---|
| A | **1 · One plugin, one install**: identity, umbrella skill, kit, prompt module + parity, alias migration, semver | Feature · L · high | D1–D3 | dobby-foundation → skills repo |
| A | **2 · Experiments for humans**: guided flow, event catalog read, auto-bind, sample size, templates, `gf experiments` | Feature · M · low (no migration) | none | golden-beans |
| A | **3 · Scenarios freeze**: archive, drift fix, SecOps copy, SDK deprecation, Mutiny handoff | Chore · S · low | D6 | golden-beans |
| B | 4 · Setup and config: interview, `golden-frijoles.config.json`, `gf setup` / `gf config`, doctor lines | Feature · M · medium | 1 | both |
| B | 5 · Think skills: convert the three coaches, output contracts, `gf north-star set`, groom reads them | Feature · S–M · low | 1 | skills repo + CLI |
| B | 6 · Verify spike: outbox spec + evaluator in Lean + differential testing; Jev triage questions in shadow | Spike · S · low | D7 | golden-beans |
| C | 7 · Workspaces | Feature · L · high | D5 | golden-beans |
| C | 8 · Board sinks + scrumban on the Hub | Feature · M · medium | 1 | both |
| C | 9 · FinOps actuals (OTel receiver → ingest, attribution) | Feature · L · high | 7 for budgets | both |
| C | 10 · Portfolio view | Feature · M · high | 7, 9 | golden-beans |
| D | 11 · FinOps quotes · 12 · Verify module (productized) | M · L | 9 · 6 | both |

**The concrete next step:** answer D1–D8 (inline is fine). Then run `groom` on Seed 2 in `golden-beans` (it needs nothing
else) and on Seed 1 in `dobby-foundation`. Seed 3 can go straight to a chore PR.

---

## Sources

- Claude Code plugin marketplaces (marketplace name, `claude plugin install`): https://code.claude.com/docs/en/plugin-marketplaces
- Claude Code monitoring (OTel metrics and attributes): https://code.claude.com/docs/en/monitoring-usage
- `npx skills` (skills only, no hooks; reads plugin manifests): https://github.com/vercel-labs/skills
- TypeSafe Jev docs (Choice/Score/Noul; no text or code): https://docs.typesafe.ai
- An analysis of the 193×/445× claims: https://pearpages.com/blog/2026/09/16/jev-sorted-what-typesafes-system-one-model-actually-is-and-what-is-still-just-a-claim
- Statsig, create an experiment: https://docs.statsig.com/experiments/create-new
- LaunchDarkly, creating experiments: https://launchdarkly.com/docs/home/experimentation/create
- PostHog, running time and sample size: https://posthog.com/docs/experiments/sample-size-running-time
- Eppo, experiment protocols: https://docs.geteppo.com/quick-starts/analysis-integration/defining-protocols/
- Cedar, verification-guided development: https://www.amazon.science/blog/how-we-built-cedar-with-automated-reasoning-and-differential-testing
- Veil (Lean 4, transition systems): https://veil.dev/ · CAV 2025 paper: https://dl.acm.org/doi/10.1007/978-3-031-98682-6_2
