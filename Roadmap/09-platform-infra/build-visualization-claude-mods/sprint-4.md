---
epic: build-visualization-claude-mods
sprint: 4
title: The Claude Mod
risk: low
phase: Shipped
stories_total: 3
stories:
  - id: S4.1
    title: hooks/hooks.json + the renderer
    as_a: the product owner watching an agent work
    i_want: the current epic, story and status in the CLI
    so_that: "I can see what's happening without asking"
    risk: low
    status: done
  - id: S4.2
    title: claude plugin validate in CI
    as_a: the maintainer
    i_want: the mod validated offline on every PR
    so_that: a broken hook registration is caught before anyone installs it
    risk: low
    status: done
  - id: S4.3
    title: The latency budget, measured
    as_a: a builder session
    i_want: the mod to cost nothing perceptible
    so_that: a status line never slows the work it describes
    risk: low
    status: done
---
# The build view — Sprint 4: The Claude Mod

**Status:** ✅ Shipped — [#32](https://github.com/danybgoode/dobby-foundation/pull/32)

**Epic:** [The build view](README.md) · **Risk: LOW**

**Independently droppable.** Function hooks are pre-release (enabled behind
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, with an API that can still move). If they haven't landed when
this sprint's boundary arrives, **Sprints 1–3 ship and this one waits** — the contract and the
resolver already pay on their own.

**The mod is a thin renderer (D3).** All logic lives in `build-state.mjs`. If the hook API changes,
one small file changes.

## Stories

### Story 4.1 — `hooks/hooks.json` + the renderer ✅
**As the** product owner watching an agent work, **I want** the current epic, story and status in the
CLI, **so that** I can see what's happening without asking.
**Acceptance:** `plugins/ways-of-work/hooks/hooks.json` declares `./index.ts`; the module registers
`on('turn.start', …)` to refresh state via `$.store` and renders through `$.ui.status` in the shape
the epic README specifies — five lines, no box. **It calls `build-state.mjs`; it does not parse
markdown.** Styling is left to `$.ui.status` — a mod that draws its own frame is a mod that fights
the CLI.
**Risk:** low

### Story 4.2 — `claude plugin validate` in CI ✅
**As the** maintainer, **I want** the mod validated offline on every PR,
**so that** a broken hook registration is caught before anyone installs it.
**Acceptance:** `claude plugin validate <plugin-dir>` runs in CI (it needs **no API key**) and lists
the registered hooks and their capabilities. A malformed `hooks.json` fails the build.
**Risk:** low

### Story 4.3 — The latency budget, measured ✅
**As a** builder session, **I want** the mod to cost nothing perceptible,
**so that** a status line never slows the work it describes.
**Acceptance:** per **D4**, state is derived on `turn.start`, cached in `$.store`, and invalidated on
branch change or a `Roadmap/` write. **Never shells out to `gh` inside a hook.** Turn latency with
and without the mod is **measured and recorded in this file** — asserted numbers, not a claim.
**Risk:** low

## Sprint QA
- **api spec(s):** `claude plugin validate` in CI (the gate). A unit test asserts the renderer is a
  pure function of `build-state.mjs`'s output — given fixture JSON, it produces the exact five lines.
  A cache test asserts a second `turn.start` within the same branch does no filesystem or `gh` work.
- **browser smoke owed:** no — terminal only.
- **deterministic gate:** `node --test` + `claude plugin validate` green before merge.

## Sprint 4 — Smoke walkthrough (do these in order)
Env: local · a Claude Code session in `medusa-bonsai`, on a feature branch mid-epic, with
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`

1. Install the plugin and start a session on a feature branch.
   → The build view appears: Epic, Story with its user story, Progress, Status.
2. Compare each line against `node scripts/build-state.mjs --json`.
   → Identical. The mod invented nothing.
3. Commit a story and take another turn.
   → Progress advances **without being asked**.
4. Open a PR and take another turn.
   → Status becomes `In review`.
5. Take ten turns in a row without touching `Roadmap/` or the branch.
   → No repeated `gh` calls; the cache held.
6. Measure turn latency with the mod installed vs. removed.
   → **No measurable difference.** Record the numbers in this file.
7. Run `claude plugin validate plugins/ways-of-work`.
   → Passes, and lists the registered hooks.
8. Break `hooks.json` deliberately and re-run.
   → It fails clearly. *(Revert.)*
9. Remove the `hooks.json` entry entirely and start a session.
   → The mod is gone and **nothing else changed** — `doc-format`, `build-order`, `build-state` and
     every doc still work exactly as before.

### Smoke results — run 2026-09-19 (headless sessions with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`)

