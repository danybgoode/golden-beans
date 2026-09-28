# Audit — the dobby-foundation operating system, 2026-09-16

**Scope:** `dobby-foundation` (the plugin + template), read against `medusa-bonsai` (the origin
project, now far ahead of it) and `golden-beans` / Golden Frijoles (the second consumer, and the
flag provider we want to standardise on). Cross-referenced against
`references/Steps-of-AI-Adoption.md` and present-day (Sept 2026) code-review tooling.

**Read:** `dobby-foundation` in full (87 files, 9,423 lines of md/mjs/json/yml) · `medusa-bonsai`
`scripts/` (71 files), `.githooks/`, `.claude/`, `Roadmap/09-platform-infra/` (54 epics) ·
`golden-beans` `AGENTS.md`, `packages/sdk`, `apps/web/app/api/v1/**`, `Roadmap/` ·
`Steps-of-AI-Adoption.md` · Claude Code Code Review docs · 2026 AI-review literature.

---

## 0. The one-paragraph verdict

The operating system is **good and it is overbuilt**. It was written for a Step-1 world — one agent,
low trust, read everything — and then hardened epic after epic, so every lesson became another
paragraph rather than replacing one. The result is a 446-line `WAYS-OF-WORKING.md` and a 514-line
`groom` SKILL.md that together take ~14k tokens to load before a builder writes a line of code, and
a review stack that pays three times for what the platform now does once. Meanwhile the *actual*
Step-2→3 unlocks named in the ladder — automate code review, pre-approve permissions, let Claude
kick off Claude, routines — are the parts we've built least. **The training wheels to remove are not
the guardrails. They are the manual re-implementations of things the platform now ships.**

---

## 1. Ceremony — what is actually costing us

### 1.1 The load-bearing docs have grown past their own advice

