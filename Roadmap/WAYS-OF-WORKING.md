<!-- GENERATED FILE — do not edit by hand.
     Source: Roadmap/WAYS-OF-WORKING.template.md + Roadmap/fill-ins.yml
     Regenerate: node scripts/render-ways-of-working.mjs   (CI checks it with --check)
     Shared process text belongs in the .template.md; this project's own belongs in fill-ins.yml. -->
# Ways of Working

How the product owner and Claude (builder) ship product together. Small slices, plan first, ship
the moment each slice works — and each slice is a piece of the final product, never a test of it.

## Roles and the unit of work

The **product owner** sets direction, approves plans, tests each shipped slice and makes the consequential
calls (architecture forks, infra, money). **Claude** researches, proposes the plan as user stories,
builds, verifies, ships and documents.

Everything is sliced into **user stories** — the smallest independently testable, shippable value: *As a
\<role\>, I want \<capability\>, so that \<outcome\>*, plus **acceptance checks the product owner can
run**. Stories roll up into sprints, sprints into an epic, epics into a macro-section. Before building,
check whether existing features plus communication already deliver the outcome — surface that lighter
path first; `groom` gates on it (Stage 2.5).

## The cadence

```
Plan → branch + scaffold docs → build story → verify → QA/smoke → PR → review → merge (= deploy) → close
```

