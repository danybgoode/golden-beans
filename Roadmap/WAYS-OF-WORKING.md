# Ways of Working

How the product owner and Claude (builder) ship product together. Lightweight scrum: small slices,
plan first, ship the moment each slice works.

---

## Roles

- **Product Owner & Reviewer.** Sets direction, approves plans, tests each shipped slice, makes the
  consequential calls (architecture forks, infra, money).
- **Claude — Builder.** Researches, proposes the plan as user stories, builds, verifies, ships, and
  documents.

**Orientation before building.** Many asks are solvable with existing features + communication or a
light enhancement, not net-new work. Surface that path *first*; build new only when the outcome
genuinely needs it. The `groom` skill gates on this (Stage 2.5).

## The unit of work: the user story

Everything is sliced into **user stories** — the smallest piece of independently testable, shippable
value. Format:

> **As a** \<role\>, **I want** \<capability\>, **so that** \<outcome\>.
> **Acceptance:** plain-language checks the product owner can run.

Stories roll up into **Sprints**, sprints into an **Epic**, epics live under a **Macro-section**
(product domain). See `Roadmap/README.md`.

## The cadence (our core loop)

Work on **feature branches and merge to `main` via PR** (gitflow) — multiple agents can run in
parallel on their own branches, so `main` stays clean and conflict-free. `main` is the production
line: merging to it deploys.

```
Plan → Branch + scaffold docs → Build story → Verify → QA/smoke-test (preview) → push → product owner reviews preview → … → PR → merge to main → (epic close: poster + retro)
```

1. **Plan.** For non-trivial work, Claude enters plan mode, writes a plan as user stories, and the
   product owner approves before code. **Every plan names a QA / smoke-test stage** with the specific
   checks and tools. Reference end-states (spec docs) are inspiration, never signed-off scope. Every
   scope seed also names which UX rails (CI guards, an audits lens, design-language debt) cover its
   surface — the `groom` skill's Stage 4 reuse list (`groom/templates/scope-seed.md` in the
   `ways-of-work` plugin).
2. **Branch + scaffold docs.** Create one working branch per epic — `feat/<epic-slug>` (or `fix/…`,
   `chore/…`) — off the latest `main`, in each repo you'll touch. On it, *before any code*, scaffold
   the epic `README.md` + per-sprint files under the right macro-section (plain-language stories +
   acceptance). The build runs against these docs; the product owner sees scope as it grows. Keep
   them current as stories land (✅ ticks, commit refs); retrospective at epic close.
3. **Build one story at a time.** Iterative. Reuse before rebuild. Commit per story to the branch
   (`Co-Authored-By: Claude` trailer).