| Doc | Lines | What it should be |
|---|---|---|
| `template/Roadmap/WAYS-OF-WORKING.md` | 446 | ~150. It is read at the start of *every* builder session (the kickoff's invariant preamble names it) |
| `plugins/ways-of-work/skills/groom/SKILL.md` | 514 | ~200. Progressive disclosure: stages in `SKILL.md`, the question bank / archetype table / kill-switch taxonomy in `references/` |
| `template/Roadmap/SESSION-KICKOFFS.md` | 302 | ~80 |

`LEARNINGS.md` itself warns about token diet and `medusa-bonsai` even ran an epic called
`process-token-diet` — and the process docs are the largest single un-dieted context cost in the
system. **The irony is the finding.**

Concretely bloated passages, all in `WAYS-OF-WORKING.md`:

- **"Epic-mode builds"** — 9 paragraphs saying five things: lock D1..Dn, stack branches, route models
  by risk, pre-authorized merges, derive-don't-store. Those five sentences *are* the section.
- **"Betting & appetite"** — 14 paragraphs + a table for a rule that is: appetite S/M/L in sessions,
  circuit breaker on exhaustion, three lanes, `underwritten_by` on the board. The Shape Up
  philosophy lecture belongs in `references/shapeup/`, not in the file every builder loads.
- **"Review & merge"** — 21 paragraphs. See §3; most of it is about to be deleted anyway.
- **"Conventions"** — 12 bullets, several of which are one-time environment facts (planning commits
  need path-limited adds; give each planner a worktree) that belong in a *hook or a guard*, not in
  prose a builder has to remember. **A rule stated in prose that could be a check is ceremony.**

### 1.2 Rules that duplicate themselves across surfaces

The escalate-don't-guess trigger list (money / auth / migrations / shared infra / ambiguity / 2+
failures) appears **four times**: `WAYS-OF-WORKING` → *Model tiers*, `WAYS-OF-WORKING` → *Review &
merge* risk tiers, `groom` Stage 6, and the emitted kickoff prompt. Three of those say "one SSOT,
don't fork a second copy here" — while being the fork. Same for the kill-switch polarity rule
(`groom` Stage 6b, the seed template, the epic DoD, and `medusa-bonsai/scripts/flags.mjs`'s header).

### 1.3 Ceremony that no longer earns its keep

- **The sprint-end smoke walkthrough written by hand into `sprint-N.md`.** A numbered, prose,
  "click this → see that" walkthrough per sprint. `medusa-bonsai` already has `prod-smoke.mjs`,
  `credentialed-browser-smoke`, and a Playwright `browser` project. The walkthrough is a **1-era
  artifact** (a human does the verification because the agent can't). Keep it *only* for the
  money/auth steps that genuinely can't be automated; generate the rest.
- **`RETROSPECTIVE.md` + `LEARNINGS.md` promotion as two manual steps.** The retro is written, then
  a human-ish "promote the durable learning, dedupe, don't append a near-duplicate" pass. That is a
  skill, not a checklist item.
- **Three separate status surfaces** — epic README frontmatter `status:`, the generated
  `BUILD-ORDER.md`, and the Notion projection via `roadmap-to-notion.mjs`. The first is SSOT and the
  other two are derived, which is right — but `doc-hygiene`, `build-order-sync` and `doc-format`
  are three skills/scripts policing one invariant.
- **The "Definition of Done (an epic)" 9-item checklist.** Items 1, 3, 5, 6, 9 are all derivable
  (`git`, frontmatter, file existence). Only the poster update, the retro and the kill-switch
  verification need judgement. **Make the derivable five a script (`epic-dod.mjs --check`) and leave
  three lines of prose.**

### 1.4 The cheapest single win

`WAYS-OF-WORKING.md` is loaded by every builder session *and* every groom session *and* the
pr-reviewer subagent. A 60% cut is a 60% cut on every session in every repo, forever.

---

## 2. The adoption gap — where we actually are on the ladder

Scored against `references/Steps-of-AI-Adoption.md`, honestly:

| Step-2 requirement | Us |
|---|---|
| 5–10 agents, each on its own worktree | ✅ — `.worktrees/`, `.claude/worktrees/`, the wakeup-resilient rules |
| Claude checks its own work before you see it | ✅ — pre-commit/pre-push budgets, `guards.yml`, tsc+build+Playwright api |
| **Auto mode always on** | ❌ — **the single biggest gap.** See §4 |
| **Automated code review on by default** | 🟡 — it exists, but as three layers of hand-rolled plumbing across four foreign CLIs, with a failure mode that reads as a clean review |
| **Automated security review on by default** | ❌ — nothing. `cross-review.security.prompt.md` exists in medusa only, run by hand |
| Claude Code on mobile / remote control | ❌ |
| Pre-approve common safe bash + MCP in `settings.json` | ❌ — see §4 |

| Step-3 requirement | Us |
|---|---|
| Subagents with worktree isolation | ✅ |
| **Routines / `/loop` / `/batch` / `/goal`** | 🟡 — `medusa-bonsai/scripts/routines/` has 7 committed prompts (ops-nightly, prod-smoke, smoke-triage, roadmap-hygiene, pmo-report, weekly-recap, pr-review). **None of this is in the plugin.** This is the biggest *already-built, not-portable* asset we have |
| Claude kicks off Claude | 🟡 — `codex-delegate.mjs` does it for Codex; nothing for Claude |
| Automatic code review / security review | ❌ (see above) |
| CLAUDE.md + Skills encode standards | ✅ strongly |
| Break `CLAUDE.md` into lazy Skills to manage tokens | ❌ — we did the opposite (§1) |
| Tune auto mode classifier | ❌ (no auto mode yet) |

**Verdict: a solid Step 2 with Step-3 assets stranded in one repo.** The three things that move us
are, in order: **(1) permissions/auto mode, (2) native automated code+security review, (3) port the
routines rail into the plugin.** All three are *deletions and adoptions*, not new inventions.

---

## 3. Reviews — what the outside world does now, vs us

### 3.1 What we do today

Per PR: **two** cross-family CLI passes (`cross-review.mjs` routed by `review-route.mjs` across
codex / antigravity / vibe / claude), **plus** a fresh-reviewer subagent on HIGH, **plus** CI. Plus
the support apparatus that exists only to keep the foreign CLIs alive: `codex-doctor.mjs`,
`agy-doctor.mjs`, `lib/cross-agent-cli.mjs` (612 lines), version pinning, and a documented failure
mode where **a run exits 0 with empty output and reads as a clean review**.

### 3.2 What changed underneath us

Claude Code now ships review as a product:

- **`/code-review`** locally — runs as a background forked subagent with its own context window,
  reviews branch commits + working tree, `--fix` applies findings, `--comment` posts them to the PR,
  effort levels trade coverage for confidence, and `/code-review ultra` escalates to a deeper cloud
  review. It can be started by Claude itself or by a **scheduled task**.
- **Managed Code Review (GitHub App)** — *"a fleet of specialized agents examine the code changes in
  the context of your full codebase... **then a verification step checks candidates against actual
  code behavior to filter out false positives**"*, deduplicated, severity-ranked (🔴 Important /
  🟡 Nit / 🟣 Pre-existing), posted as inline comments + a parseable check run. Tuned by a
  root **`REVIEW.md`**. Neutral conclusion, so it never blocks branch protection. ~$15–25/PR,
  Team/Enterprise, research preview.
- **`REVIEW.md`** is the important one for us. It is exactly the knobs we hand-built: redefine what
  Important means, **cap nit volume**, skip paths CI already covers, add repo-specific checks
  ("new API routes must have an integration test"), set a **verification bar** ("behaviour claims
  need a `file:line` citation, not an inference from naming"), and **re-review convergence**
  ("after the first review, suppress new nits, Important only") — which is precisely the
  argued-down-finding / round-seven-on-style problem our pr-reviewer agent handles by hand.

### 3.3 What the 2026 literature says

The consensus is *not* "more reviewers". It is **fewer passes, each answering a different question,
with an explicit verification step and a managed false-positive budget**. Critique's guide is blunt:
the four checks (author self-review, an independent CLI pass, a PR review, deterministic CI)
*"complement each other, but answer different questions"* — and *"rather than maximizing reviewer
count, one thorough pass with a stable exit status outperforms multiple reviewers generating
unactionable output."* And: *"No green badge can replace ownership."* The adversarial multi-agent
research that does favour multiple agents favours **3 specialised adversarial agents over 5
generalist ones** — i.e. differentiation beats headcount. Our two cross-family passes are two
*generalists*, differentiated only by vendor.

### 3.4 The recommendation (revised 2026-09-16 after the product owner's call)

**One cross-family pass + one fresh reviewer. Every PR. No managed service, no plan change.**

```
CI (deterministic gate)
  → ONE cross-family pass   — the highest-preference family that did NOT build the diff
  → ONE fresh reviewer      — the ported pr-reviewer subagent, on every PR (not HIGH-only)
  → risk tier decides who merges
```

**The arithmetic, stated honestly.** Today: LOW = 2 external + 0 fresh. HIGH = 2 external + 1 fresh.
After: **1 external + 1 fresh, everywhere.** That is a straight reduction on HIGH (3 passes → 2) and a
*re-composition* on LOW (still 2, but one of them is now the layer that catches money-path and
cross-repo bugs instead of a second generalist of the same kind). The two properties that matter —
**family independence** and **context independence** — are each covered exactly once, which is the
whole design. `--skip-trivial` already exists and should keep docs-only diffs out of both.

**What gets deleted or collapsed** (the plumbing that existed only to run *two* passes and to survive
a capped roster):

| Gone / collapsed | Why |
|---|---|
| The second cross-family pass | The ask. One good pass beats two generalists |
| `review-route.mjs` (273) + its test → a ~30-line rule | The four-row router exists to pick *two* families. Picking *one* non-builder family is one line of policy: `preference order minus the builder`. Keep the rule (a family never reviews its own diff — a real silent-downgrade guard); delete the table |
| The **REFUND ASK** / `--fallback-after <minutes>` / DARK-layer protocol | It exists because two external passes could not both be available. With one pass, a capped family falls to the next in the order and the run continues. ~40 lines of `WAYS-OF-WORKING` prose evaporate |
| HIGH-only conditionality on the fresh reviewer | Two branches of policy collapse into one unconditional line |
| `codex-doctor.mjs` + `agy-doctor.mjs` → one `cross-agent-doctor.mjs` | Same diagnosis shape, two copies |
| `cross-panel.mjs`'s **mandatory offer** (groom Stages 2 and 4) | The *script* stays and is genuinely useful; the obligation to surface a one-line offer on every spike and every architecture fork is ceremony. On-demand via the `Panel:` verb only |

**What is kept, and why it must be.** `cross-review.mjs` and `lib/cross-agent-cli.mjs` stay — they
are the one external pass now. And **the empty-output failure mode stops being an annoyance and
becomes a single point of failure**: with two passes, a foreign CLI exiting 0 with no output was
caught by the other one. With one, *it reads as a clean review and nothing contradicts it.* So:

> **A cross-review run that produces no findings and no output is a FAILED run, not a clean one.**
> Assert non-empty output, pin the CLI version, and fail the PR check loudly. This is now the single
> most load-bearing line in the review policy.

**What replaces `REVIEW.md`.** Nothing — and nothing needs to. `REVIEW.md` is read only by the
managed GitHub App, which we are not adopting. The equivalent already exists and is better placed:
**`scripts/cross-review.prompt.md`**, the shared prompt. Widen it to carry the knobs that were worth
stealing from `REVIEW.md` — **nit caps, skip paths CI already enforces, a verification bar
("behaviour claims need a `file:line` citation, not an inference from naming"), and re-review
convergence ("after the first pass, Important findings only")** — and have **both** readers use it:
the external CLI and the fresh reviewer. One prompt, two independent readers, no drift.

**What is added.** Automated **security** review — the Step-2 guardrail we don't have — via the
open-source `anthropics/claude-code-security-review` GitHub Action running in our own CI on our own
key, plus `/security-review` locally. No plan change, no managed service.

**A free bonus worth knowing about:** `/code-review` is a *local* command on any plan — a background
forked subagent with its own context window, `--fix`, `--comment`, effort levels. It is **not** a
review layer in this policy and doesn't count as one. It is a good pre-push self-check for the
builder, which is the one thing our stack never had.

---

## 4. Permissions — the bottleneck you named, and it is worse than it looks

`medusa-bonsai/.claude/settings.local.json` holds **175 one-off `allow` entries across 187 lines**,
accreted one prompt at a time. Sample:

```
"Bash(sed -n '1,60p' app/s/[slug]/ChannelLayout.tsx)"
"Bash(echo \"tsc exit=$?\")"
"Bash(git commit -q -m 'feat\\(embed\\): embed.js loader + <miyagi-buy-button> ... )"
"Bash(python3 -c \"import sys,json; d=json.load(sys.stdin); ...\")"
```

Every one of those is a session that **stopped and waited for a human** — to approve reading 60
lines of a file, or echoing an exit code. This is the Step-1 bottleneck ("you never look away")
surviving into a Step-2 operation, and it is *self-inflicted*: the file is `settings.local.json`,
untracked, per-machine, and it grows by accretion instead of by design.

The fix is the ladder's own named unlock, and it is cheap:

1. **A curated, committed `permissions.allow` in `template/.claude/settings.json`** — the ~40 verbs
   that are always safe in these repos (`git status/diff/log/add/commit/branch/worktree`, `gh pr
   view/list/checks`, `npm run *`, `npx tsc *`, `node scripts/*`, read-only `sed`/`grep`/`find`/
   `head`/`ls`, `supabase migration list`, `vercel env ls`). Committed, reviewed, portable — the
   opposite of an untracked accretion log.
2. **A `permissions.deny` that is the actual guardrail** — `vercel deploy`, `vercel --prod`,
   `supabase db push`, `git push --force`, `rm -rf`, anything touching money/auth env vars. **Today
   there is no deny list at all**; AGENTS rule #4 ("never run a manual `vercel deploy`") is enforced
   by *prose*. That is a rule that should be a check (§1.2).
3. **Auto mode on**, with the deny list as the floor. This is what the ladder means by "auto mode is
   always on" at Step 2 — not "approve everything", but "the dangerous set is enumerated and
   everything else flows".
4. **Sandbox/worktree isolation** for builders so the blast radius argument for prompting disappears.

**Expected effect:** this is the highest-leverage item in the whole audit. It converts the
synchronous "sit and watch" mode into the asynchronous orchestration the rest of the system already
assumes.

---

## 5. Plugin audit — stale, dark, duplicated

### 5.1 Eight of ten skills cannot run. They are shipped anyway.

`scripts/check-skill-scripts.mjs`'s `KNOWN_ABSENT` ledger is admirably honest and the news is bad:

| Skill | Status |
|---|---|
| `groom` | ✅ works (generators ship *inside* the skill) |
| `doc-hygiene` | ✅ script in `template/scripts/` |
| `babysit-pr`, `build-order-sync`, `prose-draft`, `vercel-prune` | ✅ scripts in `template/scripts/` |
| **`pmo-report`** | ❌ dark — needs `pmo-report.mjs` + **14** transitive deps |
| **`standup-post`** | ❌ dark — needs `standup.mjs` + **11** transitive deps |
| **`weekly-recap`** | ❌ dark — needs `weekly-recap.mjs` + **7** deps (port FIRST, the other two import it) |
| **`live-smoke`** | ❌ dark — the origin script lives under `apps/<app>/scripts/`, never extracted |

So the marketplace advertises ten skills and **four of them are decoration**. A new project spawned
from this template installs four skills that fail on first use. The ledger correctly calls this
*"outstanding work, not a documentation problem to reword away"* — it has been outstanding since
2026-08-06.

**Call:** the reporting family (pmo-report / standup-post / weekly-recap) shares one dependency web
(`prose-{brief,guard,writer}`, `report-registry`, `pmo-templates`, `telegram-format`, `log-branch`,
`gh-rest`) and carries project-specific delivery config. **Port it as one unit behind a config seam,
or delete all three from the marketplace until it is ported.** Shipping a dark skill is worse than
not shipping it — a missing layer that reads like a working one is the exact failure mode
`WAYS-OF-WORKING` warns about for reviews.

### 5.2 Other plugin findings

- **`dobby-foundation` has no `Roadmap/` of its own.** Its work is planned in `medusa-bonsai`'s
  funnel (`Roadmap/09-platform-infra/dobby-foundation/`, shipped 2026-07-20). It now has two
  consumers and is a product; planning it inside one of its consumers is how the fork drift it was
  built to prevent will eventually reach *it*. **Recommend: give it its own `Roadmap/` (it can spawn
  from its own `template/`, which would also dogfood the template).**
- **`.DS_Store` litters 7 directories on disk** (`plugins/`, `plugins/ways-of-work/skills/`,
  `skills/groom/`, `template/`, `template/Roadmap/`, `template/scripts/`, `template/apps/...`).
  *Verified: none are tracked in git* — `.gitignore` catches them. Local noise only, cheap to sweep.
- **`dist/groom.skill`** exists on disk and is correctly **untracked**. Not a problem; noted so the
  next reader doesn't re-flag it.
- **`template/scripts/roadmap-to-notion.mjs` is 554 lines** and is the single largest file in the
  template, for an integration most projects won't use. It should be optional/config-gated, not
  part of the copy-once skeleton.
- **`template/apps/example-app/`** contains a `playwright.config.ts` and an `e2e/README.md` and
  nothing else. Either make it a real runnable harness or drop it.
- **`marketplace.json` and `plugin.json` list the skills in prose, twice, in different orders**, and
  both lists are now wrong (they advertise the dark four).

---

## 6. medusa-bonsai → plugin: what should be extracted

`medusa-bonsai` has **71 scripts**; the template has 19. These are the ones that are generalizable,
load-bearing, and currently trapped:

### Tier 1 — port now (they encode process the plugin already claims)

| From medusa | Why it belongs in the plugin |
|---|---|
| **`scripts/routines/` (7 prompts + README)** | The Step-3 "routines / loops" rail, already written and proven: ops-nightly, prod-smoke, smoke-triage, roadmap-hygiene, pmo-report, weekly-recap, pr-review. The template has a single `example-routine.prompt.md` stub. **This is the single biggest stranded asset.** |
| **`.claude/agents/pr-reviewer.md`** | The fresh reviewer the whole review policy depends on. The policy is in the plugin; the agent that implements it is not. |
| **`.githooks/pre-commit` + `pre-push` (the 3-stage cost budget)** | `<2s` staged-only / `<30s` whole-repo / unbounded CI, with the measured 119.7s→instant story in the header. The template's hooks have no budget doctrine. Auto-enabled via `package.json` `prepare`. |
| **`scripts/session-note.mjs` + `session-resume.mjs`** | "Derive state, journal intent" is *already doctrine* in `WAYS-OF-WORKING` → *Assume the orchestrator dies too*. These two scripts are that doctrine, executable. Prose without them is a wish. |
| **`scripts/doc-format.mjs`** | Checks epic docs against the `groom` templates — i.e. it enforces the plugin's own scaffolding shape. It lives in the consumer and validates the producer. Backwards. |
| **`scripts/owed-ledger.mjs`** | Turns scattered "owed to the product owner" comments into one generated number. Directly implements the DoD's "gaps stated explicitly" rule. |

### Tier 2 — port behind a config seam

`prod-smoke.mjs` (the "a routine's assertions must be a reviewable file, not a prompt in someone's
account" lesson is fully general), `smoke-triage-scope.mjs` (can a routine merge this diff by
itself? — an autonomy-boundary primitive, exactly Step-3 thinking), `merge-report.mjs` +
`post-merge`/`post-checkout` hooks, `perf-probe.mjs`, `vercel-env.mjs` (the Vercel CLI
silently-stores-empty-values gotcha is a rail, not a note).

### Tier 3 — leave in medusa (project-specific)

`gcp-project-refs.mjs`, `neon-egress.mjs`, `flags.mjs` (Flagsmith — and see §7),
`publish-live-views.mjs`, `live-views-count-parity.itest.mjs`, `sync-*-from-miyagi.mjs`.

### Retire or collapse (per §3.4 — revised)

- **Collapse:** `agy-doctor.mjs` + `codex-doctor.mjs` → one `cross-agent-doctor.mjs`.
- **Collapse:** `review-route.mjs` (273 lines + test) → a ~30-line "highest-preference non-builder
  family" rule.
- **Delete:** the second cross-family pass, the REFUND-ASK / `--fallback-after` / DARK protocol, and
  the HIGH-only branch on the fresh reviewer.
- **Demote, don't delete:** `cross-panel.mjs` — keep the script, remove groom's obligation to offer it.
- **Keep:** `cross-review.mjs`, `lib/cross-agent-cli.mjs`, `cross-review.prompt.md` (now widened to
  carry the nit cap, skip paths, verification bar and re-review convergence, and read by **both** the
  external CLI and the fresh reviewer).
- **`codex-delegate.mjs`** is a judgement call: it's a real second worker pool, but "Claude kicks off
  Claude" via subagents/Agent SDK is the ladder's own answer. Not decided here.

---

## 7. Feature flags — three providers, one system

- **`medusa-bonsai`** runs an **in-house Supabase `platform_flags` table** (`lib/flags.ts` + a
  backend twin in `apps/backend/src/lib/flags.ts`, epic `09/feature-flags-inhouse`) — *and* still
  carries `scripts/flags.mjs`, a **Flagsmith** Admin-API tool, *and* has `flag-provider-mode.ts` /
  `parseFlagCutoverManifest` machinery for a cutover.
- **`golden-beans`** ships a real flag control plane: `@golden-frijoles/sdk@0.4.0` with
  `createFlagProvider` (OpenFeature-shaped, background snapshot, synchronous resolution, safe
  caller default), `createFlagDefinitionSyncClient` (catalog-in-source-control → explicit operator
  sync, immutable versions, 409 on semantic drift), `/api/v1/flags/{admin,snapshot,sync}`, a visual
  rule builder, rollout viz, plain-language version diff, audit trail, and `flag_read` / `flag_sync`
  / `ingest` credential separation.
- **`dobby-foundation`** says, in `groom` Stage 6b: *"extending `lib/flags.ts` `DEFAULT_FLAGS`"* —
  i.e. the template hardcodes **medusa's in-house shape** as the flag mechanism, in the very skill
  that is supposed to be project-agnostic. That's a portability leak `check-plugin-leaks.mjs`
  doesn't catch because the filename is generic.

The mandate you want is the right call and the pieces mostly exist. **What's missing is the front
door**: there is no CLI, so "create the flag in every env" — a *mandatory* line in every kill-switch
story — is a manual click in a web console, or a hand-rolled script per project. Golden Frijoles is
sold as an agent-operable harness and currently gives an agent a **read-only MCP connector** and
nothing to write with. See the CLI pitch.

---

## 8. The frontmatter visualization — the blocker nobody has hit yet

Claude Mods are real and confirmed: plugins using **function hooks**, a TypeScript
middleware/continuation model (`on('ui.render', …)`, `on('turn.start', …)`, `$.ui.status`,
`$.ui.log`, `$.store.get/set`, `$.fs.readFile`), declared in `hooks/hooks.json`, validated offline
with `claude plugin validate`, enabled today behind `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. Anthropic
has committed to shipping them "on the scale of weeks". So yes — it renders inside the CLI while the
agent works, which is what you want.

**But the data isn't there yet.** What the docs actually carry:

```yaml
# epic README.md — the ENTIRE frontmatter
---
status: shipped   # scaffolded | in-progress | shipped | archived
slug: arranged-only-delivery
---
```

- `sprint-N.md` files have **no frontmatter at all**. Epic, risk, status and progress live in bold
  prose in a paragraph.
- Story status is an inline `✅ MERGED — backend 21b1874 (PR #84 squash)` appended to an `### S1.1 —`
  heading.
- The user story ("As a / I want / so that") is prose inside the story block.
- There is no field anywhere that says *which story is in flight right now*.

So "Story 3 of 7" is derivable by counting `✅` against `###` headings — fragile, but workable. The
epic title and risk are derivable. **The status ladder you asked for (Locking architecture →
Building → QA → Deployed) does not exist in any form today**, and it shouldn't be scraped: it should
be *written*, by the agent, at the moments the cadence already defines.

Proposed executive ladder, mapped to real cadence events we already have:

| Status | Entered when | Already observable? |
|---|---|---|
| `Shaping` | groom running, pre-scope-doc-gate | seed `status: ready` |
| `Locking architecture` | epic-mode orchestrator writing `D1…Dn` into the epic README | ✅ a real, named step |
| `Building` | first story commit on `feat/<slug>` | ✅ git |
| `Verifying` | deterministic gate running (tsc+build+tests) | ✅ CI |
| `In review` | PR open, review findings outstanding | ✅ `gh` |
| `Shipped` | merged **and deployed** — the doctrine's own "done means shipped" | 🟡 needs the deploy confirm |

That's five statuses that map exactly onto steps the docs already mandate, and it turns the mod into
an honest read of the process rather than a second source of truth.

**Required first move:** extend the `groom` scaffolder templates with a richer, *machine-readable*
frontmatter block on both epic README and `sprint-N.md` (epic, sprint, story ids, `as_a`/`i_want`/
`so_that`, risk, status, `stories_total`), and have `doc-format.mjs` enforce it. Without that, the
mod is scraping bold prose. **The frontmatter work is the epic; the mod is the last sprint.**

---

## 9. Proposed sequence, appetite, and why

| # | Pitch | Repo | Appetite | Depends on |
|---|---|---|---|---|
| 1 | **Ways-of-work lean pass** — ceremony diet, review collapse to one cross-family pass + one fresh reviewer, permissions/auto-mode, derivable-DoD script | dobby-foundation (seeded in medusa) | **L** — multi-wave | — |
| 2 | **Golden Frijoles CLI v1** — auth, `init`, full flag lifecycle, one-line installer, command-core shared with MCP | golden-beans | **L** — multi-wave | — (runs in parallel with 1) |
| 3 | **Flag-provider mandate** — the plugin requires a Golden Frijoles project; `groom` 6b + preflight emit the real `gf` commands | dobby-foundation | **M** — one wave | **2** (needs the CLI to exist) |
| 4 | **Plugin audit + medusa extraction** — pay the dark-skill debt or delete it; port Tier-1 assets; kill `.DS_Store`/`dist` | dobby-foundation | **L** | **1** (policy decides what survives) |
| 5 | **Frontmatter contract + Claude Mods build view** | dobby-foundation | **M** | **4** (scaffolder templates change) |

**Stacking note:** 1 and 4 both edit `SKILL.md` files and `template/`. Run 1 first — it *decides*
what the docs say; 4 *executes* the inventory against the decision. Building them in parallel off
one base pays the conflict tax `WAYS-OF-WORKING` itself warns about ("stack or pay").

---

## 10. Sources

- Claude Code — [Code Review docs](https://code.claude.com/docs/en/code-review)
- Claude Mods / function hooks — [anthropics/claude-code#91870](https://github.com/anthropics/claude-code/issues/91870#issuecomment-5666255143)
- [Critique — AI Code Review in 2026: The Definitive Guide](https://www.critique.sh/ai-code-review-guide)
- [Adversarial Code Review: 3 AI Agents Beat 5-Agent Teams](https://www.intelligentliving.co/adversarial-code-review-ai-agents/)
- [Zylos — Adversarial Code Review Cycles Between AI Agent Pairs](https://zylos.ai/research/2026-07-24-adversarial-code-review-cycles-ai-agent-pairs/)
- [Qodo — Single-Agent vs. Multi-Agent Code Review](https://www.qodo.ai/blog/single-agent-vs-multi-agent-code-review/)
- [Automate security reviews with Claude Code](https://claude.com/blog/automate-security-reviews-with-claude-code)
- `references/Steps-of-AI-Adoption.md` (Boris Cherny, 2026-07-16)