1. **Plan.** Non-trivial work goes through plan mode as user stories, approved before code, naming its
   QA/smoke stage. **A reference end-state is inspiration — an APPROVED design is scope.** ⚠️ *Amended 2026-08-29 (`design-system-rails`, from `console-ia-overhaul`'s A20/A22).* This sentence used to read "reference end-states are inspiration, never signed-off scope", full stop, and **that is why the console shipped looking nothing like the design the product owner approved.** Every acceptance criterion in that epic's first two sprints was *structural* — "the header renders one project switcher and four sections" — the build satisfied **all** of them, and it looked like a different product. Nothing in the plan could go red on a page that looked wrong. The rule exists to stop a *speculative spec doc* being treated as committed scope, and it still does. It does **not** apply to a design the product owner has explicitly approved: **where the product owner has approved a design, the design IS the contract**, it is binding on every route it covers, and there must be an assertion that can fail on the way a page looks. A builder cannot hit a visual target described in prose.
2. **Branch + scaffold.** One branch per epic (`feat/<slug>`, or `fix/…`, `chore/…`) off the latest
   `main`, in each repo you touch. Scaffold the epic `README.md` + `sprint-N.md` *before* any code, so
   the product owner sees scope as it grows, and keep them current (✅ ticks, commit refs).
3. **Build one story at a time.** Reuse before rebuild. Commit per story, **path-limited**.
4. **Verify + QA.** The deterministic gate — typecheck, lint, build, the suite — is green **before**
   merge, run by the building agent, not only by CI. **Deploy rail.** Merging to `main` is the deploy: Vercel's GitHub integration builds production on every
merge, and each PR gets a Vercel preview the Playwright harness runs against. **Never `vercel deploy` from
the CLI** (AGENTS rule #4; it is on the deny list). An env-var change reaches running functions only on a
**redeploy**, so verify by exercising the behaviour the var controls. **Supabase migrations are a separate,
deliberate step** — applied through the Supabase MCP by an agent, or `supabase db push` by the product
owner by hand; nothing migrates on merge.
5. **PR → review → merge.** Declare a risk tier, run the review the policy asks for, resolve or answer
   every finding, merge on green. **Merging to `main` is the production deploy.** Delete the branch.
6. **Close.** Sprint close: the sprint-wrap summary. Epic close: the Definition of Done below.

## Epic-mode builds — the default for a scaffolded epic

A whole epic in one orchestrated session is the normal unit of work; sprint docs are integration and
rollback boundaries *inside* it (a per-sprint session stays valid for a one-sprint epic, or when a sprint's
outcome genuinely changes the next one's scope). Six things make it work, and the first is the leverage:

1. **Lock the architecture before any builder starts** — numbered decisions `D1…Dn` in the epic README
   plus a per-sprint **"Build contract (locked by the architect before the builder started)"**, each
   verified **against live code and live data**. Builders *cite* them; a paraphrased contract drifts
   permissive. The lock must **disprove scope** (an acceptance criterion describing a guard, table or flag
   the live system lacks is fiction — saying so is a success), **query the live data** (row counts decide
   what is safe: a schema fork that is free while a table is empty is only free then), **name every
   deviation** in the README, and **say where each contract lives, once** — import the rule, never
   restate it.
2. **Stack the branches** — `feat/<slug>` → `-s2` → `-s3`, one PR per sprint (a single PR only when the
   sprints don't split along a review boundary), merged in order; sprints share hot files, so stack or
   pay. **Never delete a base branch while a stacked PR is open** — GitHub closes that PR for good.
3. **Route models by risk, invert for review** — the contract-defining sprint to the stronger model, the
   mechanical ones to the faster, the riskiest PR's fresh reviewer to the strongest; state the routing in
   the epic README. Findings route back to the original builder, whose context makes fixes cheap.
4. **Merges are pre-authorized on green** in a named run: that removes the round-trip, not the gate or the
   review layers, and never extends to a new category of production mutation (TLS/IAM/secrets, money or
   entitlement writes, a new external dependency) — name those in one focused question.
5. **Generate the kickoff, don't compose it** — `node skills/groom/emit-epic-kickoff.mjs --epic <slug>`
   (the `groom` skill) reads the epic README and every sprint file and prints the orchestrator prompt.
   Hand-composing it is how the architecture lock gets summarised away and the review policy silently
   reverts to whatever the composing agent remembered.
6. **Derive state, journal intent** — re-derive branches, worktrees, open PRs and migration drift at
   session start; journal each locked decision. A killed worker's agent is resumed with a one-paragraph
   state recap (its actual `git status`/`diff`), not re-spawned cold.

*Done* means **shipped**, not merged: a merged PR that has not deployed, a migration written but not
applied, a flag that exists only in code are none of them done. With a migration: apply it **before**
merging, verify live, merge, then confirm the deploy succeeded.

## Betting & appetite

Appetite is denominated in **sessions** — with agents the binding constraints are product-owner attention
and session context. Fixed appetite, variable scope.

| Appetite | Buys | Circuit breaker |
|---|---|---|
| **S** | one builder session; fixed scope (a bug, a chore, a clear story) | escalate-don't-guess — no hard breaker |
| **M** | one wave: an architect session + builder fan-out + review rounds | appetite exhausted → stop, back to shaping |
| **L** | a multi-wave epic | per-wave: each wave is re-bet at the boundary |

Four rules: **an exhausted bet returns to shaping**, never extends in flight; **nothing reaches
`status: queued` without an `appetite:` and an `underwritten_by:` wave**; **bets are placed at wave
boundaries** into `Roadmap/bets/<wave>.md`, three lines each, recording what they displaced; and **uphill
work stays on the strongest model**. Not every ask earns the betting table — `groom` sorts shaped bets
from fixed scope (appetite S, straight to a builder) and reactive/ops work. Why it works this way:
[`references/shapeup/`](https://github.com/danybgoode/dobby-foundation/blob/main/template/references/shapeup/README.md).

## Review & merge

The deterministic gate is the gate. Everything else is judgment, and it is reads that answer **different
questions** — not more reviewers of the same kind.

```
CI (deterministic gate)            — does it build, typecheck, pass the suite?   BLOCKS merge
  → fresh pr-reviewer subagent     — context independence: did not hold the diff
  → one external cross-family pass — family independence: different blind spots
  → + a lean security lens         — when the diff touches a security path
  → the builder merges on green
```

**Which PRs**: `scripts/review-config.json` → `reviewScope` — `every-pr` (all non-trivial PRs;
`--skip-trivial` drops docs-only and tiny diffs) or `security-paths-only`. The **security lens** is
triggered by a `securityPaths` glob or a `risk: high` body in either scope — paths, not judgement, so a
builder can add it but never skip it. **Here `reviewScope` is `every-pr`**: the fresh `pr-reviewer` and the external general pass run on every non-trivial PR.

**Who reviews** is printed by `node scripts/review-route.mjs --builder <who> <PR#>`, never picked by hand:
the highest-preference family that did **not** build the diff takes the general pass, the next takes the
security lens (`codex → agy → vibe → claude`; a capped family falls through with `--exclude`). One family
left runs both prompts and says so in the PR body; none left means the layer is **DARK**, said out loud.

**A silent reviewer is a FAILED run, not a clean one**: the run asserts the reply carries real review
structure, posts `pending` before the CLI is even checked, pins the reviewed sha, and otherwise prints the
full reply, exits non-zero and fails the PR's `cross-review/<lens>` status. Both readers share one prompt
(`scripts/cross-review.prompt.md`): one pass, a `file:line` citation or the finding is not posted, at most
3 nits, skip what CI enforces, Blocking/Should-fix only on a re-review. `/security-review` is available
locally as a pre-push self-check, never a gate. Why this shape:
[`references/review-stack.md`](https://github.com/danybgoode/dobby-foundation/blob/main/template/references/review-stack.md).

**Every finding is fixed or answered on the PR; neither pass authorizes anything.** **HIGH** = money
(payments, checkout, fulfillment), auth and authorization boundaries, tenancy, DB migrations, shared infra;
**LOW** = the rest; unsure means HIGH. The **builder merges their own PR at every
risk tier** once CI is green and findings are resolved — the tier selects the review
scope, not the merge authority. Roll back with `git revert` on `main`.

**A deterministic security floor runs underneath, free and without an LLM:** GitHub secret scanning with
push protection (enabled 2026-09-16) and this repo's CodeQL workflow. The security lens finds logic flaws —
a cross-project read, a lost update, authorization gated on the wrong thing; the scanners find known
patterns and leaked credentials. Neither replaces the other.

## Escalate, don't guess — the ONE trigger list

Stop and hand back to the planning tier — rather than inventing an answer — on any of:

> **money (payments, checkout, fulfillment) · auth and authorization boundaries · tenancy · DB migrations ·
> shared infra · plan ambiguity · a decision the plan doesn't cover · 2+ failed attempts at the same
> problem.**

Default to escalate when unsure. This is a **model-routing** trigger, not a merge gate. Everywhere else
that needs this list references it here; there is no second copy.

## Permissions — what an agent may do unattended

`.claude/settings.json` carries a committed `permissions` block: **allow** = verb classes only (never a
literal past command, and never one that destroys uncommitted work — an allowed command skips the
auto-mode classifier); **deny** = the irreversible-by-rule (CLI deploys, migration replays, force pushes and
protected-branch deletes, `rm -r`, whole-tree staging, edits to generated files, and the few repo scripts
that write production secrets from inside an allowed `node scripts/*`); **ask** = production secrets, env
writes and a service deploy. Deny and ask rules are carried in **three spellings** — bare,
assignment-prefixed and `env`-prefixed — because a leading assignment escapes a bare rule, and an escaped
*ask* is not a stricter outcome but a silent downgrade to the classifier.
Every deny/ask rule cites what it enforces in `.claude/permissions-ledger.json`, and
`node scripts/permissions-smoke.mjs` fails on an uncited rule, a stale ledger entry, a literal allow or a
missing baseline guardrail.

**Three actions get one focused question before you take them** — about irreversibility, not review: a
destructive or hard-to-reverse change to live data; real money or a third party's metered resource;
production secrets/IAM/DNS/TLS. The `ask` rules make that prompt automatic for the commands that do it.

**Auto mode is a USER setting** (`~/.claude/settings.json`): the same line in
a project file is ignored *and* masks the user default, so the smoke fails on it. A deny rule matches the
command an agent normally writes — it is not a sandbox: a leading assignment with an expansion
(`PATH=/x:$PATH vercel deploy`) was observed escaping a bare rule, so the critical rules carry an
expansion-safe form and the auto-mode classifier is the second floor.

## Definitions of Done

**A story can start** when its "as a / I want / so that" is clear, its acceptance check is testable, and
it ships on its own.

**A story is done** when acceptance criteria are confirmed working; typecheck, lint and build are clean;
the real behaviour is **smoke-tested** end to end (never "build passes, therefore done" — an untestable
gap is stated in the PR, not glossed); **every new spec has been observed failing once** via a deliberate
mutation, so it is not a tautology; and the sprint doc is ticked.

**An epic is done** when `node scripts/epic-dod.mjs --check <macro/slug>` passes — it derives the
mechanical half (sprints merged, README `status: shipped`, sprint statuses ticked with refs, a real
retrospective, no leftover branch) — **and** the judgment items below are true:

- [ ] The **product poster** reflects what is now live (✅ = enforced in code).
- [ ] **`RETROSPECTIVE.md`** says what actually happened, and its durable learnings are promoted into
      `Roadmap/LEARNINGS.md` — sharpen the existing line, don't append a near-duplicate.
- [ ] **Each sprint has a smoke walkthrough** a person can follow blind, with real URLs; money/auth steps
      are flagged by name as owed to the product owner.
- [ ] **Team memory** (and its index, if your tooling keeps one) records the epic.
- [ ] **Kill-switch — only if one was planned at grooming:** the flag exists with the polarity the scope doc stated (the rule: `groom/references/kill-switch.md`). This verifies planned work; it is not a new build-time gate.

## Automated QA

The harness grows by **one spec per browser-/API-testable story** — coverage accretes with the work. Two
layers: an **`api` project** that is the deterministic gate (no browser binaries, runs on every PR, green
before merge), and an opt-in **`browser` project** for rendered UI an API call can't see (nightly or on
demand, never the gate). A browser spec replaces a browser smoke previously owed to the product owner.

## Documentation map

**`Roadmap/`** is the product source of truth in plain language (macro-section → epic → sprint → story,
plus the poster); **`LEARNINGS.md`** is the cross-epic digest, read at session start and fed at every
close; **`Roadmap/00-ideas/`** is the funnel — `seeds/` (lifecycle in frontmatter, never folder-shuffled),
`audits/`, and the **generated** `BUILD-ORDER.md` (`node scripts/build-order.mjs`, never hand-edited).
**Status SSOT = each epic README's frontmatter `status:`**; the board and any external projection are
derived views. **`Roadmap/bets/`** holds one file per wave; **`tasks/`** is the engineering delivery log.

## Conventions

- **Gitflow.** Branch off `main`, commit per story, PR → merge. Never commit feature work straight to
  `main`; never force-push a shared branch; merge latest `main` in before opening the PR.
- **Path-limited commits.** `git add <specific files>` then `git commit -- <those paths>` — never
  `git add -A`. Several agents share a checkout, so whole-tree staging commits a sibling's in-flight
  work. The deny list enforces it; parallel planners take their own `git worktree` or appoint one scribe
  for shared files like `BUILD-ORDER.md`.
- **Docs track code — verified, not generalized.** A canonical rule must reflect what the code actually
  does, checked against it — and a scoped learning is not globalized into a site-wide rule. On the poster
  ✅ means enforced in code, 🚧 partial or aspirational. Run a light drift audit periodically.
- **Parallel agents and async deploys.** `main` moves under you: merge latest `main` into a long-running
  branch; when repos deploy at different speeds, merge the data-producing repo first and make the consumer
  degrade gracefully.
- **Worker death is a normal case.** Each builder on its own worktree; a killed worker's uncommitted tree
  is evidence, not garbage; **verify by re-deriving repo state, never by trusting a completion report** —
  a rate-limited subagent still returns a plausible-sounding result. Compact at sprint/PR boundaries; for a
  big epic consider a fresh session per sprint.
- Commit messages end with the `Co-Authored-By: Claude` trailer.
- **Language.** Docs are written in **English** — everything under `Roadmap/`, `tasks/`, code
  comments, and PR descriptions. **App copy is English too** (the landing renders `<html lang="en">`);
  Golden Beans is a standalone English-language product with **no bilingual requirement** — do not
  introduce a locale/translation layer or make a surface bilingual without a deliberate scope decision
  that says so. (This differs from the Miyagi sibling, whose app copy is es-MX with an es/en
  allow-list — that policy is theirs, not this repo's.)

## Epic-mode, model routing and delegation — this project's specifics

**What the epic-sized handover changes here (adopted 2026-07-25):**

1. **One architect, many builders.** The coordinating agent owns the plan, the architecture calls and
   the merges. It does **not** hand-build every story. It classifies each story by complexity and
   type, then dispatches builders — see the routing table below.
2. **Assembly line, not a relay.** Read-only research on an external dataset, doc scaffolding and
   independent stories run in **parallel, in the background**, while the architect works the critical
   path. Anything touching shared surface (CI config, `package.json`, lint config, a `lib/` seam
   several stories import) is done **first and by the architect**, because its blast radius is every
   branch opened after it.
3. **Surface scope-breaking findings the moment you have them, then keep building.** An epic-sized
   handover means research can invalidate a premise written weeks ago. Put the decision to the
   product owner as an explicit either/or **with a recommendation**, record the answer as a dated
   **amendment in the epic README** (never a silent reinterpretation), and meanwhile finish
   everything that does not depend on the answer. Worked example: pod-report's
   "human-baseline vs agent-augmented eras" spine, which the dataset could not support — amended
   2026-07-25 to published-benchmark baselines.

### Routing a build by model tier

The point is to spend the expensive model where judgment compounds and the cheap one where the work
is mechanical — not to use one tier for everything.

| Work | Tier | Why |
|---|---|---|
| Grooming, architecture, the epic plan, merge decisions, review triage | **Strongest** (the coordinating agent) | These are the decisions everything else inherits. |
| Shared-surface changes: CI, lint config, `package.json`, a `lib/` seam many stories import | **Strongest**, done FIRST | Highest blast radius; a mistake here breaks every later branch. |
| A well-specified story with a clear acceptance check | **Mid** (Sonnet-class subagent) | Bounded, verifiable, cheap to re-run. |
| Read-only research / data-availability reports over a large or foreign codebase | **Mid**, background, parallel | Fan-out with no write conflicts. Ask for an explicit "NOT DERIVABLE" list — an honest gap beats an optimistic guess. |
| Money · auth · migrations · tenancy · concurrency | **Strongest**, never delegated | Same tier that decides who merges. |
| PR review — the judgment layers (CI is the gate; reviews authorize nothing) | **The routed external pass**, the fresh `pr-reviewer` and, when paths trigger it, the security lens | See *Review & merge*. Findings are resolved or answered before merge. |
| File-derived prose: retro, poster entry, sprint wrap, the merge report | **Devin — the dedicated prose writer**, with Agy `gpt-oss-120b-medium` as fallback | Devin owns prose so Codex/Agy quota stays free for review and building. **One** prose model, never a Gemini one — a model-level fallback between registers is what silently changed every report's voice (see `PROSE_MODEL`). **Always read the draft.** |

### Verifying delegated work — the rule that is not optional

**A subagent's final message is not evidence.** A subagent that dies mid-task (a shared session
rate-limit will do it) still returns a plausible-sounding `result`, and that text is just its last
tool-call narration. Always re-derive state yourself: `git status`, `git diff HEAD`, then the
type-checker and the test suite.

This is not theoretical. On 2026-07-25 a subagent building the unit-test layer died mid-**mutation**
and left `apps/web/lib/webhook-signature.ts` with `timingSafeEqual` replaced by `a === b` — a real
security regression sitting in the working tree, reported by the agent's own last words as ordinary
progress. `git diff HEAD` found it in seconds. **After any subagent batch, diff the tree for source
files it should not have touched**, and re-run at least one mutation check yourself rather than
trusting a claim that they were run.

## Shipping a merge

Merging to `main` is the deploy. The GitHub workflow continues to send its mechanical 📦/🚀 pings when
Actions capacity is available; it is not the prose rail.

The **product report** runs locally because Devin and Agy use interactive OAuth and cannot run in a
GitHub runner. Install the user-scoped runner once on the always-on Mac:

```bash
node scripts/install-main-report-daemon.mjs
node scripts/install-main-report-daemon.mjs --status
```

It fetches `origin/main` every five minutes without changing the checked-out branch, reports only
first-parent mainline commits (one merged PR, not every commit inside it), and advances its local
baseline only after Telegram **and Slack** accept the same report. Each accepted destination is
checkpointed per commit, so a partial failure retries only the missing channel with the exact same
prose. A failed writer, fetch, or post is visible in
`~/Library/Logs/golden-beans-main-report.log` and is retried on the next interval. Credentials remain
in the ignored root `.env.local` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CICD_CHAT_ID`, and
`SLACK_WEBHOOK_URL`); they are never put in the plist. The GitHub `SLACK_WEBHOOK_URL` secret powers
the Actions workflow but cannot be read back by this local runner, so the local env entry is a
separate required setup step. Git hooks remain an immediate best-effort trigger, but the runner is
the durable retry path even when merges happen on GitHub and this checkout stays on a feature branch.

Use `node scripts/report-main-daemon.mjs --dry-run` to see pending reports without calling a writer or
either channel. The guard still labels its model and blocks known unsupported claims before delivery.

## Cadence, Definitions of Done and conventions — this project's specifics

- **Draft → ready.** **Flip the PR draft → ready-for-review the moment the deterministic gate is green and the self-QA note is posted** (updated 2026-07-15): a draft means *still building*, ready means *review me* — this is also what the roadmap board's Lifecycle overlay reads (draft PR → In progress, ready PR → In review), so leaving finished work in draft hides it in the "In review" column. Set the sprint doc's `Status:` line to `🟦 In review` at the same moment.
- **Product poster — `Roadmap/README.md`.** Find the epic's macro-section in the **Feature map** and update its line(s) to reflect what's now live (✅), and add a **Recent highlights** entry.
- **Landing backfill (the public-offer contract, adopted 2026-07-14):** if the epic changes the
  public offer, its landing-page section ships or updates **in the same epic** — flip the
  section's 🔜 badge / content toward the end-state (`references/landing-end-state.md`). Like
  the poster rule: the public page never claims ✅ for unshipped work, and never lags a shipped
  one.
- **Grooming cadence (updated 2026-07-14):** with a strong planning model (Fable-class), the
  default is a **single-session groom** — one deep Definition-of-Ready groom for the front-of-queue
  epic *plus* a portfolio pass that seeds/resequences the rest of the funnel — rather than one seed
  per session. The groom skill's discipline (stages, scope-doc gate, one *deep* ask per run) is
  unchanged; what batches is the funnel bookkeeping. Deep-groom later epics only when they reach
  the front. Build sprints stay session-sized — versions may supersede in the immediately-next
  sprint, so keep per-sprint kickoffs thin and let the epic docs carry state.

## Tooling

| Tool | Used for |
|------|----------|
| **git / gh** | Version control, feature branches, pull requests + merges, GitHub operations |
| **node / npm** | Type-check (`tsc`), build (`npm run build`), Playwright (`npm run test:e2e`), local dev server, the `scripts/*` tooling |
| **vercel** | Env-var management (`vercel env pull/add/ls`) + reading deploy state. **Never** `vercel deploy`/`--prod` — merge to `main` is the deploy (rule #4); check state via `gh api repos/<owner>/<repo>/deployments`. |
| **supabase** | Migrations against linked project (`supabase link` / `migration list`; apply via the Supabase MCP — `db push` is denied to agents by `.claude/settings.json`, the product owner may run it by hand) and read-only prod queries (`supabase db query --linked "select …"`, uses the CLI's own auth — no service-role key in the shell). A separate, manual step from the Vercel deploy. |
| **codex / agy / vibe / claude** | The external review families, in preference order — **routed, never hand-picked**: `node scripts/review-route.mjs --builder <who> <PR#>` prints the general pass and, when the paths trigger it, the security lens by a different family (see *Review & merge*). Health and pins: `node scripts/agy-doctor.mjs`. **devin** does prose, not review; **cursor-agent** is not wired into review. |

This means a story can go from code → verified → preview-deployed → live-tested on a branch, then
merged to production via PR — with verification at each step.

Actions that touch live production, real money, or paid infrastructure are surfaced to the product owner
before running.
