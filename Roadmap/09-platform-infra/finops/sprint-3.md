---
epic: finops
sprint: 3
title: "The engine — usage events, the roadmap push and /app/finops"
risk: high
phase: Shipped
stories_total: 4
stories:
  - id: S3.1
    title: "$agent_usage on the existing /track — opt-in, idempotent, metrics only"
    as_a: "the product owner"
    i_want: "my sessions' usage sent to my project in the engine when I turn it on"
    so_that: "spend from every machine I build on adds up in one place, broken down by skill and model"
    risk: high
    status: done
  - id: S3.2
    title: "The roadmap push carries quote and actual"
    as_a: "the product owner"
    i_want: "each epic's quote and actual on the roadmap I already push"
    so_that: "the Roadmap Hub and the portfolio view show them with no second pipeline"
    risk: high
    status: done
  - id: S3.3
    title: "/app/finops — per project, per epic, per skill, per model"
    as_a: "the product owner"
    i_want: "a FinOps page for my project"
    so_that: "I can see what each epic, skill and model cost and how often quotes held"
    risk: high
    status: done
  - id: S3.4
    title: "The landing's FinOps surface flips from unbuilt"
    as_a: "a visitor to goldenfrijoles.com"
    i_want: "the FinOps section to say what is actually live"
    so_that: "the public page never over-claims or lags"
    risk: low
    status: done
---
# FinOps: quote vs actual per epic — measured from your own sessions, shown live in the build view, sent to the engine — Sprint 3: The engine — usage events, the roadmap push and /app/finops

**Status:** ✅ shipped — #232 `379b50d` (merged + deployed 2026-10-03)

**Re-bet at the wave boundary (2026-10-02):** wave 1 (S1–S2) used one orchestrated session and stayed inside the L appetite; the product owner's kickoff authorised the whole epic in one run, so Sprint 3 proceeded without returning to shaping.

## Build contract (locked by the architect before the builder started — 2026-10-02)
Cites README § Architecture lock (D21–D26). **No migration**: `$agent_usage` rides the `events` table through the
existing ingest RPC; the roadmap fields ride the artifact's JSON payload. Engine before kit before landing.
- **3.1 —** `lib/signal-events.ts` gains `AGENT_USAGE_EVENT = '$agent_usage'` (NOT added to
  `isReservedSignalEvent`, which means "group into signals"); a new zero-import `lib/agent-usage.ts` owns the payload
  schema (the exact D9 key set, strict) and the latest-wins reader (D22). The track route rejects a `$agent_usage` event
  whose `metadata` fails that schema (400) — the scrub. Kit side: `epic-actuals.mjs --push` (D21/D23/D24).
- **3.2 —** `roadmapRowSchema` + six nullish numeric/string fields; `scripts/roadmap-extract.mjs` already emits them
  (2.1); a typed accessor `epicFinopsFromArtifact()` exported for portfolio-view; Hub epic drill-down line.
- **3.3 —** `app/app/finops/[projectSlug]/page.tsx` (D25), registered wherever the console's route manifest and
  design-coverage gates require; the `tenancy` lint stays clean.
- **3.4 —** `lib/maker-ops.ts` per D26 + copy per C13; `maker-ops.test.ts`, landing browser spec.

## Stories

