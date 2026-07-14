# Claude Routines — stand-up runbook (template)

**Claude Code Routines** (research preview) are saved cloud Claude Code configurations (prompt + repos
+ triggers) that run **autonomously on Anthropic-managed infra, as you** — so they keep running with the
laptop closed. Created/managed at `claude.ai/code/routines` (or `/schedule` in the CLI).

This directory commits the *prompts + this runbook*. **The account stand-up itself is operational** —
installing the GitHub App, creating the routines from these prompts, and setting any secrets/allow-list —
nothing here provisions infra or changes any account on its own.

<!-- TEMPLATE FILL-IN: replace `example-routine.prompt.md` below with your project's real routines
     (one prompt file + one README section per routine), following the pattern this file documents. -->

## The two rules that hold for every routine

1. **Advisory only — never a required check.** Every routine's output is a PR comment, a `claude/` PR
   for a human to review, or (for a report-delivery routine) a message to your team's notification
   channel. None gates a merge, deploy, or money path. A plain PR **comment carries no commit-status**,
   so it *structurally cannot* be added as a required check in branch protection — keep it that way. The
   deterministic layers (CI, deploy notifiers) remain the sole sources of truth.
2. **Leave push at the `claude/` default.** A routine may only push `claude/`-prefixed branches unless
   unrestricted push is explicitly enabled — don't enable it. If a routine needs to persist state across
   runs (a log, a window-tracking file), put it on a dedicated `claude/<name>-log` branch via git
   plumbing (`hash-object`/`mktree`/`commit-tree`/push — see `scripts/lib/log-branch.mjs` if your project
   carries it), which stays inside the default push scope. Don't reach for "Allow unrestricted branch
   pushes" to solve this — see the gotcha below.

## Example routine — `example-routine.prompt.md`
**Prompt:** [`example-routine.prompt.md`](example-routine.prompt.md) · **Repo:** wherever this template
was spawned.

1. **Install the Claude GitHub App** on the target repo(s).
2. **Create the routine** from `example-routine.prompt.md`.
3. **Trigger:** either a GitHub event (`pull_request.opened`, etc.) or a **Schedule** (cron-style,
   e.g. nightly/weekly UTC).
4. **Env/connectors:** GitHub App at minimum; add `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (or your
   team's own notification-channel credentials) only if the routine's output is a message, not just a
   PR/comment.
5. **Output:** one advisory PR comment / `claude/` docs PR / notification message per run. **Never**
   merges, deploys, or becomes a required check.

## Daily-cap budget (Pro)

The **daily routine-run cap (Pro = 5/day) bites the SCHEDULED runs** — GitHub-event and API triggers
have their **own separate per-routine/per-account hourly caps**, not the scheduled daily cap, and
**one-off `Run now` runs don't count** at all ([docs](https://code.claude.com/docs/en/routines) ·
[blog](https://claude.com/blog/introducing-routines-in-claude-code)).

| Routine | Trigger | Counts against the 5/day scheduled cap? |
|---|---|---|
| A GitHub-event routine (e.g. review-on-PR) | GitHub `pull_request.opened` | **No** — GitHub-event, separate hourly caps |
| A nightly scheduled routine | Schedule, nightly | Yes, 1/day |
| A weekly scheduled routine | Schedule, weekly | Yes, but ~0.14/day |

Tally your own routines against this table before adding more scheduled ones — GitHub-event triggers
are effectively free for solo/small-team PR volume; scheduled routines are the ones to budget.

## Run-failure visibility (optional notification ping)

Routines have **no built-in failure alert** — *"a green status means the session started and exited
without an infrastructure error. It does not mean the task succeeded"*
([docs](https://code.claude.com/docs/en/routines)). A comment/PR-output routine's actionable output is
already visible via GitHub notifications. The gap is a **run that fails to complete** (network blocked,
auth, hourly cap) — that shows only on `claude.ai/code/routines` / the transcript unless you check.

For a report-delivery routine (Telegram or otherwise), add an **optional, best-effort ping-on-failure**
step gated on your notification credentials being present (so it degrades to a no-op where unset) —
fires **only on a blocking failure**, never on a healthy run.

## Gotchas (generalizable — hit these live building the origin project's routines)

- **The `gh` CLI is NOT pre-installed in a routine's cloud sandbox.** If any step shells out to it,
  provisioning is the #1 thing that blocks the whole routine if skipped. Fix, in the routine's
  **environment** settings (Edit routine → environment icon → settings gear), **Setup script**:
  ```bash
  apt update || true
  apt install -y gh
  ```
  **Not** the naive `apt update && apt install -y gh`. The base image can ship third-party PPAs
  pre-configured for unrelated tooling, and if any of them 403s, `apt update`'s all-or-nothing exit code
  aborts before the install step ever runs — even though the Ubuntu archives `gh` actually needs fetch
  fine in the same run. `|| true` makes the update non-fatal so the install step still runs. This runs
  once and is cached (~7-day expiry); it does not re-run every session. Then add a **`GH_TOKEN`** env var
  (a PAT with read/write on the repos you need — `gh` reads it automatically, no `gh auth login` step).
  `github.com`/`api.github.com` are already in the **Trusted** network-access default.
- **A routine's cloud sandbox is a fresh checkout every run — a locally-written gitignored config file
  never persists to the next run.** If a script's config-loading convention is "local file first, env
  var fallback" (e.g. a chat-id override), the env var is what actually works unattended; provision that
  env var on the routine, not just the local file.
- **A GitHub trigger fires on one specific action OR all-actions-in-category — you cannot combine two
  specific actions** (e.g. `opened` + `ready_for_review`) ([docs](https://code.claude.com/docs/en/routines)).
  Pick the one that matches how PRs actually land in your repo, or pick all-actions-in-category + a
  filter for full coverage at the cost of firing on more events.
- **"Allow unrestricted branch pushes" can silently fail to save in the Routines UI**, live-observed on
  at least one account. Don't design a routine that needs it — the `claude/`-prefix default push scope
  is enough for both "open a docs PR" and "persist a log on a dedicated branch," so there's usually
  nothing to configure here at all.
- **`GH_DEBUG=api` is the tool for tracing whether a `gh` subcommand routes through GraphQL or REST** —
  in at least one routine sandbox, GraphQL was blocked while REST worked fine, and several common `gh`
  subcommands (`pr list --json`, `pr view --json`, `pr comment`) route through GraphQL internally even
  though they look like plain REST calls. If a routine's `gh`-dependent step goes silently blank, trace
  with `GH_DEBUG=api gh <command> 2>&1 | grep 'Request to'` before assuming the fix (e.g. the setup
  script) didn't work — you may need a REST-only rewrite of that specific call instead.

## Notes
- **Research preview:** limits/API may change. Routines here should stay advisory/observability; if the
  feature breaks, the deterministic layers (CI, deploy notifiers) remain the SSOT and are untouched. The
  only standing discipline: never let a routine become load-bearing.
