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
7. **PR → review → merge to `main`.** Open a PR early (draft is fine); keep it updated with a self-QA
   note **and a risk tier** (see *Review & merge* below). Trigger the reviewer (a fresh agent, not the
   builder — see *Review & merge* below). When the deterministic gate is green, the review is clean,
   and the merge is authorized for the PR's risk tier, merge to `main`. **Merging to `main` is the
   production deploy** — fill in your project's actual deploy mechanism/timing here. Small epics merge
   once; larger ones may merge per sprint. Delete the branch after merge.
8. **Continue / close.** Roll into the next story. At **sprint close**, emit the sprint-wrap terminal
   summary (`SESSION-KICKOFFS.md` §7) — a thin pointer to the sprint doc + what's owed/next, never a
   re-summary. At **epic close**, do the epic Definition of Done (below) — including updating the
   product poster.

## Review & merge — cross-agent
With multiple agents potentially running in parallel, the agent that **builds** a PR is not the one
that **approves** it — a fresh reviewer re-derives intent from the diff alone and catches what the
author's context-bias hides. Two layers do this, and they're complementary:
- **CI (determinism):** a deterministic gate on every PR — the tireless gate that never forgets or
  runs out of tokens; a red CI blocks merge. Typecheck + build + your test suite against the PR's
  preview (if your rail has one) is the minimum shape; adapt to your actual stack. If a repo has no
  per-branch preview (deploys post-merge only), there is correspondingly no e2e-vs-preview step in its
  gate — that's correct, not a gap.
- **Reviewer (judgment):** a **fresh reviewer agent** re-derives intent from the diff alone and checks
  correctness, architecture, and the rules from your project's `AGENTS.md`. Keep review a **single
  pass on a green CI gate** — not an iterative refine loop (that loop is the dominant token cost in
  multi-agent dev; let the deterministic gate carry the repetitive checking and have the reviewer read
  once). The reviewer must be a different agent than the one that built the PR.
- **Cross-agent second opinion (advisory) — run locally on every PR:** `node scripts/cross-review.mjs
  <PR#> --agent codex|antigravity` pipes the PR diff into a **different model family's** CLI for one
  pass and posts the findings as a clearly-labeled PR comment. It exists only to surface another
  family's blind spots. **Advisory only** — it never gates, blocks, or authorizes a merge (CI + the
  fresh reviewer + the risk-tier rule below stay the sole sources of truth), and it is **single-pass**
  (no debate loop). It reads the same shared prompt the human reviewer does
  (`scripts/cross-review.prompt.md`). `--skip-trivial` skips docs-only / tiny diffs. Fill in your
  project's own driving-a-young-foreign-CLI gotchas here as you hit them (version pinning, `--help`
  quirks, headless-auth limits) — see the origin project's LEARNINGS.md "Tooling gotchas" section for
  a worked example set.

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
  comments, and PR descriptions. **TEMPLATE FILL-IN:** if your project's user-facing app copy has its
  own language/locale policy (a default + a bilingual allow-list, for example), state it here and in
  `AGENTS.md` — don't make a new surface bilingual by default; extend any allow-list deliberately.
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

**TEMPLATE FILL-IN:** list your project's authenticated CLI access here (git/gh, your deploy
platform's CLI, your database CLI, Docker, node/npm) — the origin project's table is a useful shape to
copy and refill:

| Tool | Used for |
|------|----------|
| **git / gh** | Version control, feature branches, pull requests + merges, GitHub operations |
| **node / npm** | Type-check (`tsc`), lint (`eslint`), build (`npm run build`), local dev server |

This means a story can go from code → verified → preview-deployed → live-tested on a branch, then
merged to production via PR — with verification at each step. Actions that touch live production, real
money, or paid infrastructure are surfaced to the product owner for a green light before running.

**Dynamic/parallel-agent workflows — available, not required.** Some coding-agent tools can fan a task
across many parallel subagents with independent verification and adversarial cross-checking. This is
**token-heavy**, so it's worth reserving for two cases: (1) **repo-wide doc↔code drift audits**, and
(2) an **optional adversarial second review of HIGH-risk money-path PRs**. It is **never a gate and
never required**: the deterministic CI gate plus a single-pass reviewer remain the baseline.
