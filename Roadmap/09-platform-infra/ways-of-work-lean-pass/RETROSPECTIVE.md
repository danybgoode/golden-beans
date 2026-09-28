# Ways-of-work lean pass — remove the training wheels, close the adoption gap — Retrospective

_Closed: 2026-09-16_

## What shipped

Three sprints across three repos, one orchestrated run (Opus 5), stacked branches per repo.

**Sprint 1 — permissions, the deny list, auto mode.** dobby-foundation#10 · golden-beans#143 ·
miyagi-product-management#175.
- `dobby-foundation` plans itself in its own `Roadmap/`, spawned from its own template (S1.1).
- A committed `permissions` block in all three repos: verb-class **allow** (never a command that destroys
  uncommitted work — an allowed command skips the auto-mode classifier), **deny** for the
  irreversible-by-rule, **ask** for production secrets and env writes. Every deny/ask rule is cited in
  `.claude/permissions-ledger.json`; `permissions-smoke.mjs` fails on an uncited rule, a stale entry, a
  literal allow, a missing baseline guardrail, or project-level auto mode.
- **S1.4 corrected, not shipped as written:** `defaultMode: "auto"` in a project settings file is ignored
  *and* masks the user default (Claude Code docs), so auto mode stays a user setting and the smoke fails on
  a project-level one.

**Sprint 2 — one review stack.** dobby-foundation#13 (replacing #11), #12, #14, #15, #16 ·
golden-beans#144, #145 · miyagi-product-management#176, #177, #178.
- The stack: CI → fresh `pr-reviewer` → **one** external cross-family pass → a **lean security lens** when a
  `securityPaths` glob is touched or the body declares `risk: high`. `reviewScope` in
  `scripts/review-config.json` says which PRs get it: `every-pr` (template, golden-beans) or
  `security-paths-only` (medusa, its pre-launch posture). The builder merges at any tier.
- `review-route.mjs` 273 → ~150 lines; the second pass, the four-row table, the HIGH-only fresh reviewer and
  the refund protocol are gone; a family never reviews its own diff; `--exclude` routes past a capped one.
- **A silent reviewer is a FAILED run:** `review-guard.mjs` rejects empty, structureless and raw-tool-call
  replies, posts `pending` before the CLI is checked, pins the reviewed sha, prints a rejected reply in full,
  and fails the PR's `cross-review/<lens>` status. Measured over 1,019 real reviewer replies.
- The fresh reviewer ships in the plugin; `cross-review.prompt.md` is one bar for both readers; medusa's two
  doctors became one `cross-agent-doctor.mjs`; groom's mandatory panel offer is gone.
- **S2.7 re-scoped (no API key exists or will):** the security review is the lean lens, plus a deterministic
  floor enabled as repo settings — secret scanning with push protection on all five repos, CodeQL default
  setup on `miyagisanchezcommerce` and `medusa-bonsai-backend`.

**Sprint 3 — the ceremony diet and the derivable DoD.** dobby-foundation#17 · golden-beans#146 ·
miyagi-product-management#179.
- Template `WAYS-OF-WORKING` 446 → 226 rendered lines; groom `SKILL.md` 514 → 219 (budget enforced in CI).
- The consumers' docs keep **only** their own paragraphs: golden-beans 468 → 343 lines; medusa-bonsai 569 → 567, because
  what it carries is genuinely its own (the pre-launch posture, flags, prose rail, QA harness, doc conventions) —
  its duplicated DoDs, second escalate list and contradicting merge lines are gone.
- `epic-dod.mjs --check` derives five DoD items; the escalate trigger list lives in one place.
- `WAYS-OF-WORKING.md` is **generated** in the template, the foundation and both consuming projects from one
  source plus each project's `fill-ins.yml`; CI (and golden-beans' `check-template-drift`) fails on drift.

## What went well