Function hooks **do exist** in Claude Code 2.1.278, behind that flag. The API was established from
`claude plugin validate` and from live probe sessions, because it is pre-release and undocumented here:
a module is declared as `{"modules": ["./index.ts"]}`, exports `register(on)`, and its hooks are
`($, e, next)` with `next(e)`. `$` may only ever appear as `$.noun.event(...)` at a call site — the
runtime refuses a module that passes it to a helper — and a module may import only its own files and
`"claude-code"`. `turn.start` carries `{ text, turnId }`.

1. ✅ The mod loads and renders. Verbatim from the session log:
   ```
   hooks module ways-of-work@inline loaded (worker, environment 1, tier user); events: turn.start
   $.ui.status (ways-of-work): Currently building
     Epic     The build view — a machine-readable frontmatter contract, rendered in the CLI as a Claude Mod    09-platform-infra · risk LOW
     Story    unknown
              no commit on this branch names a story of sprint 4 of this epic, and the session journal names none either
     Progress Story ? of 13 · Sprint 4 of 4
     Status   Shaping
   ```
   That run is also the honest case: on a fresh S4 branch with no story commit yet, the view says
   `unknown` rather than inventing a story.
2. ✅ The lines are `build-state.mjs --json`'s own `lines`, joined. The renderer builds no text of its
   own (`build-view.test.mjs`: given fixture JSON it returns exactly those lines, and returns **nothing**
   on a non-zero exit, unparseable output or an empty list).
3–4. 🟡 **Owed to the product owner, in an interactive TUI**: watching Progress advance and the status
   become `In review` across turns. The mechanics under them are verified — the resolver's own tests
   cover both, and the mod re-runs it whenever branch or HEAD moves — but a headless `-p` session has no
   status row (the runtime says so: *"no status row in a headless session; kept here: …"*), so the
   rendered-in-the-CLI half is a real gap, not a claim.
5. ✅ The cache holds. Two turns on the same branch, from the session log:
   ```
   build view: resolved (feat/build-visualization-claude-mods-s4@992308d…) (ok)   turn.start settled in 174.9ms
   build view: cached   (feat/build-visualization-claude-mods-s4@992308d…)        turn.start settled in  36.4ms
   ```
   The second turn runs one `git rev-parse` and no resolver, and **no `gh` call happens in the hook at
   all** — the mod always passes `--offline` (D4).
6. ✅ **The latency budget, measured.** The hook's own cost is **174.9 ms cold / 36.4 ms cached**, of
   which ~53 ms is `node scripts/build-state.mjs` (timed from inside the hook) and the rest is the worker
   hop. End-to-end turn wall time, three runs each: **with the mod 5.54 / 5.58 / 5.07 s**, **without
   5.05 / 5.13 / 6.68 s** — model latency dominates and swamps the difference, so the hook's own settle
   time above is the number that means anything.
7. ✅ `claude plugin validate plugins/ways-of-work` passes and lists the registration:
   `./index.ts hooks: turn.start` · `./index.ts calls: $.process.run, $.store.get, $.store.set, $.ui.log, $.ui.status`.
   It runs in CI (no API key needed; the install is skip-on-failure, like the `gf` step).
8. ✅ A deliberately broken `hooks.json` fails it: `modules../nope.ts: … no such file → ✘ Validation failed`.
9. ✅ **The kill-switch.** Deleting `hooks/hooks.json` leaves the plugin valid, the mod gone (zero hook
   lines in the session log), and `doc-format --check`, `build-order --check` and `build-state` all
   working exactly as before. **Correction to the epic README:** *emptying* the entry does not work —
   `hooks.json` must declare `hooks` or `modules`, so an empty `modules: []` fails validation. The
   kill-switch is deleting the file.

### The latency budget, and one deviation (D4)
D4 asks for invalidation on a branch change **or a `Roadmap/` write**. The cache key is branch + HEAD, so
a commit or a branch change invalidates instantly; a *doc edit* is picked up by a 15-second staleness
bound instead. Detecting a `Roadmap/` write exactly would mean stat-ing 860+ docs every turn, which is
the cost the cache exists to avoid. Stated, not hidden: `MAX_AGE_MS` in `hooks/build-view.mjs`.

If any step fails, note the step number + what you saw — that's the bug report.

**Steps 2 and 9 are the ones that matter.** A build view that disagrees with the docs becomes a
dashboard people stop trusting, and a mod that can't be cleanly uninstalled is a dependency rather
than a convenience.
