# scripts/ — where these come from

Two kinds of script live here, and the difference matters when you change one.

## Shared rails — byte-identical to `dobby-foundation/template/scripts/`

These are the ways-of-work plugin's skills' scripts, ported by dobby-foundation's
`plugin-audit-and-extraction` epic (Sprint 3, story 3.3). **Change them in dobby-foundation and copy
back — never fork them here.** A fork is how a rail ends up with three implementations.

| Rail | Files | This project's values |
|---|---|---|
| Prose writer + guard | `lib/prose-writer.mjs`, `lib/prose-guard.mjs`, `prose-draft.mjs`, `prose/cpo-persona.md`, `prose/internal.task.md` (+ tests) | `reporting.config.json` → `prose.extraBannedToolNames` |
| Reporting skills | `standup.mjs`, `weekly-recap.mjs`, `pmo-report.mjs`, `lib/{reporting-config,prose-brief,telegram-format,log-branch,gh-rest,standup-deck,report-registry,pmo-*}.mjs`, `prose/`, `pmo/`, `standup/` | `reporting.config.json` (committed; `vercelProject` names the project the stale-preview count reads; the chat id is NOT in it — this repo is public: `TELEGRAM_CHAT_ID`, or a gitignored `reporting.config.local.json`) |
| PR / board / docs skills | `babysit-pr.mjs`, `build-order.mjs`, `lib/roadmap-status-buckets.mjs`, `build-order-sync.mjs`, `doc-hygiene.mjs`, `doc-format.mjs`, `vercel-prune-previews.mjs` | `doc-format.enforced.json` (all of `Roadmap/` — every doc was brought to the template shape on adoption) |
| Browser smoke | `live-smoke.mjs`, `apps/web/e2e/_live/ad-hoc.browser.spec.ts`, `apps/web/e2e/_helpers/auth.ts` | `live-smoke.config.json` (unauthed; the authed rail stays this repo's own `authed` Playwright project) |
| Roadmap frontmatter contract | `lib/roadmap-contract.mjs` (the one definition), `doc-format.mjs` (enforces it), `roadmap-backfill.mjs` (brought this repo's 29 epics onto it — findings in `Roadmap/00-ideas/audits/frontmatter-backfill-2026-09-19.md`) (+ tests) | none — `doc-format.enforced.json` already enforces all of `Roadmap/`, so every epic doc is held to the contract from this PR on |
| The build view resolver | `build-state.mjs` (+ test), `lib/session-journal.mjs` (the journal line format it reads) | none — `node scripts/build-state.mjs [--json] [--offline]` answers "what is being built right now" from the frontmatter contract, git and one `gh` call; read-only |
| Golden Frijoles preflight | `preflight.mjs`, `lib/golden-onboarding.mjs` (+ tests) | **Reports FAIL here, correctly — see the note below.** `groom` declares it, so it must exist; nothing in this repo is meant to pass it |

`lib/cross-agent-cli.mjs` is this project's own (see below) but gained the template's `runDevin` export,
which the shared prose writer needs.

`roadmap-extract.mjs` **delegates** to this project's `roadmap-to-notion.mjs --extract` rather than forking
the extractor — that script drives the live Notion board.

### `preflight.mjs` fails in THIS repo, and that is the right answer

It is the ways-of-work mandate that a project spawned from the template reads its flags from Golden
Frijoles: `preflight.mjs` checks that a project is linked, that a `flag_read` key resolves a
snapshot, and that the CLI is installed and current. **This repo is the other end of that wire** — it
*is* Golden Frijoles. It serves `/api/v1/flags/snapshot`; it does not consume it, and its
`.env.local` carries this product's own service configuration, not a `GOLDEN_FRIJOLES_FLAG_READ_KEY`
pointing at itself.

So a bare `node scripts/preflight.mjs` here prints ✅ for the CLI, the version and the SDK (both are
workspace packages) and ❌ for `project` and `flag-read-key`. That is the check telling the truth: this
repo is not a consumer. It lives here because `groom`'s `requires_scripts` declares it and
`check-skill-scripts.mjs` is checked against this repo — a skill whose script is absent must say so
and stop, and the honest way to satisfy that is the real script, not a stub.

**Do not "fix" the red by inventing a self-pointing key.** If you ever do want to exercise it against
a real project, point it at one with the three `GOLDEN_FRIJOLES_*` variables in the environment.

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
- **Project fill-ins** — `prose-lessons.md` (this project's own lessons), `routines/README.md` and
  `review-config.json` (its routines and review routing; the template ships both as fill-ins). `prose/cpo-persona.md` is
  still the template's NEUTRAL copy (generic example people), byte-identical on purpose until someone
  fills it in for this product. It only reaches `prose-draft.mjs` here, and that tool's previous prompt
  was the template's neutral one too. The merge report, the surface that matters, keeps its own
  `commit-report.prompt.md`.
