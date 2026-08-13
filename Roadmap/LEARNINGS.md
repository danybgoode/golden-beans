# Learnings — operating notes for every build

**Read this at the start of every session.** It's the distilled, cross-cutting wisdom from past
epics' retrospectives — the things that would have saved the last agent time. The full story of any
item lives in its epic's `RETROSPECTIVE.md`; this file keeps only the *transferable* rule.

**How this file stays useful (Definition of Done, epic):** at epic close, promote any durable,
generalizable learning from your `RETROSPECTIVE.md` into the right section below — a one-liner + a
*why* + the date/source. **Dedupe** (sharpen the existing line, don't append a near-duplicate). If a
rule here is now wrong, fix or delete it. Keep it short — a long digest is an unread digest.

**TEMPLATE NOTE:** the entries below are a curated, generalized subset carried over from the origin
project (`dobby-foundation`'s own extraction) — the tooling/process gotchas that don't depend on any
particular stack. As you build this project, your own entries will accumulate here; keep the same
one-liner + why + date shape.

---

## Multi-agent & async deploy coordination
*If several agents work in parallel on their own branches, against repos that deploy independently.*

- **Rollout ORDER is part of a cross-repo feature's design, not an afterthought — the receiver must
  hold the shared secret before delivery is enabled.** event-destination-router delivers to a
  Miyagi endpoint that fails **closed** (401) when its `GOLDEN_BEANS_WEBHOOK_SECRET` is unset, and
  Golden Beans classifies 401 as a **permanent** 4xx → immediate dead-letter. So flipping
  `DESTINATION_DELIVERY_ENABLED` before the secret reached Miyagi's Cloud Run would have
  dead-lettered the entire queued backlog in one pass, unrecoverable except by operator replay. The
  correct order (2026-07-22): (1) secret into the receiver **and verified loaded** — the fail-closed
  body (`Unauthorized`) differs from the bad-signature body (`Invalid signature`), so "is the secret
  live?" is observable without a valid signature; (2) create the destination **born disabled**;
  (3) a hand-signed test delivery while still dark; (4) enable; (5) flip the flag. **Generate the
  shared secret yourself** so both sides match — the producer UI's mint-and-show-once path otherwise
  creates a chicken-and-egg with the consumer's env.
- **Vercel production env vars are write-only (sensitive by default) and need a REBUILD to reach
  running functions — and the rebuild must be a commit to `main`, not `vercel redeploy`** (AGENTS
  rule #4). `vercel env pull` returning an empty value for a var you just set is expected, not a
  failure. Verify the flip against the running endpoint's behavior, never against a pull.
  **Corollary — `vercel env run` can load the repo's existing `.env.local` over the requested
  production environment.** Entity-journeys S3 requested Production and silently received
  `SUPABASE_URL=127.0.0.1`; check only the selected hostname before trusting the process. Never rename
  or overwrite the user's local file to work around it. For an authorized production proof, the
  linked `supabase db query --linked` Management API can mint a one-use key/token, normal HTTP ingest
  can exercise the real path, and a `finally` cleanup can revoke both—without pulling a service-role
  secret into the shell.

- **`main` moves under you.** Before opening a PR — and again if it sits open — **merge latest `main`
  into your branch**. Tell-tale: CI fails on a spec/check for something you never touched → a sibling
  agent landed something on `main` and your preview (if you have one) predates it. **A re-run alone
  won't fix it** — the mismatch is structural; only `git merge origin/main` + push clears it. Confirm
  with `git log HEAD..origin/main`.
  **Corollary — the stale-vs-fresh mismatch can hit your own NEW code too, not just an untouched
  check, when a sibling PR changes a shared file's CONVENTIONS (a lint rule, not a feature).** The
  diagnostic tell: check whether a FAILING assertion is about a rule/convention that changed, not just
  a feature/data mismatch.
- **Announce cross-cutting or direct-to-`main` changes**, and prefer a PR even for "engine" features.
  Anything touching shared surface — a root layout/middleware file, global styles, `package.json`/deps,
  a new sibling worktree — can break every other open PR.
- **Don't yank a shared branch out from under another agent.** If the repo's working tree is on
  someone else's branch, do your change in an isolated `git worktree` instead of switching it.
  **Corollary — checking CI status and merging a PR need no local checkout at all.** `gh pr checks <N>`
  and `gh pr merge <N>` operate against the pushed remote branch via the GitHub API; they don't care
  what's checked out locally.
- **Before building a story, grep whether a sibling PR already fixed the identical root cause.** Two
  epics approved the same day can target the same bug from different scope docs. Check
  `git log --oneline -- <the file the story's root-cause names>` + `gh pr list` during research, not
  assumed.
- **Risk tier decides who merges**: low-risk → the reviewer/agent may merge on green CI; anything
  touching money / auth / DB / shared infra → the product owner merges. When unsure, treat as high.
  **Corollary — an explicit "merge on green" authorization changes who decides to pause and check in,
  not whether the review layers themselves still run.** "Merge on green" is permission to proceed
  through the established gate without re-asking at each step, not permission to skip the gate.
  **Corollary — a "merge on green" given for one PR does not carry forward to a LATER PR in the same
  session/epic, even a similarly-scoped one**, and a builder's own plan can promise a review step the
  standing authorization never touched. Re-check whether a standing "merge on green" was given for
  *this* PR/story, not just somewhere earlier in the conversation.
  **Corollary — a broad wrap-up instruction ("wrap up all around as per process", "yes, proceed")
  authorizes the ORDINARY steps of that process, not a categorically more consequential action
  inside it** — a production deploy, or fetching/printing a live secret key to mint a new
  credential. Hit live in growth-engine-v1 S4: "merge on green" clearly covered the PR merge, but
  "wrap up all around as per process" was not read as covering the `vercel --prod` deploy that
  followed, nor a later credential-fetch to seed a disposable smoke-test row — both got blocked
  after the fact and needed the product owner to name each action specifically, even after a
  generic "yes you are authorized to proceed." Don't assume a broad wrap-up instruction cascades
  into deploy/credential territory — surface each such step by name and let the product owner opt
  in to it specifically. *(2026-07-16, growth-engine-v1 S4.)*
- **When your branch is BEHIND `main`, the two-dot `git diff main..HEAD` lies — read the three-dot.**
  Two-dot compares tips directly, so it folds in the *inverse* of every commit `main` gained since you
  branched (a sibling epic's new files show up as "deletions" in your diff — alarming and wrong).
  Review with **three-dot `git diff main...HEAD`** (merge-base→HEAD = only your changes), and **merge
  `origin/main` into the branch before merging the PR** so the merged tree is what actually ships.
- **A squash-merged sprint branch is a dead end — start the next sprint on a FRESH branch off `main`.**
  A squash-merged PR's individual commits aren't on `main` (only the one squash commit is), so
  continuing that branch for the next sprint re-introduces a messy duplicate diff and can't
  fast-forward. Branch clean off `origin/main` for each new sprint.
- **To verify "is the prior sprint serving?", reason off `origin/main` — never the working tree — and
  read PR *state*, not branch commits.** Local app checkouts routinely sit on *other* agents'
  branches, so on-disk files lie about `main`, and a squash-merged sprint's individual commits
  genuinely aren't on `main`. Confirm with `gh pr view <#> --json state,mergeCommit` or `git fetch`
  then `git grep <x> origin/main` — an `ls`/working-tree read is not evidence about `main`.
- **Concurrent planning commits in a shared worktree collide the git index.** Fix: (1) **path-limited
  commits** — `git add <your files>` + `git commit -- <those paths>`, never `git add -A`; (2) for
  parallel planning, give each session its own worktree, or appoint a single **scribe** for shared
  files (like `BUILD-ORDER.md`).
- **A subagent/fork that dies mid-task from a shared session rate-limit still returns a `result` — that
  text is its last tool-call narration, not a trustworthy completion claim.** After any subagent/fork
  batch — especially one large enough to plausibly share a rate-limit, or any showing a failed status —
  re-derive actual file state directly (grep the real repo) and run the language's type-checker/build
  before treating the batch as complete.
  **Sharpened 2026-07-25 — the danger is not just an INCOMPLETE task, it is a HALF-APPLIED one, and
  the worst case is a security mutation left in the tree.** A subagent writing the unit-test layer was
  instructed to mutation-check each spec (break the line, confirm red, revert). It died from a session
  rate-limit *between the break and the revert*, leaving
  `apps/web/lib/webhook-signature.ts` with `timingSafeEqual` swapped for `a === b` — timing-attack
  protection silently removed — while its returned `result` read as ordinary progress ("Now mutation
  8..."). Nothing failed; the tests passed, because the mutation was functionally equivalent for
  equality. **So the check after any delegated batch is `git diff HEAD` for SOURCE files the task had
  no business modifying, not just "did the new files appear".** A task that deliberately mutates code
  as part of its method must be assumed to have left a mutation behind, and any agent asked to
  mutation-check should be told to revert-then-verify-clean as its final step. *(2026-07-25, the
  quality-rails epic.)*
- **When you delegate a whole epic, do the SHARED-SURFACE work yourself and FIRST.** CI config, lint
  config, `package.json`, a `lib/` seam several stories import: every branch opened after it inherits
  it, and every branch opened before it conflicts with it. Sequencing it first is what makes parallel
  story agents safe. Corollary: read-only research over a large or foreign codebase is the ideal
  parallel-background task (no write conflicts at all) — and ask it for an explicit **"NOT DERIVABLE"
  list**, because an honest gap is far more useful than an optimistic guess and is the thing you most
  need before designing against someone else's data. *(2026-07-25.)*
- **Before setting a production env var, confirm which rail is *actually* serving production traffic —
  don't assume it's the one named in the project's original deploy docs.** Set `GROWTH_ENGINE_URL`/
  `GROWTH_ENGINE_API_KEY` on Vercel's production scope for a consumer whose frontend had silently
  moved to Cloud Run days earlier (a sibling epic's own cutover); the vars never reached the running
  site, and the fire-and-forget forwarder (correctly) no-op'd on every real request with zero error —
  looked identical to "not yet triggered" until a live smoke + a direct `gcloud run services describe`
  env-var diff caught it. Check the live service's actual env, not the platform you assume is prod,
  before wiring a new integration into someone else's already-shipped surface. **Corollary — an
  incremental `gcloud run services update --update-env-vars/--update-secrets` is far safer than
  reconstructing a full `gcloud run deploy` from a hand-crafted script you don't have every value for**
  (the full command replaces the ENTIRE env/secret set; a missing default silently clobbers unrelated
  production config). Patch live incrementally, then separately fix the deploy script's source so the
  NEXT full redeploy doesn't regress it — two commits, not one risky one.
- **"Reads Miyagi's Supabase" is not one fact — a sibling system can have MULTIPLE databases wearing
  similar names, and only ONE of them is actually a Supabase project.** Growth Engine v1 S3 assumed
  `financial_event` (a Medusa CORE MODULE table) was reachable the same way `platform_flags` is — via
  Supabase's REST API with a service-role key — because both "live in Miyagi." Wrong: `platform_flags`
  lives in a small auxiliary Supabase project (`xljxqymsuyhlnorfrnno`, confirmed via medusa-bonsai's
  own `LEARNINGS.md` — this project is ALSO shared between local dev and production, no separate
  staging DB, unlike Stripe/GCP-style credentials); Medusa's own commerce/module tables (including
  `financial_event`) live in Medusa's PRIMARY Postgres, a completely different database reached via a
  plain connection string (`DATABASE_URL`, GCP Secret Manager, project `miyagisanchezback-497722` —
  a **Cloud SQL instance** (`medusa-pg`), confirmed via `gcloud sql instances list`; the sibling
  `NEON_BACKUP_DSN` secret is just a backup destination, NOT the primary DB — an initial guess this
  meant "Neon-hosted" was wrong and corrected here, exactly the kind of assumption worth verifying
  rather than inferring from a secret's name), not Supabase's REST API at all. The failure was loud
  and immediate ("table not found in schema cache"), not silent — but it still cost a full round-trip
  before the real fix (swap `@supabase/supabase-js` for a raw `pg` client). **Before writing ANY
  cross-repo read, confirm which physical database a specific table lives in — don't infer it from a
  sibling table's access pattern, even one in the "same" system, AND don't infer a provider from a
  secret's name either.** `gcloud secrets list --project=<gcp-project>` (names only, no values) is a
  safe, narrow way to discover what credentials actually exist for a sibling system before assuming a
  shape from docs; `gcloud sql instances list` (also names/metadata only) confirms the actual DB
  provider/networking. *(2026-07-15, growth-engine-v1 S3.)*
- **A correct connection string can still be network-unreachable — "credentials exist" and "you can
  reach the host" are two separate facts.** Continuing the S3 story above: even with the right
  `DATABASE_URL`, connecting from outside GCP hung indefinitely rather than erroring (`medusa-pg` has
  `ipv4Enabled: False` — no public IP, VPC-private only, confirmed via `gcloud sql instances list`'s
  `IPV4_ENABLED` column). A **local Cloud SQL Auth Proxy tunnel did NOT fix this** — the proxy only
  bridges the IAM/discovery layer; it still needs an actual network path (VPN/Interconnect) into that
  VPC, which didn't exist from this environment. **The only fix for a private-IP-only Cloud SQL
  instance is running from somewhere already inside that VPC** — a one-off Cloud Run Job attached to
  the SAME VPC connector a real service already uses (found via `gcloud run services describe
  <service> --format="value(...vpc-access-connector)"` on the sibling system's own backend service,
  never guessed) is a clean, temporary way to do this: deploy with `--vpc-connector`/`--vpc-egress`,
  bind secrets directly via `--set-secrets` (Cloud Run reads them from Secret Manager at runtime — the
  agent never has to fetch/hold the plaintext value at all), run once, then delete the job AND any
  container images Cloud Build produced (`gcloud artifacts docker images list/delete`) AND revert any
  IAM binding added just to make it work — a temporary job should leave zero standing resources or
  permissions behind. **Symptom to watch for:** a DB connection that HANGS (no error at all) rather
  than failing is the tell for "unreachable network," not "wrong credentials" (which fails fast) — set
  a short `connectionTimeoutMillis`/equivalent immediately when diagnosing, don't wait on the default.
  *(2026-07-15, growth-engine-v1 S3.)*
- **A script with a co-located pure-logic test file MUST guard its `main()` call with an `isMain`
  check.** Importing a script that calls `main()` unconditionally at module scope re-executes the
  whole script for real (shell-outs, notifications, git pushes, all of it) the moment a test file
  loads it for its pure helpers: `const isMain = process.argv[1] && …; if (isMain) main()`.
- **Run the repo binaries directly when `npm`/`npx` chokes.** A sibling worktree that reuses the same
  `package.json` name as the main checkout breaks npm **workspace resolution** at the monorepo root.
  Use the binary path directly (`node /…/node_modules/typescript/bin/tsc --noEmit`,
  `/…/node_modules/.bin/{next,playwright}`). New worktrees should use a unique package name or be
  excluded from the root `workspaces` glob.
- **A worktree needing its own `npm install` forces worktree-local binaries for everything, including
  test runners.** A fresh `git worktree` resolves most tooling fine via walk-up to the root
  `node_modules`, but if any dependency needs a local install (e.g. a CSS framework's PostCSS plugin
  resolution), that install adds a worktree-local copy of your test framework too — switch to the
  **worktree-local** binary path, or you'll hit "two different versions" / "No tests found" errors.
- **`gh pr merge --delete-branch` fails when a worktree holds `main`.** The merge still succeeds on
  GitHub; only the local branch-delete errors. Verify with `gh pr view <n> --json state`.
- **A server-side `process.env.X ?? \`https://${req.headers.get('host')}\`` fallback is a real
  production landmine, distinct from client-bundle build-time-inlining bugs.** The trap is the
  Host-header fallback when the env var is unset: a bare container run without an explicit runtime env
  var can get a literal `0.0.0.0:PORT` or similar garbage as the `Host` header, and the fallback
  happily builds a broken URL from it — dangerous on any redirect-URL-building code path (OAuth
  callbacks, payment-provider return URLs). Fix: one shared `resolveOrigin()`-style helper that
  rejects obviously-wrong hosts and **throws instead of silently building a broken URL** — a loud
  failure beats a dead redirect.
- **A unit-tested pure helper can't live in the same file as code that imports a framework/runtime-only
  module** (e.g. a Next.js `next/cache` import, or an auth SDK's server-only entrypoint). A generic
  test runner that can't load that module throws an opaque, unrelated-looking error the moment it
  imports the file at all — even if the pure function itself never touches the framework-only code.
  Keep the pure logic in its own zero-import file; let the framework-touching wrapper import *it*.
- **Swapping a framework-generated artifact for a hand-rolled route breaks specs on exact format.**
  Converting a typed/generated file (robots.txt, sitemap, OG image, metadata) to a hand-rolled
  equivalent can silently change output details (header casing, field order) that an existing spec
  asserted on. When you replace anything a framework generates, diff the *exact bytes* the old one
  emitted and grep the suite for any spec asserting that surface.
- **CI sometimes just doesn't schedule a workflow for a PR.** Seen occasionally on `opened`; close/
  reopen doesn't always fix it — an empty-commit push (a real `synchronize` event) does. Don't merge
  on an absent gate: re-trigger, and lean on the local gate + a green preview as the real signal.
- **`node --test <dir>` (bare directory) can silently fail to discover tests depending on your Node
  version** — it may try to load the directory as a module instead of globbing it. Use an explicit
  glob: `node --test 'scripts/lib/*.test.mjs'`.
- **A "resolve the PR from the current branch" tool must read PR `state`** — a list/view call can
  return MERGED/CLOSED PRs too, especially for a reused branch name whose PR already merged. Treat
  `state !== 'OPEN'` as "no open PR for this branch" and pair it with a stale-HEAD guard
  (`git rev-parse HEAD` vs the PR's `headRefOid` → warn + require an explicit override) so the first
  run always reviews the current diff.
- **A hosted CLI-authenticated integration (Vercel-style env-var management, similar platforms) can
  silently store or report EMPTY values** through a convenience CLI command even when the underlying
  API call "succeeds." Verify by value **length** where you can't read the value directly (a scoped
  read token may be needed), not just by exit code. **Reproduced again (2026-07-16, commercial-shell
  Sprint 2):** `echo -n "value" | vercel env add NAME production` saved an empty string; explicit
  `vercel env add NAME production --value "value"` is the reliable non-interactive form — pipe-to-stdin
  isn't. Mark a var `--no-sensitive` at creation if it isn't actually secret (a public URL, a feature
  flag) — sensitive-flagged vars can't be read back via `vercel env pull`/`env ls` at all (by design,
  not a bug), so there is no way to verify them short of provider dashboard or live app behavior.
- **A "sensitive"/write-only secret is confirmable by presence/type but not by value** — you can check
  it exists and which environment it targets, but not its actual content, from a CLI or API. Read the
  provider's dashboard, or have the app surface the cause on use (missing key → a specific, classifiable
  error) instead of guessing. **The most reliable verification, when the var isn't secret, is neither
  the dashboard nor the CLI — it's exercising the actual live behavior it controls** (e.g. curl the
  page/route that reads it and check what it renders), which also sidesteps ever needing to pull a
  full env file (including unrelated real secrets) just to confirm one var.
- **When a repo's GitHub↔deploy-platform integration is already connected, a manual CLI deploy
  (`vercel deploy --prod`, etc.) is an out-of-band action that bypasses the git-tracked pipeline —
  don't reach for it to "make a deploy happen."** Confirm what's actually live via the platform's own
  record of the integration (`gh api repos/<owner>/<repo>/deployments` shows the exact commit SHA and
  status per environment) instead of assuming a manual deploy is needed. Env-var-only changes may take
  effect on already-deployed functions with no redeploy at all (observed 2026-07-16) — don't assume a
  fresh deploy is required before checking.
  **CORRECTION (2026-07-21, multi-tenant-activation launch): that "no redeploy" observation does NOT
  generalize, and betting on it costs you a confusing debugging session.** Adding `SIGNUP_ENABLED`
  to Vercel's Production scope left `/signup` returning 404 for 7+ minutes, because Vercel snapshots
  env vars into a deployment at BUILD time and running functions keep serving the values captured at
  their own build. **Treat "env var set" and "env var live" as two separate facts**: setting it is
  half the job, a new deployment (here: a commit to `main`) is what makes it take effect. The
  reliable check is always exercising the behaviour the var controls — a CLI listing shows presence,
  never effect.
- **A local checkout's `node_modules` goes stale the moment a merged PR adds a new dependency** —
  `git pull`-ing the merge commit updates `package.json` on disk but not `node_modules`, so a local
  `tsc`/`build` can fail with `Cannot find module` for code that builds fine everywhere else (CI
  already ran `npm ci` fresh; the hosting platform's build does too). `npm ci` before trusting a local
  build failure as a real regression.
- **Driving a young foreign CLI: run `<cli> --help` first, pin the version, and design for degrade —
  never build against a documented flag from memory.** A less-mature CLI can have surprising interface
  shapes (no JSON output mode, arguments only via argv not stdin, or vice versa) that don't match a
  more mainstream CLI's conventions. Smoke-test by running it against something real and reading the
  actual output before scripting around it.
  **A young foreign CLI can silently break its own contract on a MINOR version bump** — a print mode
  that used to always emit something can start exiting 0 with empty output on a real failure. Treat
  **empty output as failure** (not success), and make any version-pin check **fail loud** so a
  contract break gets caught, not silently absorbed.
  **A CLI authed by an interactive/OAuth login is NOT free to run in CI** — confirm a portable
  non-interactive credential path AND its cost before automating it in a runner; some CLIs have no
  headless auth at all, which may mean an advisory/local-only tool stays local-only rather than
  becoming a CI job.
- **`process.exit()` truncates piped stdout — flush synchronously, or you ship a tool that works to a
  file but crashes in a pipe.** A script that does `console.log(json); process.exit(0)` can produce
  valid output when redirected to a file (sync writes) but truncated output down a pipe, because the
  async stdout write hasn't drained when exit fires. Use a synchronous write before `process.exit`, or
  exit in the write callback. Test a tool the way it's actually invoked (pipe, not just file redirect).
- **Git background auto-maintenance can race a burst of rapid commits and leave stale `*.lock`
  files**, producing intermittent "cannot lock ref" errors. Clear locks recursively
  (`find .git -name '*.lock'`) and run a rapid-commit batch with `git -c gc.auto=0 commit …` so
  auto-maintenance can't re-trigger mid-sequence.
- **A delta-only reporting tool must special-case a missing/wiped baseline as a bounded no-op, never as
  "everything happened."** Diffing current state against an empty/`null` previous snapshot makes every
  historical item look "new" — guard for a missing baseline with ONE bounded summary (counts only)
  instead of enumerating full history, and keep a message-length safety net regardless of the guard.
- **A script with both scheduled state-tracking delivery and on-demand artifact generation must keep
  the artifact mode stateless.** Reusing a stateful window/log rail for an on-demand report mode risks
  silently advancing state a scheduled run depends on — keep on-demand modes explicitly
  non-state-mutating and lock that with a test.

## Review quality
- **A fail-closed evidence context must not be reused by the safety control that stops already-running
  work.** Scenario launch and retry correctly refuse an absent or malformed immutable fault summary,
  but reusing that disclosure-heavy context for `stop` briefly made a legacy running row impossible
  to stop. Separate *eligibility to begin* from *authority to end*: the shutdown path should require
  only project-scoped identity, current lifecycle state, and the policy needed to make the transition.
  Pin the malformed/legacy row as a regression, because happy-path fixtures will always carry the new
  metadata. *(2026-08-13, scenarios-pm-operable.)*
- **A finding's CONCLUSION can be wrong while its OBSERVATION is right — check before accepting AND
  before dismissing.** Three times in one epic: "reduced motion is broken" (false — the token file
  already handled it) exposed that the new motion rule was *dead for `.btn` all along*, losing to a
  token-file selector on specificity; "the canonical-domain change is missing" (false — it was live,
  set out-of-band deliberately, since rollout order requires the env var before the deploy that
  snapshots it) correctly noted the diff alone cannot show it; and a Unicode range given as
  U+2780–2793 was wrong while the gap it named was real (❶ lives at U+2776). The reflex to dismiss on
  the first factual error would have lost all three. **Verify the claim by rendering or probing, then
  answer the observation rather than the conclusion.** *(2026-08-13, landing-frijoles-rebrand.)*
- **A reviewer repeating a finding you reasoned your way out of is a signal to find a third option.**
  Trailing `//` comments were raised twice by the same family. The first triage — that stripping them
  naively eats every `https://`, turning a loud false positive into a quiet false negative — was a
  right concern and a wrong conclusion: the risk was avoidable with a lookbehind, not inherent. A
  well-argued triage still resolves to "no change", and the second raise is the prompt to re-examine
  the premise instead of restating the trade-off. *(2026-08-13, landing-frijoles-rebrand.)*
- **Your GUARDS deserve the same suspicion as your code — three shipped in one epic that could not
  fail.** A reduced-motion spec whose predicate was `hasDuration && animationName !== 'none'`, so the
  transition half could never fire (every element with a transition and no animation reports
  `'none'`). A selection spec bounding a rect at `<= 390` on a 390px viewport, which the broken
  rendering satisfies too. And `check-design-drift.mjs`, which stripped block comments to the empty
  string and so had been reporting **the wrong line number for every violation of its entire
  existence**. A guard that looks like coverage and is not is worse than no guard, because the next
  reader stops there. Mutation-check a guard the way you would a test — break the thing it defends
  and watch it go red. *(2026-08-13, landing-frijoles-rebrand.)*
- **Half a fix reads exactly like a whole one, and can be worse than none.** Making illustrated
  buttons `aria-hidden` spans removed their SEMANTICS and left their AFFORDANCE — `cursor: pointer`
  and the hover state layer — so mouse users were invited to click what screen-reader users could no
  longer find. Strictly worse than before. Same shape as correcting a flag-honesty claim in a
  section's lead paragraph and leaving the identical claim in its card copy one level down. LEARNINGS'
  "grep for its siblings" rule applies to COPY and to ACCESSIBILITY, not only to code.
  *(2026-08-13, landing-frijoles-rebrand.)*
- **Two families beat one family run twice — with a worked example.** Codex ran nine rounds on one PR
  and never noticed the drift guard was naming the wrong line; agy found it in a single pass. Codex
  found the flag-honesty and accessibility defects agy did not. The router's insistence on different
  families is doing real work, not ceremony — and "a clean round from one family is not a stopping
  condition" is the rule that keeps it doing it. *(2026-08-13, landing-frijoles-rebrand.)*
- **A reviewer that read NOTHING still reports "clean" — read the scope line before the findings.**
  An agy round came back with no Blocking and no Should-fix, and its own output said
  `Attached 0 whole file(s); 38 did not fit the budget`: it had seen the unified diff and not one
  file. Accepting that verdict would have ended review three rounds and six real findings early,
  including a `+133%`-on-a-flat-series arithmetic bug on a public page. Rerunning with `--code-only`
  attached files and immediately produced Blocking findings. This generalises past agy: **the
  reviewer's coverage is reported next to its verdict, not inside it**, and a clean verdict from a
  reviewer with degraded input is not evidence. Same family as "a run that exits 0 with empty output
  reads as a clean review" — the failure has just moved from empty output to *confident* output over
  empty input. *(2026-08-12, landing-redesign-v2.)*
- **On concurrency work, most late review findings are bugs in your OWN previous round's fix.**
  event-destination-router S2 took 24 cross-review rounds (Codex; Antigravity went clean at 11), and
  from about round 12 the pattern was consistent: each round's blocking finding was a race introduced
  by the previous round's fix — drain-vs-in-flight, then check-then-act on liveness, then an unlocked
  join, then a batched release that skipped the lock. Iterating *fast* on lock/settle logic
  manufactures new races as quickly as it closes old ones. When a fix touches ordering, locking or
  settlement, slow down and reason about the whole state machine before shipping the next round —
  and expect the reviewer to be right about the thing you just wrote.
- **`UPDATE … FROM other_table` does NOT lock the joined rows.** A liveness/eligibility check written
  as a join reads a snapshot and gives you nothing under READ COMMITTED. If a concurrent writer can
  invalidate what you joined on, take an explicit `SELECT … FOR SHARE` as its **own statement** first
  (the next statement then runs on a fresh snapshot). Pick one lock ORDER for the whole subsystem —
  here every path locks the destination, then the delivery — so the paths can't deadlock.
- **A `CHECK` constraint that evaluates to NULL is a suggestion — PostgreSQL accepts the row.** Only
  an explicit FALSE rejects. `CHECK ((scope='share' AND share_lens IN (...)) OR (scope='ingest' AND
  share_lens IS NULL))` looks airtight and permits exactly the row it appears to forbid: for
  `scope='share', share_lens=NULL` the first arm is `TRUE AND NULL` = NULL, the second is FALSE, and
  `NULL OR FALSE` = NULL. Both the INSERT and an `UPDATE … SET scope='share'` on an existing row
  succeeded. **Wrap any composite predicate in `IS TRUE`** (and add the column-level check as a
  second, independent statement, so a later rewrite of the composite cannot silently reopen it).
  Two further rules from the same incident: the migration's COMMENT asserted the invariant held, and
  four review rounds believed it — **verify a database-level guarantee by ATTEMPTING the write you
  claim is impossible**, against the real database, before writing the comment. And check the UPDATE
  path, not just the INSERT: nothing else prevents flipping a discriminator column.
  *(2026-07-26, pod-report S3.)*
- **An audit label that can be chosen by picking an endpoint is worse than no audit log.** A
  share-link revoke action called the generic `revokeApiKey`, so a request carrying an INGEST key's id
  revoked that key while the trail recorded `report_share_revoked`. The privilege boundary held — an
  owner may revoke their own keys — but an incident responder searching `api_key_revoked` for "why did
  ingest stop?" would find nothing. **When two operations share a table, the mutation needs the
  discriminator in its WHERE clause, or the endpoint decides what the record says.**
  *(2026-07-26, pod-report S3.)*
- **`DROP FUNCTION` + `CREATE` silently restores Postgres' PUBLIC EXECUTE default.** Changing a
  function's return type forces a drop, which discards the earlier migration's REVOKEs — so a
  service-role-only function quietly became anon-callable. Any migration that re-creates a function
  must re-REVOKE from `PUBLIC, anon, authenticated` and re-GRANT `service_role`. Pin it with a spec
  that asserts a **function-level** denial (42501 mentioning "function", or PostgREST's PGRST202) and
  explicitly NOT an RLS error — an RLS failure would mean EXECUTE leaked and the body actually ran.
- **A comment cannot amend an architecture rule.** When a reviewer flags a documented invariant
  (AGENTS' "no read path can cross projects") and the honest answer is "this scheduler genuinely
  needs to be cross-tenant", the move is NOT to write a persuasive in-code rationale and proceed. It
  is to bound the exposure (return only opaque ids, service-role only, single-tenant downstream) and
  put the rule change in front of the human as an explicit either/or decision. Cross-review rejected
  the self-exemption twice, correctly.
- **A manual smoke test (or a spec) written by the same session that built the feature can share the
  implementation's own narrow, unstated assumption — and miss the exact bug a differently-shaped
  check would catch.** growth-engine-v1 S4's A/B comparison query originally required the *metric/
  conversion* event to also carry `featureId` set to the experiment key, mirroring how the
  *exposure* event is scoped. Every spec written during the build, and the builder's own manual
  `curl` smoke, happened to tag the conversion event with `featureId` too — so both looked green. A
  real conversion event (`checkout_completed`, `signup`, ...) fired through the normal track() path
  has no reason to carry an unrelated experiment's key; the bug would have silently reported 0
  conversions for every real caller. Only a **fresh reviewer with no context on how the feature was
  built** — reviewing the diff and its acceptance criteria cold — thought to ask "what does a
  *realistic*, untagged input actually look like?" When writing the acceptance check for a new
  feature, deliberately try the least-convenient/most-realistic input shape, not just the one that
  happens to match how you already wired the implementation — and don't skip the fresh-reviewer pass
  even when your own gate is green and your own manual smoke looked fine. *(2026-07-16,
  growth-engine-v1 S4.)*
  **This bug class has now recurred THREE times in this repo, and the third instance was already
  LIVE IN PRODUCTION, undetected.** `lib/tars-query.ts` filters events by `feature_id`, so an event
  written without a `featureId` tag belongs to no funnel and is invisible forever. `trackSelfEvent`
  never set one — meaning the landing dogfood funnel `commercial-shell` S3 shipped had been reading
  **zero since launch** while ingesting events perfectly (confirmed against prod: all four
  `landing_visited` rows had `feature_id = NULL`). Nothing errored, nothing alerted. **The
  generalizable rule: a query that silently REQUIRES a tag the realistic caller has no reason to set
  fails as an honest-looking zero, and a zero pages nobody.** When you add a read path that filters
  on an optional column, the very next thing to check is whether the WRITE path actually sets it —
  and any dashboard whose "correct" empty state is indistinguishable from its broken state needs one
  end-to-end check that produces a NON-zero number. *(2026-07-21, multi-tenant-activation S2/S3.)*
  **FOURTH instance — and the first one the SYSTEM caught instead of a human.** The
  experiment-governance-v2 Miyagi dogfood registered a plan whose `eligibility.tags` declared
  `{campaign: "vende_fundadoras"}`; `tagsMatch` requires every declared eligibility tag to be present
  on the exposure, and the emitter had no reason to send a `campaign` tag. All 24 production exposures
  were rejected. The difference from the previous three: the governed report did **not** show a
  plausible zero — it returned `decisionReady: false`, `blockers: ["srm_not_evaluable",
  "eligibility_mismatch"]` and `integrity: [{code: "eligibility_mismatch", count: 24, severity:
  "blocker"}]`, naming the cause and the count. **A declared predicate is a JOIN CONDITION, not
  documentation** — anything you assert in a plan (eligibility tags, a metric name, an entity type)
  must be something the real emitter actually sends, and the cheapest way to find out is one live
  event read back through the real analysis path before you trust the plan. *(2026-07-28,
  experiment-governance-v2 S3.3.)*

  **FIFTH and SIXTH instances — same class, found in the SAME pull request, by review rather than by
  the gate.** app-shell-and-agent-rail's `StatCard` exists *specifically* to make an unreadable
  figure unrepresentable, and its docblock said the caveat was "REQUIRED alongside a null value at
  the type level." **`ReactNode` includes `undefined`**, so `caveat: ReactNode` accepted
  `caveat={undefined}` and rendered an empty `<span>` — a number-shaped nothing, in the component
  whose entire subject is that distinction. `NonNullable<ReactNode>` fixed it and failed the build
  immediately at the one call site that could reach the hole. Separately, the agent rail's summary
  chip was `pending?.length ?? 0` rendered only when `> 0`, so a FAILED read produced the same
  silent chip as an empty one.

  **Two rules generalise, and the second is new:** (1) a type that *reads* as if it forbids a state
  may not actually forbid it — `ReactNode`, `unknown`, and any union that quietly admits `undefined`
  are where "make it unrepresentable" becomes "make it look unrepresentable"; verify by attempting
  the construction you claim is impossible, the same way CODE-QUALITY rule 3 asks you to attempt the
  write. (2) **An honest empty state that is not visible in the COLLAPSED view is not an honest empty
  state.** The rail's panel is server-rendered closed and only opens on a wide viewport, so on a
  phone the chip was the only thing a reader saw — the honest sentence was there, behind a disclosure
  nobody has a reason to open. Ask where the message renders when the component is in its smallest
  state. *(2026-08-07, app-shell-and-agent-rail S2/S3.)*
- **A corrected experiment version must fix the WINDOW as well as the predicate, or the old version's
  exposures block the new one.** The first correction (v2) removed the bad eligibility predicate but
  kept v1's planned window, which still contained the 24 exposures v1 had already emitted — and
  `version_mismatch` is a **blocker** (only `duplicate_exposure` and `out_of_window_exposure` are
  warnings), so v2 would have started blocked by its own predecessor's data. v3 moved
  `plannedWindow.startAt` past the last v1 exposure, which drops those rows from the SQL fact
  selection entirely instead of counting them as mismatches. **When you supersede an immutable
  definition, ask what the PREVIOUS version already wrote into the new one's window.**
  *(2026-07-28, experiment-governance-v2 S3.3.)*
- **Two different non-Claude model families, single-pass each, can replace a same-family fresh-
  reviewer subagent for ordinary PRs — not just supplement it as advisory noise.** commercial-shell
  Sprint 3 ran Codex + Agy (Antigravity) as the judgment-layer review instead of also spawning a
  same-family Claude reviewer, and they caught three real bugs a same-family read might well have
  missed anyway: a seed script silently rotating a production API key hash on a bare re-run, two
  routes inline-`await`ing a real network call (blocking the response, and in one case delaying a
  Set-Cookie behind it), and a public write route with no rate limit its siblings all had. Findings
  from this pass should be treated as real review feedback (Blocking → fix before merge), not
  background-only noise — see the updated `WAYS-OF-WORKING.md` "Review & merge" section. Still
  reserve an ADDITIONAL same-family read for HIGH-risk PRs (money/auth/DB/shared infra) — cross-
  family review is a floor for ordinary PRs, not a ceiling for the stakes that warrant more.
  **Corollary — fixing one round's findings can introduce a NEW bug a second review round then
  catches, and actually EXECUTING the fix can catch a THIRD class of bug neither review round
  found.** The same PR's round-1 fix (moving a blocking `await` to `next/server`'s `after()`)
  introduced a subtler identity race that round-2 review caught; then the actual CI run caught a
  totally different bug — a GitHub Actions workflow exporting an env var one step too late for an
  already-running background process to see it (see below) — that no amount of reading the diff,
  by any model, would have found. Static review and real execution are complementary, not
  redundant; budget for both, especially right after a "fix" to something already reviewed.
  *(2026-07-20, commercial-shell Sprint 3.)*
  **Two rounds is a FLOOR, not a ritual — on auth/DB/shared-ingest work the curve may still not be
  flat at round three.** multi-tenant-activation S2/S3 ran three: round 1 found 4 Blocking, round 2
  found 5 more (one of them a bug round 1's own fix introduced), round 3 found 3 more — including a
  quota-accounting bug that made the feature's ONLY documented remedy silently fail. Stop when a
  round comes back clean, not when you hit a round count. *(2026-07-21, multi-tenant-activation.)*
- **Cross-FAMILY review is a floor on high-risk work, and a same-family "clean" round is not a
  finish line.** pod-report S3 ran FOUR agy rounds on a new credential surface — seven Should-fix,
  zero Blocking, and round 4, aimed deliberately at the auth/tenancy surface, came back **clean**.
  Codex then opened with a **Blocking** finding on that same surface (a share route re-resolving its
  tenant from a MUTABLE `slug` instead of carrying the `project_id` its credential had already
  resolved), plus two Should-fix the other family had read past four times. Neither family is better;
  they are blind in different directions, which is the entire reason to run both. **Stop when a round
  from the OTHER family comes back clean, not when your usual reviewer does.** *(2026-07-26.)*
- **Report a finding's severity from what you can reproduce, not from what the reviewer labelled it.**
  The Blocking finding above was real and worth fixing — and it was NOT reachable the way it read.
  A spec was written to pin it (mint a token for tenant A, rename A, give A's old slug to B, assert
  the token still renders A) and it **passed against a deliberately re-broken build**: the resolving
  view re-reads the slug through a live JOIN every request, so a rename resolves correctly. The real
  exposure is a TOCTOU window inside one request, milliseconds wide, not HTTP-testable. Fix it (the
  fix was free — the caller already held the id), and then say plainly that the argument is
  construction rather than coverage. **A spec that LOOKS like a teeth test is worse than an absent
  one, because the next reader stops there** — mutation-check the ones you are proudest of.
  *(2026-07-26, pod-report S3.)*
- **Route external review by risk and demonstrated strength; two full reads are not a tax on every
  diff.** The 2026-07-23 Entity/Experiment trial established the current rail: Agy is the fast
  baseline architectural/security read; Devin's default router earns the second seat for high-risk
  migrations, tenancy and concurrency; Cursor Auto is slower/quota-limited but caught two real S1
  boundary defects (audit-cascade SQL and Unicode whitespace), so it remains a specialist/tie-breaker
  when quota permits. OpenAI/Codex stays in the builder/architect role, not review. The efficient
  high-risk sequence is Agy early → fix/rerun to clean → Devin once on the stabilized exact head;
  rerun the finder after a substantive fix, and rerun the other tool only if the fix crosses the
  boundary it reviewed. Do targeted validation rather than two fresh full reads for wording/
  presentation-only deltas. Different tools are coverage, not a ceremonial pass count.
- **A model catalog is not an entitlement list, and free-tier Devin needs strict triage.**
  `devin models list` advertised named Claude tiers that returned `/upgrade` when invoked; the free
  default router did run headlessly, but on Experiment Governance S2 it ignored an explicit
  `origin/main...HEAD` boundary and promoted seven already-shipped or intentional facts as findings.
  Keep its read-only prompt explicit, verify every cited line against the actual diff, and record false
  positives rather than converting them into churn. This still earns a high-risk second seat because it
  is a cheap independent repository scout; it does not replace Agy's cleaner diff discipline.
- **A fire-and-forget notifier that never fails the build also never tells you it is broken — and a
  green workflow is NOT evidence a message arrived.** `notify-telegram.yml` shipped with
  `curl … || true` (correct: a Telegram outage must not fail a deploy) and every single ping it ever
  sent was REJECTED by Telegram with `400 can't parse entities`. The workflow reported success for
  its entire life, and the agent that built it reported it "verified live in production" — having
  checked that the job ran and exited 0, which is not the same question as whether the message was
  delivered. Discovered only because Daniel noticed he had stopped receiving notifications.
  **Two rules. (1) For any fire-and-forget side effect, INSPECT THE RESPONSE and surface a failure
  as a warning annotation — keep `|| true` so the build never breaks, but never let "the job
  succeeded" and "the thing happened" be the same signal. (2) Verify a notification by looking in
  the CHANNEL, not at the exit code; if you cannot see the channel, say that the delivery is
  unverified rather than calling it verified.**
  The payload bug itself is worth knowing too: `jq -n '…'` emits JSON, so a *quoted* string with
  `\"` escapes. Building `TEXT` in one `jq` and passing it to a second as `--arg text "$TEXT"`
  double-encodes it, and the recipient sees literal `<a href=\"…\">`. Build the whole payload in a
  SINGLE jq pass so the double-encoding is unrepresentable rather than merely fixed.
  **Sharpened 2026-07-26 — the right fix is an EXIT CODE, not an annotation, and it depends on where
  the notifier lives.** The `|| true` + `::warning` arrangement was inherited from a design where the
  ping was a step inside a deploy job, where failing it would fail a deploy. In a repo where the
  notifier is its OWN workflow triggered by `push`/`deployment_status`, it is an observer: it cannot
  fail a deploy and cannot block a PR (neither trigger is a `pull_request` event), so a rejected
  message SHOULD turn the run red. A green check plus an annotation nobody reads is not monitoring.
  Also: two implementations of the same escaping/length rule is one too many — a jq copy of an
  already-tested `escapeToFit` was written and its FIRST test proved it wrong in exactly the way the
  original's comment predicted (it capped the RAW subject; 3,500 `>` characters escape to 14,129).
  Share the tested function instead of porting it. And measure the real payloads before believing a
  length theory: the live pings are 232 and 261 characters against a 4,096 limit.
  *(2026-07-26, pod-report/quality-rails.)*
- **A multi-channel observer needs independent delivery steps and one upstream resolution step.**
  Exporting deploy metadata to `$GITHUB_ENV` at the *end* of the first channel’s send step looks
  shared, but Actions stops that shell as soon as the notifier exits non-zero—so the export never
  happens and every later channel is skipped. Resolve the commit header/status/url first, export
  once, then let each channel send in its own step; later channels use `if: always()` so one outage
  cannot suppress the other while the observer job still finishes red. For local prose, persist the
  exact reviewed text and a per-destination success checkpoint before the first POST; otherwise a
  partial retry either duplicates the successful channel or asks the writer for different prose.
  Slack’s Incoming Webhook response is plain text (`ok` or an error token), not Telegram JSON—read
  it as text and pin both branches in tests. *(2026-07-28, notification-rails.)*
- **A scripted `str.replace()` that finds nothing SUCCEEDS SILENTLY — and the test you write alongside
  it can pass while the change never landed.** pod-report S2 added `checkSucceeded()` (accepting both
  GitHub check-run `conclusion` and classic commit-status `state`), unit-tested it, and shipped —
  except the edit wiring it into the caller silently no-op'd, because a formatter had reflowed the
  target text between writing the patch and running it. The helper existed, its tests passed, and
  the caller kept its old conclusion-only comparison for **three review rounds**. What let it hide
  was the test's shape: it exercised the helper DIRECTLY, and the one adapter case it did check
  (`state: 'FAILURE'`) returns false under both the fixed and the broken code. The distinguishing
  input — a *succeeding* classic status — was never tried. **Two rules: (1) assert that a scripted
  edit matched (`assert old in s`) — an unasserted replace is a no-op waiting to happen, and it is
  invisible in a green test run; (2) when you extract a helper, test it THROUGH its caller with an
  input whose result DIFFERS between the old and new implementations, or you have tested the helper
  and not the integration.** *(2026-07-25, pod-report S2.)*
- **A spec that watches a mechanism RUNNING will not notice it never puts anything back.** The
  `ConfirmDialog` focus-trap spec asserted the tab cycle never escaped the dialog, ran green, and
  passed a component that stranded keyboard users on `<body>` the moment it closed — it unmounted
  itself instead of calling native `close()`, so the browser never performed focus restoration.
  Cross-review found it; CI could not, and neither could the spec, because it only ever examined
  focus **while the dialog was open**. Whenever you spec a thing that opens/acquires/locks, spec the
  close/release/unlock as a separate assertion — coverage of the happy path is not coverage of the
  exit. *(2026-08-09, app-component-kit-adoption S1.)*
- **A cross-family finding is a SAMPLE, not the population — grep for the class before calling it
  fixed.** Agy reported a missing `try/catch` on two managers; the same shape was in a third from an
  earlier sprint, and searching for the *class* turned up a fourth variant no reviewer flagged — one
  that had already been fixed once, two PRs earlier, and reintroduced one file over. Both times this
  epic, the reported file was one instance of a pattern. Fix the pattern, then say in the reply how
  much wider you applied it. *(2026-08-09, app-component-kit-adoption S3.)*
- **A spec can be unreachable-by-construction and still pass — the mutation check is what proves a
  spec has teeth, and it must mutate the EXACT line the spec claims to defend.** multi-tenant-activation
  S1 fixed a real open redirect in an auth callback (cross-review caught `/\evil.example`: it defeats a
  `startsWith('/') && !startsWith('//')` check because `new URL()` normalizes the backslash into `//`)
  and added four HTTP-level specs asserting the callback never redirects off-origin. All four passed —
  **and passed identically against a deliberately re-broken build.** The route only consults `next`
  *after* a successful auth-code exchange, so an unauthenticated request never reached the branch at
  all; the specs were asserting the fallback path in both directions. Neither review round would ever
  have caught this: the specs *look* correct, and CI was green. **The generalizable rules:** (1) run
  the mutation check on every security-critical spec, not just when a test was written after the code —
  "the spec passes" and "the spec can fail" are different facts; (2) when a guard sits behind an
  auth/state precondition your test harness can't satisfy, an HTTP-level spec is structurally incapable
  of reaching it — extract the guard into a **pure, zero-import module** and assert it directly (the
  `lib/flags.ts` precedent already in this repo), rather than assuming end-to-end coverage implies
  branch coverage. *(2026-07-20, multi-tenant-activation S1.)*

  **A spec can also defend exactly HALF of the rule it is named after, and look complete.**
  app-shell-and-agent-rail's `e2e/agent-activity.spec.ts` claimed to cover the decision "the
  allow-list is applied in the QUERY, never `select *`". Deleting `.in('action', …)` from the query
  left every test green — because the module also re-applies the allow-list in JS, so the returned
  ROWS stayed correct and only the `limit` was wrong. The hidden failure is concrete: a destination
  outage writes one excluded row per undelivered event, a page of those consumes the limit, and the
  rail renders "nothing recorded recently" while real activity sits one row below the cut. **When a
  rule is enforced in two places for two different reasons — correctness AND efficiency — a spec that
  only observes the output tests the second-to-last layer. Ask which mutation would go undetected,
  not whether the assertions pass.** That question came from a fresh reviewer, not from the gate.
  *(2026-08-07, app-shell-and-agent-rail S1.)*
- **When a migration changes what the CODE READS, the rollout has a mandatory order: env vars →
  migration → merge/deploy. Getting it backwards is an outage, not a hiccup.** multi-tenant-activation
  S1 switched `lib/auth.ts` from `projects.api_key_hash` to a new `api_keys` table; deploying that code
  before the migration would have 500'd *every* ingest call for *every* tenant. Two ordering rules,
  both easy to get wrong: (1) **`NEXT_PUBLIC_*` vars are build-time inlined**, so they must exist
  *before* the merge triggers the build — setting them after means a deployed bundle with `undefined`
  baked in, and no redeploy is triggered by an env change alone; (2) **the expand migration must land
  before the code that reads it** (expand/contract exists precisely so both orders of *rollback* are
  safe, but rollout is still strictly ordered). Verify afterward with a check that distinguishes the
  two failure modes: an invalid credential returning **401 rather than 500** proves the new table
  exists and resolves, and driving one real end-to-end call with a *pre-existing* credential proves the
  backfill preserved live access.
  **Re-run successfully at the multi-tenant-activation launch (2026-07-21), with one addition worth
  copying: drive that "real credential" check through a route the APP already authenticates for**
  (here `/api/v1/public/self-visit`, which uses the production key server-side) — you get the same
  proof without a production secret ever entering a shell, which also sidesteps the auto-mode
  classifier entirely. Same trick applies to admin seeding: registering a feature row via
  `supabase db query --linked` beat re-running a seed script that would have needed the tenant's
  plaintext key. Also: `supabase db push` does **not** apply `seed.sql` unless you
  pass `--include-seed` — worth confirming, since a test-fixture seed reaching prod would be its own
  incident. *(2026-07-21, multi-tenant-activation S1.)*
- **A role column in the schema is not an access rule — grep for who actually reads it.**
  multi-tenant-activation S1 shipped `project_members.role` with an `owner`/`member` CHECK constraint
  and a membership gate that only ever asked "is this user a member?" — so any member could mint a
  full ingest credential or revoke the key production runs on. Every test was green (they asserted
  member-vs-non-member, the boundary that *was* implemented), and round-1 review missed it too; only a
  second review round asked "what is `role` for?" **When a table carries a privilege column, one gate
  per privilege LEVEL is the minimum — and the least-privilege split (read vs. credential-admin) is
  worth designing at the same time as the column, not after.** *(2026-07-20, multi-tenant-activation S1.)*
- **When you harden one instance of a class of bug, immediately grep for its siblings — a fix applied
  in only one of two places is a *latent inconsistency* a later reviewer will find.** Round 1 hardened
  both seed scripts against a cross-project credential bind; the identical `ON CONFLICT DO NOTHING` in
  the *migration* that does the same backfill was left untouched, and round 2 flagged it as Blocking.
  The fix is cheap at the time you're already in the mental model; it's a whole extra review cycle
  later. *(2026-07-20, multi-tenant-activation S1.)*
- **`onConflict` + `ignoreDuplicates` on a GLOBALLY-unique credential column is a silent cross-tenant
  bind, not idempotency.** Two seed scripts upserted an `api_keys` row with `{ onConflict: 'key_hash',
  ignoreDuplicates: true }` to be "safely re-runnable." Because `key_hash` is unique *across all
  projects*, a hash already owned by a DIFFERENT project makes the upsert report success while writing
  nothing — and the script then hands back the plaintext key as if it provisioned it, so that key
  authenticates as the OTHER tenant. Caught by cross-review, invisible to every green test. **When a
  unique column is a credential, "insert or ignore" must become "look first, then verify the existing
  row belongs to the intended owner and is still active, else fail loud"** — silence on conflict is
  only safe when the conflicting row can't belong to someone else. *(2026-07-20, multi-tenant-activation S1.)*

- **A comment asserting a check the code does not actually perform is worse than no comment, and it
  survives review rounds.** A round-1 fix claimed in prose to distinguish two unique constraints by
  name; the code just re-read a membership table that is empty during precisely the window the race
  opens, so the "fix" could strand a user harder than the bug had. Round 2 caught it by reading the
  code against its own comment. **Prose in a diff reads as evidence** — a reviewer who sees a stated
  rationale spends their scrutiny elsewhere. When you write "we check X here", re-read the lines
  underneath and confirm they check X. *(2026-07-21, multi-tenant-activation S2.)*
- **A narrower `GRANT` revokes nothing — on Supabase, new public-schema tables arrive with
  `service_role` already granted ALL.** A migration granted `SELECT, INSERT` and a comment claimed
  the table was therefore append-only; it was purely additive and the claim was false. Only an
  explicit `REVOKE UPDATE, DELETE` made it true. **Caught because a spec ATTEMPTED the mutation with
  the app's own client** rather than trusting the grant statement to mean what it looks like — the
  same "assert the property, don't assert the code that's supposed to produce it" discipline as the
  mutation check. *(2026-07-21, multi-tenant-activation S2.)*
- **A "just raise the limit" remedy must be tested after SUSTAINED abuse, not one rejection.** A
  monthly quota counter incremented BEFORE comparing against the ceiling (necessary — that's what
  makes it atomic), but rejected calls were never refunded, so a retrying client drove the count
  arbitrarily far past the ceiling and raising it then failed to restore service. The existing spec
  raised the ceiling after exactly ONE rejection, which the bug survived. **Whenever the documented
  recovery procedure for a limit is "change the limit", write the spec that abuses it first.**
  *(2026-07-21, multi-tenant-activation S2.)*
- **A write-side resource cap only guarantees readability if it measures the SAME bytes the read-side
  bound sums — aligning the number is not aligning the measurement.** experiment-governance-v2 S3's
  append-only decision ledger capped cumulative writes on `analysis_snapshot` bytes only, while the
  read resolver's bound summed `rationale + analysis + integrity` per row. Because the read total is
  always strictly greater, a history of long/multi-byte rationales (well within the supported 100
  records) could be *accepted on write yet permanently unreadable* on read (`resource_limit`) — and an
  append-only immutable ledger can never be shrunk, so it bricks the whole governed view (UI/API/MCP)
  forever. An earlier fix that only lowered the write number (8→4 MiB) looked right and was still
  wrong; the real fix makes the write path count the exact same fields (`jsonb_build_object` of all
  three) so write-accept ⟹ read-accept by construction. **When two layers both bound the same data,
  make them measure the same thing, and prove it with a teeth test that fills to the write cap then
  round-trips the max-accepted payload through the real read path** — mutation-verify it fails against
  the single-field cap. Green tests with small payloads never exercise this; a fresh cold reviewer
  found it after typecheck+build+307-passing-api+dark all passed. *(2026-07-23, experiment-governance-v2 S3.)*
- **Fixing a review finding by adding a MODE is a smell; fixing it by MOVING the code is usually
  right.** A retry path placed in a Server Component couldn't set cookies, which forced a
  "provision without handing over a key" mode, which then silently skipped a starter-feature
  registration too — one constraint metastasising into three defects across two review rounds.
  Moving the retry into a Route Handler (which can set cookies) deleted the mode and all of its
  consequences at once. When a fix needs a flag/mode to accommodate where it lives, question the
  location before adding the flag. *(2026-07-21, multi-tenant-activation S2.)*

- **An enablement flag flipped at launch is only half a launch — verify by exercising the surface,
  and expect to need a deploy.** The multi-tenant-activation flip looked done (`vercel env add`
  reported success, `vercel env ls` showed the var) and was not: `/signup` kept 404ing for 7+
  minutes. Vercel snapshots env vars into a deployment at BUILD time, so already-running functions
  serve what they captured. A commit to `main` is what makes it live. Budget a deploy into any
  "just flip the flag" step, and never treat a CLI listing as evidence the flag is in effect.
  *(2026-07-21, multi-tenant-activation Story 3.3.)*

## Delegating prose to a cheap model
- **A cheap model summarising a dense engineering commit will fabricate, and its two failure modes are
  predictable enough to write into the prompt.** Measured over three live runs of
  `scripts/commit-report.mjs` (2026-07-25): (1) it **invents a beneficiary** — "Tenants now benefit
  from a faster test suite", for work no tenant can observe; (2) far worse, it **reports a fix that
  did not happen**, because commit messages here routinely cite a past incident to explain why present
  work matters. Given a commit that only ADDED TESTS for an open-redirect bug fixed weeks earlier, it
  wrote "the previous backslash bypass is blocked, eliminating a potential open-redirect attack."
  Confident, plausible, false, and landing in the channel the product owner reads as status. **Both are
  fixable by naming the exact failure in the prompt with the false sentence quoted** (run 3 came back
  accurate on every count), and neither is eliminated — so keep these tools **advisory**: print by
  default, post opt-in, and label the message so an unreviewed machine claim is self-identifying.
- **A model constant is a silent-rot surface: an unrecognized `--model` does not fail, it substitutes.**
  `prose-draft.mjs` held agy's pre-1.1.5 display names for a whole release cycle after the slug rename,
  so every draft ran on agy's default model — exit 0, no warning, plausible output. The rail's own
  comment had *predicted* exactly this ("a future typo would silently review with the WRONG model
  instead of failing loud") and it shipped anyway, because the prediction guarded the two constants the
  doctor checked and these lived somewhere it never looked. **The fix for a predicted-but-unguarded
  failure is structural, not a re-typing: put every instance in ONE registry the checker walks
  (`AGY_MODELS_IN_USE`), so a new consumer inherits the check instead of needing to remember it.**
  *(2026-07-25.)*
- **Wire the fallback to the CONDITION, not to one of its signatures.** `runAntigravity` fell back to
  the second model only on EMPTY output, so when `gpt-oss-120b` answered "Our servers are experiencing
  high traffic right now" with a **non-zero exit**, it aborted instead of trying the separate capacity
  pool sitting right there. Same transient condition, different exit code, no fallback. Classify
  transient failures explicitly (`isTransientAgyError`) and keep the pattern **tight** — a loose match
  on "error"/"failed" would convert a real contract break into a silent retry, which is precisely the
  1.0.10 incident this repo already paid for. *(2026-07-25.)*

## Working efficiently
- **A new npm scope is an owned namespace, not a label the first publish creates.** A scoped publish
  can authenticate successfully and still fail `Scope not found` until the organization exists;
  creating that organization is its own outward decision about owner and package plan. On the first
  package, a registry PUT 200, public access, a dist-tag and even a rendered package page can precede
  the metadata document used by `npm install`. The release proof is a clean install and import from a
  new directory; only then deprecate the old package. *(2026-08-13, frijoles-rebrand-closeout.)*
- **An authenticated page sweep must assert it reached authenticated content before measuring it.**
  The anonymous browser project followed signed-in routes to `/login`, so the mobile rail measured a
  clean redirect and looked complete while covering none of the product. Reuse the real auth rail,
  assert status/session/no-login first, then apply the shared geometry helper. The first honest run
  found undersized sortable headers and two overflowing table surfaces. *(2026-08-13,
  frijoles-rebrand-closeout.)*
- **`SUPABASE_DB_URL` must be exported for the local `api` gate, or ~30 specs fail on a
  precondition that has nothing to do with your diff.** `npm run test:e2e` locally without it fails
  with `SUPABASE_DB_URL must target local Supabase on loopback port 54322` from
  `e2e/helpers/test-db-cleanup.ts`, in specs spread across every subsystem — which reads exactly
  like a broad regression. Export
  `SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"` alongside
  `supabase start` and the freshly-built server. **And when a suite fails in areas your change never
  touched, get a baseline before explaining it away**: checking out `main`, rebuilding and running
  the same specs took five minutes and turned "13 unrelated failures, probably environmental" into a
  fact (identical 13 on `main`, all green in CI). *(2026-08-12, landing-redesign-v2.)*
- **Verify against a freshly built artifact, or you will diagnose the wrong cause — confidently.**
  A CSS rule appeared absent from the running page, and the plausible explanation (the minifier
  mangles `:where(:has())`) went into a code comment as fact. It was false twice over: the grep that
  "proved" it was matching inside the `:where(`, and the page was being served by a **stale build**.
  The rule compiles fine. What almost shipped was not a broken selector but a confident, wrong
  explanation in a comment, which the next reader would have trusted (CODE-QUALITY #3). Two rules
  fall out: kill the server and rebuild before concluding anything about compiled output, and
  **never write the verification and the conclusion in one step** — establish the fact on a clean
  environment first, then write the sentence. *(2026-08-12, landing-redesign-v2.)*
- **A descendant "default" at (0,1,1) silently outranks every single-class rule it should defer to.**
  `.panel p { color: var(--dim) }` beat `.takeaway`, `.micro--gold` and `.tier__price` on elements
  inside a panel: text rendered dim, a headline price rendered at body size, and every call site
  looked correct. Nothing errors, and the fix at the call site (raise specificity there too) makes it
  worse. Descendant rules that exist as **defaults for unclassed elements** belong in `:where()`, so
  they are a floor any class can step over rather than a ceiling every class must fight. Same
  reasoning as the mobile rails in the same epic. *(2026-08-12, landing-redesign-v2.)*
- **Fix the CLASS with a spec, not the instance the reviewer named.** Review found one unlabelled
  illustration on the landing page. Editing that one label would have closed the finding; writing a
  spec that asserts *every* framed surface declares itself real-or-illustrated found **two more** the
  reviewer never reached. When a finding is an instance of a property the surface should have, the
  cheapest correct response is usually the assertion, not the edit. *(2026-08-12, landing-redesign-v2.)*
- **Before believing a local test failure is your diff, run the identical command on clean `main`.**
  Two "regressions" in one epic were the environment: `npm run test:e2e:local` BUILDS into
  `apps/web/.next`, so a `next dev` server left running in the same worktree corrupts it and every
  page route 404s with *"Cannot append headers after they are sent to the client"* — twelve failures
  that look exactly like a real break, including `/app` → `/login`. The other was a spec failing on
  accumulated local fixture data while green on CI's fresh DB. A checkout of the merge base and one
  re-run settles it in minutes and is far cheaper than reasoning about the diff. Kill the dev server
  before the local gate; `rm -rf apps/web/.next` if you already crossed them.
  *(2026-08-09, app-component-kit-adoption.)*
- **Amending a locked acceptance criterion is a product-owner decision, not a documentation task.**
  Writing the reasoning down is necessary and not sufficient — cross-review correctly flagged an
  amendment as Blocking scope change even though it was recorded with measurements and a rationale.
  Put it as an explicit either/or **with a recommendation**, then record the answer as a dated
  amendment. Distinguish the two kinds: a *prediction falsified by measurement* ("less code") drops
  no work and only needs recording; *dropped scope* ("this route is included") needs the ask.
  *(2026-08-09, app-component-kit-adoption S2.)*
- **Cowork's folder mounts deny `unlink` by default, so ANY lock-taking git command can strand a
  `.git/*.lock` — the command does not have to fail.** The mount permits create and write but not
  delete, anywhere in the tree (not just under `.git`), so git's normal lock cleanup is what breaks.
  A plain `git status` that needed to refresh the index stranded an `index.lock` during the
  post-mortem itself. **The remedy is `allow_cowork_file_delete`** — a Cowork tool whose own
  description says to call it whenever a delete fails with "Operation not permitted" *rather than
  telling the user it is impossible*. One call per folder, the owner approves, and `rm` works
  normally for the rest of the session. `GIT_INDEX_FILE=/tmp/i` is a **partial** mitigation only: it
  relocates the *index* lock and does nothing for a **ref** lock
  (`.git/refs/heads/<branch>.lock`), which is the kind that actually blocked the owner here and that
  no amount of precondition-checking prevents. Also set `user.name` AND `user.email` (a `-c` flag
  per commit is enough); the sandbox has no global identity, and a missing *name* fails with a
  message about the *email*. **Committing from Cowork is normal and expected — handing the product
  owner a shell script to do it is a REGRESSION, not a workaround.** Only `push` routinely needs
  them, and for a real reason: the sandbox has no `gh`, no git credentials, and `api.github.com` is
  proxy-blocked, while plain `git fetch`/`ls-remote` over HTTPS works. *(2026-08-06, corrected same
  day — the first version of this entry blamed a failing `git mv` and declared the lock
  undeletable; both were wrong.)*
- **Don't theorise a capability wall from a single failure — probe the boundary, then act, and
  check whether the host offers a tool for the wall before declaring it load-bearing.** Same
  session: one stranded lock was read as "the sandbox cannot commit", and a whole
  hand-the-owner-a-script workflow got built on that premise before anything was tested. The first
  correction probed harder and found `GIT_INDEX_FILE` and the missing `user.name` — but still
  stopped one step short, concluding the lock file itself was undeletable and handing over a
  cleanup command that named three paths, **none of which existed**. The actual affordance
  (`allow_cowork_file_delete`) was one tool-search away. Probing beats theorising, but *"I probed
  and found a workaround"* is not the same as *"I found the mechanism"* — a workaround that leaves
  the owner running commands is a signal you have not reached the mechanism yet. *(2026-08-06.)*
- **A plugin enabled in a project's `.claude/settings.json` reaches Claude Code and NOT Cowork.**
  `extraKnownMarketplaces` + `enabledPlugins` is Claude Code's mechanism; Cowork loads its own
  installed-skill set from the desktop app. So a skill can be enabled in a repo for months, work in
  every Claude Code session, and be silently absent in Cowork — which is what happened to `groom`,
  the one skill explicitly written *for* Cowork. Install it there separately: `node
  scripts/pack-skills.mjs --skill <name>` builds a `.skill` archive, presenting that file in chat
  renders a **Save/Update skill** button, and pressing it *is* the install — that button is the only
  thing that changes what Cowork loads. **Symptom to recognise: an agent says a skill "isn't loaded"
  while you can see it enabled in the repo — check WHICH host you are in before concluding the
  plugin is broken.** Two traps found the hard way: (1) `save_skill` carries **only** SKILL.md, so
  using it on a skill with bundled generators produces a silently crippled one-file install — use
  the `.skill` archive whenever the skill ships more than prose; (2) a skill that invokes its own
  bundled scripts must **resolve** their directory, since the plugin puts them at
  `skills/<name>/` and a Cowork install puts them at the skill's root — hardcoding either shape is
  correct on one host and silently wrong on the other. *(2026-08-06.)*
- **A sandboxed authentication check can be a false negative when the credential lives in an OS
  keyring.** `gh auth status` inside the filesystem sandbox reported an invalid default token while
  Git push through the macOS credential manager succeeded; the same `gh auth status` with keyring
  access correctly reported the logged-in `danybgoode` account and scopes. Treat contradictory
  evidence as a rail mismatch to investigate, not a reason to tell the owner to log in again. Verify
  on the credential-owning rail and test the intended operation. *(2026-08-01, flag-serving closeout.)*
- **A live-proof handoff is not proof that the live proof is still pending — read the scoped immutable
  ledger before repeating production work.** The activation doc ended at "gates ON," so re-entry
  initially concluded the two runs and breaker transitions were missing. Tenant-scoped scenario,
  impact and breaker snapshots showed they had already completed: terminal runs, expected security
  guard, non-zero canonical impact, two protective trips and a revoked target. The read prevented a
  duplicate production exercise. *(2026-08-01, flag-serving closeout.)*
- **A complete flag import is a snapshot, not an ongoing registration rail.** After Miyagi cut over
  with `*=golden`, a later `catalog.owned_shop_only_enabled` key had no Golden definition and resolved
  safely from its explicit local default with reason `DEFAULT`. The default-ON kill-switch contract
  was correct; treating permanent control-plane absence as an exception was not. A project declares
  the typed default once, then a generic project-scoped sync rail must register it without a Golden-side
  whitelist. Local defaults are resilience, not the operational writer. Never call the original
  inventory evergreen or infer the operational project from a similar slug or old proof note. Verify the
  current owner project and the actual runtime credential's snapshot separately. If the established
  credential serves a different live catalog, do not swap it wholesale: route only the new exact key to a
  scoped provider and keep that provider's project-relative snapshot out of the shared mirror. Finally,
  activation makes an immutable version authoritative; a no-rules version whose default is OFF remains
  OFF until a new default-ON version is activated. *(2026-08-01, corrected 2026-08-09 and 2026-08-10;
  flag-serving / owned-shop / Partners recruiting.)*
- **A Next App Router `loading.tsx` or parent layout can change the HTTP semantics of a guarded
  child page by starting the response stream first.** During the design-system lift, both a shared
  `/app` layout and then the root loader made `notFound()` content look correct in a browser while
  the dark-path API contract regressed from 404 to 200. Keep feature/auth guards above any shared
  shell that can stream; render the shell inside the page after the guard, and use client-side
  navigation/submission feedback when the status code itself is part of the contract. Pin it with
  request-level status tests, not screenshots alone. *(2026-07-28.)*
- **On a UI sprint, someone has to OPEN THE PAGE. A full green gate does not see layout.**
  app-shell-and-agent-rail S2 shipped two real defects past typecheck, lint, 883 unit tests, build,
  the drift guard, 435 api specs and 14 authed browser specs — both found by looking at a screenshot
  the browser smoke had already produced and nobody had read: (1) the fixed rail sat ON TOP of the
  page content from ~1080px, because the layout reserved the rail's WIDTH but not the GUTTER it was
  inset by — two numbers where there should have been one derived value; (2) `tokens.css`'
  `section { padding: 36px 0 }`, written for the landing's page bands, opened **72px of dead air per
  section** inside a 320px sidebar, which reads as a rendering failure rather than a quiet day.
  Neither is expressible as "the element exists" or "no horizontal overflow", which is what the
  specs asserted. **Assertions cover the properties you thought to name; a screenshot covers the ones
  you did not.** Take one per viewport on any sprint that moves pixels, look at it, and convert what
  you find into geometry assertions (`boundingBox()` comparisons) so the SPECIFIC regression cannot
  return — while accepting that the next unnamed one still needs an eye. *(2026-08-07,
  app-shell-and-agent-rail S2.)*
- **Deleting a stacked PR's base branch on merge CLOSES it, irreversibly.** Merging the bottom of a
  three-PR stack with `gh pr merge --delete-branch` auto-closed the PR above it, and GitHub will not
  reopen *or* retarget a PR closed that way — the review record (two cross-family rounds and the
  responses) was stranded on a closed thread and the work needed a fresh PR pointing back at it.
  **Merge a stack without `--delete-branch` until the last one, or retarget each PR to `main` before
  merging the one below it.** *(2026-08-07, app-shell-and-agent-rail.)*
- **A review CLI that cannot open a file will invent "this is missing" findings — check what your
  reviewer can actually READ before blaming the model.** Three confidently-wrong findings across one
  epic ("the helper is not defined in this test file" — defined eight lines above the hunk; "an audit
  action carries no project_id" — the source passes one explicitly; "imported from a file the diff
  never creates" — a lower PR in the stack creates it) all shared one cause: the reviewer was handed
  a DIFF and no repo access. For vibe specifically the cause was ours — `--trust` only skips the
  trust-the-FOLDER prompt and approves no tool calls, so every read was auto-denied AND each denial
  burned a turn against `--max-turns 4`, producing intermittent "Turn limit reached" failures that
  looked like a quota problem. The fix is `--auto-approve` **scoped by** `--enabled-tools` to
  `read_file` and `grep`, which in programmatic mode disables everything else — reads granted, writes
  still impossible, verified by attempting the write and getting `TOOL_UNAVAILABLE`. **The general
  rule: a truncation or an odd finding from a review CLI is a question about its INVOCATION before it
  is a question about its quota, and the diagnostic is one `--output json` run to see whether its
  tool calls are being approved or denied.** *(2026-08-07, PR #77.)*
- **Write down what is NOT covered, or nobody will schedule the fast-follow.** app-shell-and-agent-rail
  shipped two guarantees without tests and said so in the retro under "coverage stated rather than
  implied": a rail catch-to-null that needed a broken service-role client to exercise, and a CSS fix
  found by eye. Both were closed the next day precisely because they were named. **An unstated gap is
  indistinguishable from an oversight** — and the honest sentence costs one line, while the
  alternative is a reader who assumes the green gate covered it. *(2026-08-07, app-shell-and-agent-rail.)*
- **Running a whole multi-sprint epic in one session is the main context-cost driver.** The durable
  state (the plan file, sprint docs, team memory) makes re-entry cheap by design — compact at each
  sprint/PR boundary, and for big epics consider a fresh session per sprint.
- **A local gate that is a SUBSET of CI's gate is worse than no local gate, because it produces a
  green that does not mean what CI means by green.** pod-report S3 burned three push-and-wait round
  trips on static checks that run in seconds locally — lint, then prettier's changed-files check, then
  the TEST tsconfigs. The last one is the instructive one: `tsc --noEmit -p apps/web` passed while
  `npm run typecheck` failed, because the latter checks FOUR projects (app, app-tests, sdk,
  sdk-tests) and the error was in a test fixture whose object literal narrows more tightly than the
  runtime type. **Invoke CI's own npm scripts, never a hand-written approximation of them**, and run
  them in CI's order so the cheapest fails first. Especially where Actions minutes are the scarce
  account-wide resource they are in this repo.
- **Re-derive a handover's status from the artifact, never from the previous session's summary.**
  pod-report Sprint 2's close-out said all four stories were built. Two claims did not survive a check
  against `origin/main`, the production database and the live site: `--push` printed "not wired yet"
  and exited **0** (so production held zero artifacts while runs looked successful), and a module the
  doc said was "built against the real `miyagisanchez` tenant" had **zero callers**. Both were written
  in good faith by a session that had genuinely done the hard half. The cheap checks that found it:
  one `select kind, count(*) … group by kind` against prod, one `curl -o /dev/null -w '%{http_code}'`,
  and one grep for callers. *(2026-07-26.)*
- **Never infer which rail a credential serves from what the credential is NAMED.** golden-beans'
  `SELF_PROJECT_API_KEY` authenticates as the **demo** tenant, not the self tenant. A landing section
  was switched to read the self tenant on the strength of that name and shipped rendering its fallback
  teaser in production. Confirm by asking the data which tenant a write actually landed on. This is
  the same lesson as the earlier "don't infer a provider from a secret's name" entry, one level in.
  *(2026-07-26.)*
- **A GitHub Actions workflow env var exported via `$GITHUB_ENV` only reaches steps AFTER that
  point in the job — never an already-running background process from an earlier step.**
  commercial-shell Sprint 3's CI exported a freshly-minted `SELF_PROJECT_API_KEY` right before
  seeding a new tenant, but the `npm run start &` background server had already forked several
  steps earlier — so the running process never saw it, and every tracking call for the rest of the
  job silently no-op'd (0 events, no error, by design — that's what made it non-obvious). Fix:
  generate/export anything a long-running background process needs to read from its env BEFORE
  starting that process, not after — even if the value is only used by a LATER step logically.
- **GitHub Actions minutes are a shared, cyclical, account-wide constraint, not a one-time
  incident** — seen twice now (root `miyagi-product-management`'s `notion-sync` burning the
  account's quota 2026-07-16; a general account-wide exhaustion flagged mid-session 2026-07-20).
  When told minutes are tight, batch changes and verify locally (`tsc`, `build`, and the Playwright
  `api` project against a local Supabase) before pushing, rather than using CI as an iterative test
  runner — this repo's `.githooks/pre-push` already runs a local, best-effort version of the same
  gate for exactly this reason.
- **The auto-mode-classifier trap: in auto mode the classifier passes READS and blocks production
  WRITES + shell CREDENTIAL-handling — that is the whole rule. Don't build a security-philosophy
  theory on top of a few blocks; probe the read/write boundary empirically first.** (2026-07-20,
  commercial-shell Story 3.3 launch — the session's single biggest time-sink.) A run of "Blocked by
  the Claude Code auto mode classifier" denials got mis-diagnosed as an intent-proof `hard_deny`
  security boundary around "minting production credentials" (a spawned Opus planning agent
  confidently reinforced this). Wrong: a read-only `ls` and a `supabase db query --linked "select …"`
  passed, while an `insert`, a `node -e` generating a key, and `vercel env add <secret>` blocked —
  the real axis is **read vs. write / secret-handling**, and it's the *mode*, not a project
  misconfig or a hidden rule (the user had defined no `autoMode.*` rules at all). Two mundane
  unlocks, no settings edit and no weakening of the classifier: **(1) leave auto mode** (Shift+Tab)
  so prod writes surface as ordinary approve-prompts the owner clears live; **(2) do all prod DB
  work through the already-logged-in `supabase db query --linked`** (uses the CLI's own auth — no
  `service_role` key in the shell at all) **with any credentials generated *inside* the SQL query**
  (`encode(digest(x,'sha256'),'hex')` for an api-key hash, `gen_random_uuid()` for token/key
  material) so no secret ever touches a shell command. This also sidesteps the `sb_secret_…` vs
  `eyJ…` (JWT) service-role-key-format confusion that made a hand-run seed script fail with "Invalid
  API key." Do NOT try to edit `autoMode.hard_deny/soft_deny` to route around a block — hard_deny is
  designed to be unreachable by in-chat agency, so an agent editing it on chat instruction defeats
  the category by construction; hand the owner the mechanical step (or, as here, just leave auto
  mode). Corollary: don't spawn a planning agent to rationalize a wall before you've empirically
  mapped what actually passes vs. blocks — a confident wrong theory is worse than no theory.

- **A worktree with no `node_modules` silently resolves workspace packages to the ROOT checkout,
  so package edits look inert and unit tests assert against the wrong branch.**
  (2026-08-09, `flags-visual-rule-builder` S1.) `@golden-beans/sdk` resolved to the root checkout's
  `dist` — on `main`, without the branch's changes — so `npm run build --workspace=…` wrote to a
  `dist/` nothing imported, an SDK edit appeared to have no effect, and the SDK unit tests were
  quietly green against code the branch had already changed. **`npm install` inside the worktree
  first**, then confirm with `node -e "console.log(require.resolve('@golden-beans/sdk'))"` before
  trusting a single package-touching test result. (Related to the two worktree entries above, but a
  different failure: those are about tooling that cannot RUN; this one runs fine and lies.)
- **A positional locator over two identically-worded controls is a spec that will silently start
  testing something else.** (2026-08-10, `flags-visual-rule-builder` S2, amendment A9.) A rejection
  probe used `getByRole('button', { name: 'Create immutable version' }).first()`; a later sprint
  added a second form with the same verb, rendered FIRST, whose button is disabled while its form has
  problems — so the probe would have waited on an unclickable element instead of testing anything.
  A second locator, `.locator('pre').first()`, would have re-pointed the same way the moment a flag
  had two versions. **Scope by the control that distinguishes the two surfaces** (`.filter({ has:
  page.locator('#flag-definition') })`), never by position. It went unnoticed because the `authed`
  Playwright project does not run in CI — which is the second half of the lesson: **a spec no
  pipeline runs is a spec that decays silently.**
- **Stop cross-agent review at a CLEAN ROUND, not at a round count — and a clean round means every
  reviewer, including the context-independent one.** (2026-08-10, `flags-visual-rule-builder` S2:
  **seven rounds, sixteen real defects**.) Round 4 was clean from *both* external families and the
  fresh reviewer found a **regression that round 3's own fix had introduced**; rounds 5 and 6 each
  found one more path after the second family had gone clean three rounds running. Two corollaries
  worth as much as the rule: **(a) a fix deserves the same suspicion as the code it replaces** — one
  derivation here was corrected three times in three rounds, each time for a *different* wrong
  statement about the same data, and the third fix moved a guard behind a filter and broke a fourth
  thing; **(b) when several findings share one cause, the cause is the finding** — four separate
  "guard this shape" reports on a JSONB-backed seam were one sentence (*a TypeScript type over a
  JSONB column is a promise the database does not make*), and guarding each field by hand was
  building a second validator, always one review finding behind. Ask the existing authority once.
- **A comment that asserts a property is code, and goes stale like code — the dangerous kind reads
  as an unfinished task.** (2026-08-10, `flags-visual-rule-builder`.) Three separate review rounds
  found a comment claiming something the code did not do, including a `satisfies` said to enforce
  exhaustiveness that did not, and a CSS note instructing the next adoption pass to apply a class
  that the epic had just decided must NOT be applied (it would have broken a dark-launch guarantee).
  When a decision reverses, **retire the note in the same PR**; a leftover "do this next sprint" is a
  landmine with a friendly face.
- **Playwright's `toContainText` NORMALISES WHITESPACE, so a trailing-`\n` guard against a numeric
  prefix silently asserts nothing — and a negative one can be impossible to satisfy.** (2026-08-10,
  `flags-visual-rule-builder`, found the first time the `authed` project was ever run.) The epic's
  single most important check was `await expect(json).not.toContainText('"basisPoints": 10\n')`,
  written to catch a factor-of-100 error. Normalisation strips the newline, leaving
  `"basisPoints": 10` — a **prefix of the correct `"basisPoints": 1000`** — so the guard failed on a
  CORRECT build and could never have passed on any build. **Assert on parsed values, not on rendered
  substrings**: `JSON.parse(await locator.innerText()).rules[0].rollout.basisPoints === 1000` cannot
  be blurred by rendering, and a `toEqual` between the builder's preview and the stored version
  states the round-trip claim directly. Then mutation-check it — dropping the `× 100` must turn it
  red, and here it does.