- **The locking pass paid for itself before any code.** It found that S1.4 could not work as written, that
  golden-beans documented `supabase db push` as its migration path, that medusa's 08-10 posture conflicted
  with the epic's review scope, and that no Anthropic API key existed for S2.7 — four scope corrections made
  out loud instead of discovered mid-build.
- **The new review stack found real defects in its own construction**, repeatedly: `git add -u` and
  `git commit --all` slipping past the staging rules; an allow list that pre-approved work-destroying
  commands; a guard that would have rejected genuine reviews; basename-only globs that missed every App
  Router route; a 100-file cap that made the security trigger fail open — found **three times
  independently** (codex on two PRs and the security lens itself).
- **Measuring beat asserting.** The output guard was tuned against 1,019 real historical replies, and the
  first honest measurement (229) was wrong because its population was too narrow — the fresh reviewer's
  re-derivation over the full set is what exposed it.
- **Byte-identical shared scripts** across three repos held, with the consuming projects' prettier style as
  the common format.

## What we learned

- **A setting that "turns something on" can silently turn it off.** Project-level `defaultMode: "auto"` is
  ignored *and* masks the user default. A config guard should fail on the wrong-scope setting, not just the
  missing one.
- **An allowed command skips the classifier.** The allow list is not "safe verbs" in the abstract — it is
  the set of commands that run with *no* second look, so it must never contain one that destroys work.
- **A deny rule is text matching, and text matching has holes you only find by trying.** In a live session
  `PATH=/x:$PATH vercel deploy --prod` escaped a bare `vercel deploy*` rule, while `FOO=1 …` and a literal
  `PATH=/x …` were refused. The expansion-safe rules were then **verified behaviourally on 2026-09-17**:
  `permissions-smoke --live` ran 54 benign probes (the staging family, bare / `FOO=1 …` / `env FOO=1 …`)
  with no rules — all ran — and again with the committed rules — all 54 refused, in each repo.
- **Claude Code refuses a `PATH=`-prefixed command on its own**, whatever the rules say: "prepending a
  directory to PATH before invoking git is a binary-hijacking pattern … regardless of the harmless-shim
  framing". So the exact escape observed on 09-16 cannot even be replayed under `dontAsk`, and the replay
  probes with `FOO=1`, which runs and exercises the same `*=*` / `env *` rule forms. A probe the platform
  will not run can never have a baseline.
- **"I could not check" and "there is nothing" must stay different states — including when a tool *lies by
  omission*.** `gh pr view --json files` silently caps at 100; the guard handled `gh` failing but not `gh`
  truncating, and then handled truncation but not an unreadable count. Each fix was one state short of the
  last.
- **A test fixture that runs git inside a hook must strip `GIT_*` env vars.** From a linked worktree git
  exports `GIT_DIR` pointing at the real repo; medusa's pre-push test flipped `core.bare` to `true` and
  rewrote the repo identity. golden-beans had hit the same class two weeks earlier.
- **A per-rule patch cannot close a rule CLASS.** The first expansion-safe pass added `*=*` and `env *` forms
  to the four rules that had been probed by hand — and left `vercel --yes --prod`, `rm -fr`, `supabase db
  reset`, `git push origin +main`, `git -C <path> push --force` and `npx supabase --debug db push` matching
  nothing. Three review rounds found them one at a time. The fix that ended it was structural: the smoke
  now GENERATES the prefixed probes from a `CRITICAL_COMMANDS` list, so a bare-only rule fails the contract
  instead of waiting for a reviewer. The list's own boundary is written into the file: it matches command
  TEXT, so it is not a sandbox — the classifier is the second floor, and `--live` proves the matcher.
- **A behavioural test needs a baseline the system will actually produce.** `--live` shipped asking a
  throwaway session to run every probe with no rules, so a later refusal would prove the rule. It had never
  run successfully, and the first real run found four faults in turn: it built a PATH shim named
  `PATH=/x:$PATH`; its temp workspace was untrusted, so Claude Code silently ignored the rules under test;
  ~300 probes overflowed a session with no `--max-turns` to raise; and — decisively — a session told the
  destructive probes were harmless shims **refused them anyway**, with the commands explicitly allowed. That
  refusal is the second floor working, but it means those probes can have no baseline. `--live` now
  replays only the benign staging family, where a refusal can only be the rule, and says how many of the
  rules that covers. A test that has never gone green has not tested anything yet.