4. **Verify.** Type-check + lint clean, build passes.
5. **QA — the deterministic gate (pre-merge) + the live confirmation (split).** Two distinct layers;
   don't conflate them.
   - **Deterministic gate — must be green BEFORE merge:** typecheck + build + your test suite, run by
     the building agent. This is non-negotiable — nothing merges on a red gate. Where the acceptance
     check is browser-/API-testable, add **one** spec (Playwright or equivalent) as part of the story.
   - **Deploy rail is a per-project variable** — fill in how your project's preview mechanism (if any)
     works here. Example (a preview-per-PR rail like Vercel): the harness runs against the branch's
     preview via `PLAYWRIGHT_BASE_URL=<preview-url>`; if the preview is SSO-/access-gated, a
     protection-bypass token/header reaches it. A rail with **no per-branch preview** (e.g. a
     build-on-merge container platform) can only be confirmed *post-merge* against prod — the agent
     does an API-level prod smoke, the product owner picks up the browser/session parts; state this
     split in the PR.
   - **Live confirmation can be async + divided** (it's *confirmation*, not the gate): the agent owns
     API-level smoke where it has access; **the product owner owns the browser / real-session smoke**
     for anything credential-gated. Exercise real behaviour — a disposable/test account for anything
     that mutates data; clean up after (revoke test tokens).
6. **Push as you go.** Each push updates the preview (if your rail has one); the reviewer (and the
   product owner) can test per story without touching production.
7. **PR → review → merge to `main`.** Open a PR early **as a draft**; keep it updated with a self-QA
   note **and a risk tier** (see *Review & merge* below). **Flip the PR draft → ready-for-review the
   moment the deterministic gate is green and the self-QA note is posted** (updated 2026-07-15): a
   draft means *still building*, ready means *review me* — this is also what the roadmap board's
   Lifecycle overlay reads (draft PR → In progress, ready PR → In review), so leaving finished work
   in draft hides it in the "In review" column. Set the sprint doc's `Status:` line to `🟦 In review`
   at the same moment. Trigger the reviewer (a fresh agent, not the
   builder — see *Review & merge* below). When the deterministic gate is green, the review is clean,
   and the merge is authorized for the PR's risk tier, merge to `main`. **Merging to `main` is the
   production deploy** — fill in your project's actual deploy mechanism/timing here. Small epics merge
   once; larger ones may merge per sprint. Delete the branch after merge.
8. **Continue / close.** Roll into the next story. At **sprint close**, emit the sprint-wrap terminal
   summary (`SESSION-KICKOFFS.md` §7) — a thin pointer to the sprint doc + what's owed/next, never a
   re-summary. At **epic close**, do the epic Definition of Done (below) — including updating the
   product poster.

## The default unit of work is now the EPIC, not the sprint (adopted 2026-07-25)

Earlier versions of this file assumed one session ≈ one sprint. That is no longer the default. With
a long-context planning model, the standard shape is: **the product owner hands over a whole groomed
epic plus follow-ups, pre-authorizes the merges, and one coordinating agent runs it end to end** —
planning, routing the build, reviewing, merging, and closing out. It has worked well enough across
several epics to be the rule rather than an experiment.

What that changes, concretely:

1. **One architect, many builders.** The coordinating agent owns the plan, the architecture calls and
   the merges. It does **not** hand-build every story. It classifies each story by complexity and
   type, then dispatches builders — see the routing table below.
2. **Assembly line, not a relay.** Read-only research on an external dataset, doc scaffolding and
   independent stories run in **parallel, in the background**, while the architect works the critical
   path. Anything touching shared surface (CI config, `package.json`, lint config, a `lib/` seam
   several stories import) is done **first and by the architect**, because its blast radius is every
   branch opened after it.
3. **Pre-authorized merges change WHO decides to pause, not WHETHER the gates run.** A standing
   "merge high-risk PRs" still means: deterministic gate green, cross-agent review clean or its
   findings answered, kill-switch polarity verified. It is permission to proceed through the
   established gate without re-asking at each step — never permission to skip it. (Already a
   LEARNINGS rule; restated here because the epic-sized handover makes it far easier to forget.)
4. **Surface scope-breaking findings the moment you have them, then keep building.** An epic-sized
   handover means research can invalidate a premise written weeks ago. Put the decision to the
   product owner as an explicit either/or **with a recommendation**, record the answer as a dated
   **amendment in the epic README** (never a silent reinterpretation), and meanwhile finish
   everything that does not depend on the answer. Worked example: pod-report's
   "human-baseline vs agent-augmented eras" spine, which the dataset could not support — amended
   2026-07-25 to published-benchmark baselines.

Four additions to this SOP (2026-08-03), all of them things the epic-sized shape makes easy to lose:

5. **Lock the architecture before any builder starts.** Before delegating, the coordinating agent writes
   numbered decisions `D1…Dn` into the epic `README.md`, each **verified against the live code and live
   data** — not inferred from the plan — plus a per-sprint **"Build contract (locked by the architect
   before the builder started)"**. Builders *cite* those decisions; they never re-derive them, because a
   paraphrased contract drifts permissive. The locking pass must **disprove scope**: an acceptance
   criterion describing a guard, a table or a flag state the live system doesn't have is fiction —
   correct the doc, with the reasoning, out loud.
6. **Stack the branches.** `feat/<slug>` → `-s2` → `-s3`, each cut from the previous, one PR per sprint,
   merged in order. Sprints in one epic share hot files by construction; siblings cut off one base pay a
   per-merge conflict tax. Stack or pay.