### Story 3.1 — $agent_usage on the existing /track — opt-in, idempotent, metrics only
**As** the product owner, **I want** my sessions' usage sent to my project in the engine when I turn it on, **so that** spend from every machine I build on adds up in one place, broken down by skill and model.
**Acceptance:**
- `$agent_usage` is a reserved event name beside `$error` (`lib/signal-events.ts`) on `POST /api/v1/track`; no new route, no new table (AGENTS rule #1).
- One event per (session, epic): `{ session_id, epic, branch, model_breakdown, skill_breakdown, tokens_by_kind, usd_estimate, price_table_date, first_at, last_at }` — a spec asserts the exact key set and that no content field exists (D9).
- A re-push of the same (session, epic) replaces, never double-counts (the idempotency fingerprint) — api spec.
- With `finops.push` unset nothing is sent (spec on the kit side); `GF-NEEDS-SETTING` asks once, the answer is saved with `config set` (D10).
- The credential decision (lock D13) is recorded in the README; a wrong-project key cannot write another project's usage (api spec).
**QA:** api spec `e2e/agent-usage.spec.ts` (accept, idempotent, reject foreign key, payload scrub); kit spec for the opt-in; security lens (risk high).
**Risk:** high

### Story 3.2 — The roadmap push carries quote and actual
**As** the product owner, **I want** each epic's quote and actual on the roadmap I already push, **so that** the Roadmap Hub and the portfolio view show them with no second pipeline.
**Acceptance:**
- `roadmapRowSchema` gains six nullish fields (D6 names); `ROADMAP_SCHEMA_VERSION` handling keeps an older client's push valid — api spec pushes without them.
- The Roadmap Hub's epic drill-down (`app/hub/[projectSlug]/epic/[epicSlug]/page.tsx`) shows `Quote $lo–hi · Actual ≈$n (Δ%)` when present and nothing when absent.
- `portfolio-view` can read them from `getLatestArtifact` (a typed accessor exported for it).
**QA:** api spec on `/api/v1/roadmap/push` (with and without fields); unit spec on the drill-down view model.
**Risk:** high

### Story 3.3 — /app/finops — per project, per epic, per skill, per model
**As** the product owner, **I want** a FinOps page for my project, **so that** I can see what each epic, skill and model cost and how often quotes held.
**Acceptance:**
- `/app/finops` renders the three approved surfaces from the seed: populated (summary tiles · Epics · By skill · the ≈ API $ note), empty (how to turn on the push), error.
- Epics come from the latest roadmap artifact (3.2); skills and models from `$agent_usage` events (3.1); each says where it came from.
- Reads exactly one project resolved server-side through `lib/membership.ts`; a non-member gets 404 (api spec); the `tenancy` lint stays clean.
- "Claude Code only — other agents not measured" is on the page (D12).
**QA:** api spec for access; browser spec for the three states (replaces a browser smoke).
**Amended at the build:** the api gate covers unauthed → `/login`; the signed-in non-member 404, the empty state and the
populated state are in `e2e/finops.authed.spec.ts` (the opt-in authed rail — passed locally). The **error** state (a failed
read) cannot be provoked from a browser without breaking the database; it is one branch in `page.tsx`, not asserted. The
page also shows **By model** beside By skill (the story title's "per model"), and lands uncovered in the design ledger
with a dated deferral (its seed surfaces are not a hashed state yet).
**Risk:** high

### Story 3.4 — The landing's FinOps surface flips from unbuilt
**As** a visitor to goldenfrijoles.com, **I want** the FinOps section to say what is actually live, **so that** the public page never over-claims or lags.
**Acceptance:**
- `lib/maker-ops.ts` FinOps `availability` moves from `unbuilt` to what is true (shipped, or `gated` on the opt-in with a describable gate) — the comment at `maker-ops.ts:25` is the rule.
- The section's copy claims only what `/app/finops` shows; `maker-ops.test.ts` and `e2e/landing.browser.spec.ts` updated.
- Lands **last**, after 3.1–3.3 are live.
**QA:** `maker-ops.test.ts`; landing browser spec.
**Risk:** low

## Sprint QA
- **api specs:** `agent-usage.spec.ts`, roadmap-push additions, `/app/finops` access — in the `api` project (the gate).
- **browser spec:** `/app/finops` three states; landing FinOps section.
- **review:** risk HIGH → the security lens runs (paths + body); fresh `pr-reviewer`; routed external pass.
- **browser smoke owed:** the authed console steps below are owed to the product owner by name.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com   (or the preview URL while testing pre-merge)

1. In the repo, run `npx -y @golden-frijoles/kit config set spend.telemetry on` (lock D21 — the setting that already
   existed, not `finops.push`), make sure `SELF_PROJECT_API_KEY` and `GROWTH_ENGINE_URL=https://goldenfrijoles.com` are
   in the shell, then run `node scripts/epic-actuals.mjs --push`.
   → `pushed N session snapshot(s) — ok`; `node scripts/epic-actuals.mjs --epic <slug> --json` shows `pushed_at` set.
2. (auth — owed to Daniel) Sign in and go to https://goldenfrijoles.com/app/finops/<slug> (lock D25: console pages are per project)
   → the Epics table lists the epic with its quote and ≈ actual; By skill and By model are filled.
3. Push the roadmap with `node scripts/roadmap-push.mjs`, then open https://goldenfrijoles.com/hub/<slug>/epic/finops (`<slug>` = the project `gf projects` prints for this repo)
   → the epic drill-down shows "Quote … · Actual …".
4. Open https://goldenfrijoles.com/app/finops/<slug> in a private window, signed in as a user who is not a member of the project.
   → 404, not the page.
5. Go to https://goldenfrijoles.com and scroll to FinOps.
   → it no longer says unbuilt, and every claim matches what step 2 showed.

If any step fails, note the step number + what you saw — that's the bug report.