- **A rule can be INERT and look enforced.** All three repos denied `Write(<path>)` next to `Edit(<path>)`.
  Claude Code checks only `Edit` for file tools — and a nested `claude -p` session refuses to start while a
  Write rule is present, which is how we found it: by trying to run the security lens through the CLI.
  Eleven rules protected nothing. `permissions-smoke` now reports a Write rule as `inert-write-rule`.
- **"Every family unavailable" is a state the process has to survive.** At S3's close codex was usage-capped,
  agy quota-capped on every model, vibe ran out of turns on a 300 KB diff, and the nested CLI was blocked.
  The stack's answer held: the layer is named SHORT in the PR body rather than left to look clean.
- **Deleting a base branch closes its stacked PRs, permanently.** Merge the base without deleting it until
  the stack has landed.
- **`git checkout -- <file>` while juggling stacked branches silently discarded a finished spec.** Commit
  work in progress before switching; a stash is not a save.

## Gaps / follow-ups

**Closed after the epic (2026-09-17):**
- ✅ **Three repo-level git identities reset** by the product owner (test fixtures had overwritten them).
- ✅ **S1.5 — local allow lists pruned.** medusa's `.claude/settings.local.json` 177 → 3 entries,
  golden-beans' 29 → 1 (backups kept as `.bak`). Gone: `rm -rf .git`, `vercel --prod --yes` and ~170 literal
  one-offs, plus every machine-local `Read(//…)` grant. `permissions-smoke` exits 0 in both — it reported
  131 `literal-local-allow` findings in medusa alone.
- ✅ **`--live` run in all three repos** — 54/54 benign probes ran without rules and were refused with them,
  prefixed spellings included. Getting there took four harness fixes (see *What we learned*). Note the
  path: dobby-foundation ships the script as `template/scripts/permissions-smoke.mjs`; the instruction that
  said `scripts/…` for every repo was wrong for this one.

**Still open:**
- **S1.4's "a LOW-tier epic run produces zero prompts"** was not observed end to end in a fresh session.

**Deliberately not done / not met:**
- **Template `WAYS-OF-WORKING` is 226 lines, not ≤160.** What remains is rules, not reasoning: cadence,
  epic-mode's five practices, the betting table and four rules, the review stack, the one escalate list,
  permissions, three Definitions of Done, the docs map, conventions. Cutting further meant deleting a rule
  to hit a number; the reasoning already moved to `references/`. The first cut reached 194 by dropping rules
  without a ledger entry — the fresh reviewer caught it, and restoring them is the difference.
- **`codex-delegate.mjs`** (a second worker pool vs. Claude spawning Claude) was left undecided, as the audit
  left it.
- The two medusa **app repos** carry no `review-config.json` of their own; their reviews run from the root
  checkout, whose config lists their money/auth paths.

**Pre-existing defects found and left in scope of a later epic** (byte-identical template copies, unchanged
here): `roadmap-to-notion.mjs` accepts `status: queued` on an epic; `build-order.mjs` writes epic links as
`../../<macro>/…` from `Roadmap/00-ideas/`, which resolves outside `Roadmap/`; `--sync` never writes a seed's
`appetite`/`underwritten_by`.

## Cut ledger — every paragraph removed from a WAYS-OF-WORKING or SKILL.md

**(a) moved** · **(b) replaced by a check** · **(c) deliberately dropped**

*Template `WAYS-OF-WORKING` (446 → 226):*
- (a) Betting & appetite — the Shape Up reasoning (sausage machine, why sessions, appetite as constraint,
  circuit breaker, underwriting, letting pitches go) → `template/references/shapeup/README.md`.
