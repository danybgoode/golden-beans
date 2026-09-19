# scripts/ — where these come from

Two kinds of script live here, and the difference matters when you change one.

## Shared rails — byte-identical to `dobby-foundation/template/scripts/`

These are the ways-of-work plugin's skills' scripts, ported by dobby-foundation's
`plugin-audit-and-extraction` epic (Sprint 3, story 3.3). **Change them in dobby-foundation and copy
back — never fork them here.** A fork is how a rail ends up with three implementations.

| Rail | Files | This project's values |
|---|---|---|
| Prose writer + guard | `lib/prose-writer.mjs`, `lib/prose-guard.mjs`, `prose-draft.mjs`, `prose/internal.task.md` (+ tests) | `reporting.config.json` → `prose.extraBannedToolNames` |
| Reporting skills | `standup.mjs`, `weekly-recap.mjs`, `pmo-report.mjs`, `lib/{reporting-config,prose-brief,telegram-format,log-branch,gh-rest,standup-deck,report-registry,pmo-*}.mjs`, `prose/`, `pmo/`, `standup/` | `reporting.config.json` (committed; `vercelProject` names the project the stale-preview count reads; the chat id is NOT in it — this repo is public: `TELEGRAM_CHAT_ID`, or a gitignored `reporting.config.local.json`) |
| PR / board / docs skills | `babysit-pr.mjs`, `build-order.mjs`, `lib/roadmap-status-buckets.mjs`, `build-order-sync.mjs`, `doc-hygiene.mjs`, `doc-format.mjs`, `vercel-prune-previews.mjs` | `doc-format.enforced.json` (all of `Roadmap/` — every doc was brought to the template shape on adoption) |
| Browser smoke | `live-smoke.mjs`, `apps/web/e2e/_live/ad-hoc.browser.spec.ts`, `apps/web/e2e/_helpers/auth.ts` | `live-smoke.config.json` (unauthed; the authed rail stays this repo's own `authed` Playwright project) |

`lib/cross-agent-cli.mjs` is this project's own (see below) but gained the template's `runDevin` export,
which the shared prose writer needs.

`roadmap-extract.mjs` **delegates** to this project's `roadmap-to-notion.mjs --extract` rather than forking
the extractor — that script drives the live Notion board.

## This project's own rails — deliberately divergent, with reasons

A rail listed here has a sibling in the template. Each is kept on purpose; the reason is the part to
re-check before "unifying" it.

- **`standup-report.mjs`** — a LOCAL, git-derived prose report (writer + guard, `--post`), run by a person
  or the report daemon. The template's `standup.mjs` is a ROUTINE-driven, multi-repo PR/CI/board delta
  report. Different inputs, different trigger, different reader; both now use the one shared prose
  writer and guard. The plugin's `standup-post` skill runs the template one.
- **`commit-report.mjs` + `report-new-commits.mjs` + `report-main-daemon.mjs`** (and `launchd/`) — the
  merge-report rail, which *originated here*. It posts to Telegram **and Slack**, checkpoints
  exactly-once **per channel**, and retries from a launchd daemon because the prose writers have no
  headless auth. The template ships the simpler single-channel, hook-driven `merge-report.mjs` (the origin
  project's). This one is a superset the template does not need; it shares the prose writer and guard.
- **`pod-report.mjs`** (+ `lib/pod-metrics.mjs`) — not ops reporting: it computes the Pod Report
  *artifact* this product serves. The template's `pmo-report.mjs` reports on the project's own delivery.
- **The review rail** — `lib/cross-agent-cli.mjs` (the CLI driver), `cross-review.mjs`,
  `cross-panel.mjs`, their prompts and `lib/vibe-invocation.test.mjs` — forked by the review-stack work
  before this epic. Unifying it is that rail's job, not this one's.
- **Project fill-in** — `prose-lessons.md`: this project's own lessons (the persona is the shared one).