7. **Generate the kickoff, don't compose it.** `node skills/groom/emit-epic-kickoff.mjs --epic <slug>`
   (the `groom` skill, `ways-of-work` plugin) reads the epic README + every sprint file and prints the
   whole-epic orchestrator prompt. Hand-composing it is how the architecture-lock pass gets summarised
   away and the review policy silently reverts to whatever the composing agent remembered.
8. **Done means shipped, not merged.** A merged PR that hasn't deployed, a migration written but not
   applied, a flag that exists in code but not in the flag provider — none of those are done. Where the
   work includes a migration, apply it **before** merging (merging deploys), verify live, then merge,
   then confirm the deploy actually succeeded.

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
| PR review — a PRIMARY gate, not advisory | **TWO cross-family passes, routed** by `review-route.mjs` from codex → agy → vibe → claude, excluding whoever built it. Plus the fresh reviewer subagent on HIGH tier only. | Different-family contrast is the point, and *two* passes give a finding corroboration — Codex found a Blocking issue four Agy rounds missed (PR #33). Blocking findings are resolved before merge. See *Review & merge* for the full policy and the refund rule. |
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

## Betting & appetite — the economics layer (adopted 2026-08-03)

A ticket board without economics is a sausage machine: work goes through it, and nothing records
what budget it drew from or what it displaced. This layer makes **opportunity cost** — *what else
could we be building?* — the visible, guiding question. Principles adapted from Shape Up
(`references/shapeup/`) for an agent-speed operation.

**Appetite, not estimates.** Shaping fixes the budget before the solution: fixed appetite,
variable scope. An agent will eventually build anything if allowed to tokenmaxx; the appetite is
what makes it stop, zoom out, and hammer scope instead. Appetite is denominated in **sessions** —
the binding constraints are product-owner attention and session context (LEARNINGS), with review
rounds close behind — each tier carrying an implied token band:

| Appetite | Buys | Circuit breaker |
|---|---|---|
| **S** | one builder session; fixed scope (a bug, a chore, a clear story) | escalate-don't-guess (2+ failed attempts) — no hard breaker |
| **M** | one wave: an architect session + builder fan-out + review rounds | appetite exhausted → stop, back to shaping |
| **L** | a multi-wave epic | per-wave: each wave is re-bet at the boundary |

**The circuit breaker is the default, not the exception.** When an M/L bet exhausts its appetite,
work *stops and returns to shaping* — never extended in flight. Repeated hammering on one problem
signals the work is uphill (unknowns), not that it needs more tokens.

**Underwriting.** Nothing reaches `status: queued` without `appetite:` set — `build-order.mjs`
hard-fails otherwise — and a wave underwriting it (`underwritten_by:`). `underwritten_by: null` is
the honest state of an idea nobody has paid for yet: fine in the funnel, impossible on the board.

**Betting at wave boundaries (no fixed calendar).** Before a new wave starts, the betting table —
product owner + architect agent, with `cross-panel.mjs` available for an advisory different-family
read — picks bets from `ready` seeds and records them in `Roadmap/bets/<wave>.md`: each bet, its
appetite, and **what it displaced**. Three lines per bet, not a ceremony. An unpicked pitch is let
go, not backlogged — if it matters, it resurfaces.

**Lanes — not everything earns the betting table.** The groom skill classifies each ask into:

- **Shaped bet** (genuinely-new / strategic) → full pitch (problem · appetite · bill of materials ·
  rabbit holes · no-gos) → betting table.
- **Fixed scope** (bug, chore, well-specified story) → default appetite S, straight to a builder.
- **Reactive/ops** (incidents, launch support) → no shaping, but logged against the current wave's
  budget so the economics stay visible.

**Hill routing.** Uphill work (unknowns being figured out) stays on the strongest model and is
never delegated; downhill work (known execution) routes to builder tier — this names what the
routing table above already does. A scope that stops moving is a raised hand: escalate, don't
hammer.

**Reporting register.** Close-out prose walks the ladder **outcome → behavior → implementation**:
lead with what's now true and why it was worth the bet, support with observable behavior,
implementation detail only where the mode asks. The SSOT is `scripts/prose-draft.prompt.md`.

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

## Review & merge — cross-agent
With multiple agents potentially running in parallel, the agent that **builds** a PR is not the one
that **approves** it — a fresh reviewer re-derives intent from the diff alone and catches what the
author's context-bias hides. Two layers do this, and they're complementary:
- **CI (determinism):** a deterministic gate on every PR — the tireless gate that never forgets or
  runs out of tokens; a red CI blocks merge. Typecheck + build + your test suite against the PR's
  preview (if your rail has one) is the minimum shape; adapt to your actual stack. If a repo has no
  per-branch preview (deploys post-merge only), there is correspondingly no e2e-vs-preview step in its
  gate — that's correct, not a gap.
- **Cross-family review (judgment) — TWO routed passes on every PR (updated 2026-08-03):** the builder
  remains the architect and does not approve its own diff. **Route the reviewers; never hand-pick
  `--agent`:**

  ```
  node scripts/review-route.mjs --builder <who-wrote-it> --tier <low|high> <PR#>
  ```

  Four families are wired — `codex`, `antigravity` (agy), `vibe` (Mistral) and `claude` (Claude Code as a
  plain CLI reviewer). The router applies four rules and prints the exact commands:

  1. **A family never reviews its own diff.** With a coordinating Codex orchestrating builds, the old
     default would have been Codex reviewing Codex — a same-family pass wearing a cross-family label.
     This is why the previous "OpenAI/Codex models are not used for code review here" blanket rule is
     replaced: the constraint was never about Codex being a bad reviewer, it was about *who built it*,
     and the router encodes that precisely instead of banning a whole family.
  2. **Two passes, from the top of the order that did not build.** Order: codex → agy → vibe → claude.
     `claude` is last deliberately — Claude capacity is usually the thing building; it rotates in when
     one of the three ahead of it caps. `claude` is on the roster specifically so a **non-Claude
     orchestrator** (this project's usual case) can get a Claude read without a Claude host to spawn a
     subagent.
  3. **A fresh reviewer subagent on HIGH tier only** — money, auth, DB migrations, tenancy, concurrency,
     shared infrastructure. **Not spawned on LOW**: two cross-family passes plus the deterministic gate
     are the whole layer there.
  4. **A capped family is a REFUND ASK, not a licence to substitute.** External quota is refundable in
     minutes; orchestrator subagent tokens come out of the build budget. The router prints the ask and
     the window (`--fallback-after`, default 30 min); after it, proceed and **record the downgrade in the
     PR body**. A short or DARK layer that reads like a clean one is worse than no layer.

  **Devin is retired from the review rotation** — it keeps its prose duty (see the prose table above),
  which is the better use of its pool. **Cursor CLI Auto** remains unwired (paywalled models on the free
  plan).

  Every reviewer reads the diff cold in a **single pass** (no debate/iterate-to-convergence loop).
  A **Blocking** finding must be resolved or explicitly triaged before merge. This still is not a
  second deterministic gate: CI decides green/red mechanically, reviewer judgment decides whether
  the diff holds up, and the risk-tier rule decides who clicks merge.

  **Re-review only when the review target materially changed.** A substantive fix reruns the reviewer
  that found it; rerun the other reviewer too only when that fix crosses a security/data/architecture
  boundary the other one previously reviewed. A docs, wording or presentation-only follow-up gets
  targeted typecheck/render/diff validation and does not automatically spend two more full-model passes.
  `--skip-trivial` skips docs-only / tiny diffs. Fill in your project's own driving-a-young-foreign-CLI
  gotchas here as you hit them (version pinning, `--help` quirks, headless-auth limits) — the failure
  shape to watch for is a run that exits 0 with **empty output**, which reads as a clean review.

**Every PR declares a risk tier** (in the PR body); that tier decides who may merge:
- **Low-risk → reviewer may auto-merge** once CI is green and the review is clean: docs/copy,
  non-commerce-adjacent UI, additive tools behind auth, tests, internal tooling.
- **High-risk → always a product-owner merge** (a human green-light, never an autonomous ship):
  anything touching money, auth, DB migrations, or shared infra. This preserves the guardrail — an
  agent never deploys a real-money or real-auth path to production on its own.
When unsure which tier, treat it as high-risk. High-risk epics are also *planned behind a kill-switch*
at grooming (the flag is decided + sliced there, verified at epic DoD — not a new gate); see the
`groom` skill's Stage 6b.

## Definition of Ready (a story can start)
- The "as a / I want / so that" is clear and the acceptance check is testable.
- It's a slice that can ship on its own.

## Definition of Done (a story)
- Acceptance criteria met and confirmed working.
- Type-check + lint + build clean.
- **Smoke-tested** (on the branch's preview where applicable). The story's real behaviour is exercised
  end-to-end with an appropriate tool — a Playwright spec, `curl`, or a real artifact render fit
  API-only/non-browser checks; a scripted browser-verification tool (see the origin project's
  `live-smoke` skill for a worked pattern) is the default for rendered-page checks. Never "build
  passes, therefore done." If a live smoke test genuinely can't run (no test account,
  money-/account-gated), that gap is stated explicitly in the PR rather than glossed.
- **Every new spec was observed failing (red) at least once** — via a deliberate break-the-
  implementation mutation check if the test was written after the code. This verifies the spec isn't
  a false-positive tautology; it is **not** an ordering mandate — don't force test-first.
- Committed to the feature branch; sprint doc status ticked.

## Definition of Done (an epic) — the close-out checklist
When the last story of an epic is merged, the epic is not "done" until ALL of these are true:
- [ ] All sprints' stories merged to `main` and smoke-tested (gaps stated).
- [ ] **Each sprint has a fool-proof smoke walkthrough in its `sprint-N.md`** — numbered steps, one
      action + one expected result each, using **real production URLs** once deployed (preview URLs
      pre-merge). Money/auth/checkout steps are flagged by name as **owed to the product owner** (an
      automated browser smoke can't fully cover them). Format + example: `groom` skill, Stage 8b.
- [ ] Epic `README.md` marked ✅ complete; every `sprint-N.md` status ticked with commit refs.
- [ ] **`RETROSPECTIVE.md`** written alongside the epic (what shipped / went well / learned / gaps).
- [ ] **Product poster updated — `Roadmap/README.md`.** Find the epic's macro-section in the
      **Feature map** and update its line(s) to reflect what's now live (✅), and add a **Recent
      highlights** entry. The poster is the at-a-glance product source of truth — it must never lag a
      shipped epic.
- [ ] **Landing backfill (the public-offer contract, adopted 2026-07-14):** if the epic changes the
      public offer, its landing-page section ships or updates **in the same epic** — flip the
      section's 🔜 badge / content toward the end-state (`references/landing-end-state.md`). Like
      the poster rule: the public page never claims ✅ for unshipped work, and never lags a shipped
      one.
- [ ] Team memory updated (epic memory + the index, if your workflow keeps one).
- [ ] **`Roadmap/LEARNINGS.md` updated** — promote any durable, generalizable learning from the
      `RETROSPECTIVE.md` into the right section (one-liner + *why* + date/source). Dedupe — sharpen
      the existing line, don't append a near-duplicate. This is how a retro reaches the next agent.
- [ ] **Kill-switch (if one was planned at grooming):** the flag slice shipped and the flag exists
      with the polarity the scope doc stated (kill-switch ⇒ default `true`, created **enabled**;
      enablement ⇒ default `false`, created **disabled**). This **verifies** planned work — it is
      **not** a new build-time gate. Whether a high-risk epic needs a kill-switch is decided at
      **grooming** (the `groom` skill, Stage 6b), not discovered here.
- [ ] Feature branch deleted; PR merged.

## Automated QA — where we are
The test harness should grow by **one spec per new browser-/API-testable story** — coverage accretes
with the work, not as a separate project. Two layers is the recommended shape (see the origin
project's `apps/*/e2e/README.md` for a worked example):

- **`api` project — the deterministic gate (always-on).** API-level, no browser binaries. CI runs
  this on every PR. Must be green before merge.
- **`browser` project — opt-in real-browser smoke (NOT the gate).** Chromium, asserts *rendered* UI
  an API call can't see. Kept out of the blocking gate (binaries are heavy/slow); run on demand and/or
  on a schedule. A browser spec **replaces a browser smoke previously owed to the product owner** —
  many client-island assertions even work anonymously (no login). Authed/epic smokes read test-account
  secrets and **skip gracefully** when unset.

## Documentation map
- **`Roadmap/`** — product source of truth (this folder). Plain language, no tech. Macro-section →
  Epic → Sprint → Story, plus the feature poster.
- **`Roadmap/LEARNINGS.md`** — the distilled, cross-cutting wisdom from past epics' retrospectives.
  **Read it at session start.** Fed at every epic close — see the epic Definition of Done. The full
  story of any item stays in its epic `RETROSPECTIVE.md`; this is the transferable digest so a retro
  reaches the *next* agent instead of dying in its folder.
- **`Roadmap/00-ideas/`** — the idea funnel: `seeds/` (one .md per idea, lifecycle in **frontmatter** —
  no folder shuffling), `audits/` (UX/UI findings), and `BUILD-ORDER.md` — a **generated** status
  board (`node scripts/build-order.mjs`), **never hand-edited**. See `00-ideas/README.md`. **Status
  SSOT = each epic README's frontmatter `status:`** (seed frontmatter owns only the un-scaffolded
  funnel); `BUILD-ORDER.md` is a *derived view* of it — regenerated, not maintained.
- **`Roadmap/bets/`** — one file per wave: the bets placed, their appetite, and what each displaced.
  Written at the wave boundary (see *Betting & appetite*).
- **`tasks/`** — engineering delivery log: what was built, decisions, commit hashes, runbooks, known
  limitations.
- **Team memory** — durable cross-session facts and pointers, if your tooling keeps one.
- **Retrospectives** — one per epic/sprint, alongside the epic.

## Conventions
- **Gitflow.** Branch off `main` per epic (`feat/<slug>`); commit per story; PR → merge to `main`.
  Never commit feature work straight to `main`, and never force-push a shared branch. Rebase/merge
  latest `main` into a long-running branch before opening the PR. Roll back a bad merge with
  `git revert` on `main`.
- **Branch + preview hygiene (at merge, and as a periodic sweep).** If your deploy rail keeps preview
  deployments forever (e.g. Vercel), deleting a merged branch does **not** remove its preview
  deployments — dead branches pile up stale previews. After deleting merged branches, prune their
  previews with whatever tool your rail supports (dry-run by default; keep any branch with an OPEN PR
  — its preview is the live review target). Same cadence as the branch cleanup itself.
- **Planning commits — own worktree + path-limited.** Multiple sessions running in the same shared
  worktree can collide the git index (a bare `git add Roadmap/` stages a sibling agent's in-flight
  files → "another git process is running" / index lock errors). Two rules remove the contention: (1)
  **commit only your own paths** — `git add <specific files>` then `git commit -- <those paths>`
  (never `git add Roadmap/` or `git add -A`); and (2) for parallel planning, **give each planning
  session its own `git worktree`**, or appoint a single **scribe** for shared files like
  `BUILD-ORDER.md`. Path-limited commits are the single highest-leverage habit — they keep each commit
  clean regardless of what else is in the shared index.
- **Model tiers — a strong-planning / fast-building split, if your tooling supports it.** The origin
  project runs grooming/spikes/plan-mode/review on its strongest available model with full
  deep-thinking, and per-story execution on a faster model once slices are approved — this is a
  default worth adopting, not a hard requirement; adjust to whatever models you have access to.
  **Escalate-don't-guess:** a build session stops and asks / hands back to the planning tier — instead
  of inventing an answer — on the same triggers as the **high-risk tier** defined above (money / auth
  / DB migrations / shared infra) — **plus** plan ambiguity, a decision the plan doesn't cover, or a
  repeated failed attempt (2+ tries at the same problem). Default to escalate when unsure.
- **Docs track code — verified, not generalized.** A canonical rule (your `AGENTS.md`'s cannot-be-
  violated rules) must reflect what the code *actually* does, checked against it — don't globalize a
  scoped learning into a site-wide rule. On the product poster (`README.md`), **✅ means enforced in
  code**, not merely intended — partial/aspirational is 🚧. Run a lightweight **drift audit**
  periodically (paths · imports · env vars · routes · key policy claims vs the codebase).
- Commit messages end with the `Co-Authored-By: Claude` trailer.
- **Language.** Docs are written in **English** — everything under `Roadmap/`, `tasks/`, code
  comments, and PR descriptions. **App copy is English too** (the landing renders `<html lang="en">`);
  Golden Beans is a standalone English-language product with **no bilingual requirement** — do not
  introduce a locale/translation layer or make a surface bilingual without a deliberate scope decision
  that says so. (This differs from the Miyagi sibling, whose app copy is es-MX with an es/en
  allow-list — that policy is theirs, not this repo's.)
- Build from existing primitives first (your project's canonical system of record for a domain, not a
  secondary datastore or a bespoke route).
- **Grooming cadence (updated 2026-07-14):** with a strong planning model (Fable-class), the
  default is a **single-session groom** — one deep Definition-of-Ready groom for the front-of-queue
  epic *plus* a portfolio pass that seeds/resequences the rest of the funnel — rather than one seed
  per session. The groom skill's discipline (stages, scope-doc gate, one *deep* ask per run) is
  unchanged; what batches is the funnel bookkeeping. Deep-groom later epics only when they reach
  the front. Build sprints stay session-sized — versions may supersede in the immediately-next
  sprint, so keep per-sprint kickoffs thin and let the epic docs carry state.
- **Session hygiene (long epics).** Running a whole multi-sprint epic in one session is the main
  context-cost driver. The durable state (the plan file, sprint docs, team memory) makes re-entry
  cheap by design — so compact at each sprint/PR boundary, and for big epics consider a **fresh
  session per sprint**. See `LEARNINGS.md → Working efficiently`.
- **Parallel agents + async deploys.** If `main` moves under you and multiple repos deploy at
  different speeds, merge latest `main` into your branch before/while a PR is open; merge the
  data-producing repo first when a consuming repo depends on its data; make the consumer degrade
  gracefully. See `LEARNINGS.md → Multi-agent & async deploy coordination`.

---

## Tooling — what Claude can drive from the CLI

The authenticated CLI access Claude can drive in this repo:

| Tool | Used for |
|------|----------|
| **git / gh** | Version control, feature branches, pull requests + merges, GitHub operations |
| **node / npm** | Type-check (`tsc`), build (`npm run build`), Playwright (`npm run test:e2e`), local dev server, the `scripts/*` tooling |
| **vercel** | Env-var management (`vercel env pull/add/ls`) + reading deploy state. **Never** `vercel deploy`/`--prod` — merge to `main` is the deploy (rule #4); check state via `gh api repos/<owner>/<repo>/deployments`. |
| **supabase** | Migrations against linked project (`supabase link` / `migration list` / `db push`) and read-only prod queries (`supabase db query --linked "select …"`, uses the CLI's own auth — no service-role key in the shell). A separate, manual step from the Vercel deploy. |
| **antigravity (agy)** | Baseline cold judgment-layer PR review via `scripts/cross-review.mjs` (see *Review & merge*). |
| **devin** | Added independent review for high-risk migrations, tenancy, auth, concurrency and shared infrastructure. Default router is sufficient; named premium models may be plan-gated. |
| **cursor-agent** | Quota-aware specialist/tie-breaker (SQL, boundary contracts, disputed findings). Auto is acceptable; prefer Anthropic then Grok when model selection/quota permits. |

This means a story can go from code → verified → preview-deployed → live-tested on a branch, then
merged to production via PR — with verification at each step. Actions that touch live production, real
money, or paid infrastructure are surfaced to the product owner for a green light before running.

**Dynamic/parallel-agent workflows — available, not required.** Some coding-agent tools can fan a task
across many parallel subagents with independent verification and adversarial cross-checking. This is
**token-heavy**, so it's worth reserving for two cases: (1) **repo-wide doc↔code drift audits**, and
(2) an **optional adversarial second review of HIGH-risk money-path PRs**. It is **never a gate and
never required**: the deterministic CI gate plus a single-pass reviewer remain the baseline.