- (a) Review & merge — why one pass + one fresh reviewer, the guard's history, why the version is recorded
  not pinned, why a capped family falls through → `template/references/review-stack.md`.
- (a) The reporting register ("outcome → behaviour → implementation") → its SSOT, `prose-draft.prompt.md`.
- (b) "Planning commits — own worktree + path-limited" → the deny list refuses whole-tree staging.
- (b) The kill-switch DoD item's polarity detail → `groom/references/kill-switch.md` (the one home).
- (b) Nine-item epic DoD → `epic-dod.mjs --check` for five; three judgment items stay prose.
- (b) "Branch + preview hygiene" prose → the rail's own prune tooling, named per project in `fill-ins.yml`.
- (c) The four-row reviewer table, "two cross-family passes", the refund pause, "the builder never merges
  their own PR" — superseded by S2's policy, not moved.
- (c) "Dynamic/parallel-agent workflows — available, not required" — no longer describes a gate or a
  practice any project follows.

*groom `SKILL.md` (514 → 219):* the question bank, archetype table, bug-path detail, kill-switch taxonomy,
per-sprint kickoff sample, smoke-walkthrough format and Stage 9 cadence → (a) `groom/references/`, verbatim.
The 8c two-pass review policy and both mandatory panel offers → (c) superseded by S2. Guardrails that
restated stages → (c) folded into one-liners.

*medusa-bonsai `WAYS-OF-WORKING` (regenerated, 569 → 567):* `fill-ins.yml` was rebuilt paragraph by paragraph.
- Kept verbatim as its own: operating posture, feature flags, the deploy rail, the prose rail, the Playwright
  harness, the epic-mode specifics (AGENTS onboarding, Codex delegation, generated kickoffs, pre-launch smoke,
  migrations, derive-state/journal-intent), the live-confirmation split, the draft→ready flip, close-out prose,
  the live-smoke default, poster Feature map/Recent highlights, doc conventions, branch+preview hygiene, model
  tiers, `Roadmap/` in git, the tooling table.
- (b) Roles, unit of work, cadence items 1–6, the epic-mode shared practices (lock, stack, route, merges don't
  wait, compact), Review & merge, the three focused questions, DoR, story DoD, the nine-item epic DoD, the
  generic docs map, gitflow, path-limited commits, docs-track-code, session hygiene, parallel agents — the
  template states each; the escalate list inside *Model tiers* now points at the ONE list.
- (c) "Dynamic workflows — available, not required"; "surfaced to Daniel for a green light" (contradicted the
  pre-authorized run; the template's irreversibility line replaces it); the second Team-memory DoD/docs lines.

*golden-beans `WAYS-OF-WORKING` (regenerated, 468 → 343):*
- Kept verbatim as its own: the approved-design-is-scope amendment (its own slot), epic items *one architect*,
  *assembly line*, *surface scope-breaking findings*, the model-routing table, verifying delegated work,
  shipping a merge (the main-report daemon), the draft→ready flip, poster specifics, the landing backfill,
  grooming cadence, the language policy, the tooling table.
- (a) Betting & appetite full text → `references/shapeup/README.md` (the template keeps the table and rules);
  kill-switch polarity → `groom/references/kill-switch.md`, cited from a one-line DoD item.
- (b) Roles, unit of work, cadence 1–6, epic items 5–8, Review & merge, DoR, story/epic DoD, Automated QA,
  docs map, gitflow, preview hygiene, path-limited commits, model tiers + its escalate list, docs-track-code,
  session hygiene, parallel agents — the template states each.
- (c) "Pre-authorized merges … kill-switch polarity verified" (superseded by the template's pre-authorization
  rule); the routing row "PR review — a PRIMARY gate" (reviews authorize nothing); the "fill in your deploy
  rail" and "fill in your deploy mechanism" placeholders; "merge is authorized for the PR's risk tier";
  "Dynamic/parallel-agent workflows"; "green light before running".
