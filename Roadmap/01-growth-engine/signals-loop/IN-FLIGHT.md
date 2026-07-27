# In flight — session trail

> Written by `scripts/session-trail.mjs`. Each entry records what a session had IN FLIGHT
> (uncommitted) plus the mechanically-derived branch/HEAD/file state at that moment. On re-entry,
> `--resume` diffs that against the repository now and leads with the disagreement — because a
> handover's claims must be re-derived, never trusted (Roadmap/LEARNINGS.md).
>
> **Delete this file at epic close**, promoting anything durable into RETROSPECTIVE.md.

## 2026-07-26T16:33:09.053Z — `feat/signals-loop` @ 1f20e333

_HEAD: docs(signals-loop): build-time audit — five amendments before any code_

S0 shared surface built: flags, signals/tasks migration, 4 pure modules.

**Verified by running (observed output, not believed):**
- 10/10 DB property checks vs local Postgres
- npm run test:unit → all green

**In flight at this checkpoint** — uncommitted, so it exists only in this working tree:
- `apps/web/lib/flags.ts (modified)`
- `pps/web/lib/flags.test.ts (modified)`
- `scripts/lib/cross-agent-cli.mjs (modified)`
- `apps/web/lib/friction-rules.test.ts (new)`
- `apps/web/lib/friction-rules.ts (new)`
- `apps/web/lib/signal-fingerprint.test.ts (new)`
- `apps/web/lib/signal-fingerprint.ts (new)`
- `apps/web/lib/signal-rank.test.ts (new)`
- `apps/web/lib/signal-rank.ts (new)`
- `apps/web/lib/signal-scrub.test.ts (new)`
- `apps/web/lib/signal-scrub.ts (new)`
- `apps/web/supabase/migrations/20260804100000_signals_tasks.sql (new)`
- `scripts/lib/session-trail.mjs (new)`
- `scripts/lib/session-trail.test.mjs (new)`
- `scripts/session-trail.mjs (new)`

```json session-trail-state
{
  "at": "2026-07-26T16:33:09.053Z",
  "note": "S0 shared surface built: flags, signals/tasks migration, 4 pure modules.",
  "branch": "feat/signals-loop",
  "head": "1f20e33306da1e22ebc1663c5db1c1d051945e67",
  "headSubject": "docs(signals-loop): build-time audit — five amendments before any code",
  "dirty": [
    "apps/web/lib/flags.ts",
    "pps/web/lib/flags.test.ts",
    "scripts/lib/cross-agent-cli.mjs"
  ],
  "untracked": [
    "apps/web/lib/friction-rules.test.ts",
    "apps/web/lib/friction-rules.ts",
    "apps/web/lib/signal-fingerprint.test.ts",
    "apps/web/lib/signal-fingerprint.ts",
    "apps/web/lib/signal-rank.test.ts",
    "apps/web/lib/signal-rank.ts",
    "apps/web/lib/signal-scrub.test.ts",
    "apps/web/lib/signal-scrub.ts",
    "apps/web/supabase/migrations/20260804100000_signals_tasks.sql",
    "scripts/lib/session-trail.mjs",
    "scripts/lib/session-trail.test.mjs",
    "scripts/session-trail.mjs"
  ],
  "verified": [
    "10/10 DB property checks vs local Postgres",
    "npm run test:unit → all green"
  ]
}
```

## 2026-07-26T16:39:13.299Z — `feat/signals-loop` @ 0c3b8278

_HEAD: chore(process): pin the codex review model, and a session trail that admits when it is stale_

Sprint 1 in progress: lib/signals.ts (grouping seam), lib/friction-eval.ts (lazy eval, no cron), SDK captureError + captureGlobalErrors + scrub. Track route wired. NEXT: e2e spec for ingest->signal, then commit S1 and open PR #1.

**Verified by running (observed output, not believed):**
- npm run typecheck → clean (4 projects)

**In flight at this checkpoint** — uncommitted, so it exists only in this working tree:
- `packages/sdk/src/index.ts (modified)`
- `pps/web/app/api/v1/track/route.ts (modified)`
- `apps/web/lib/friction-eval.ts (new)`
- `apps/web/lib/signals.ts (new)`
- `packages/sdk/src/scrub.ts (new)`

```json session-trail-state
{
  "at": "2026-07-26T16:39:13.299Z",
  "note": "Sprint 1 in progress: lib/signals.ts (grouping seam), lib/friction-eval.ts (lazy eval, no cron), SDK captureError + captureGlobalErrors + scrub. Track route wired. NEXT: e2e spec for ingest->signal, then commit S1 and open PR #1.",
  "branch": "feat/signals-loop",
  "head": "0c3b827866d628952acef423022bf212df04ddba",
  "headSubject": "chore(process): pin the codex review model, and a session trail that admits when it is stale",
  "dirty": [
    "packages/sdk/src/index.ts",
    "pps/web/app/api/v1/track/route.ts"
  ],
  "untracked": [
    "apps/web/lib/friction-eval.ts",
    "apps/web/lib/signals.ts",
    "packages/sdk/src/scrub.ts"
  ],
  "verified": [
    "npm run typecheck → clean (4 projects)"
  ]
}
```

## 2026-07-26T17:01:40.305Z — `feat/signals-loop` @ c3008a57

_HEAD: feat(signals-loop): Sprint 1 — errors in, grouped, with friction derived lazily_

Sprint 1 COMMITTED (c3008a5). Docs amendments (1f20e33), S0 shared surface (36edf59), process fixes (0c3b827). NEXT: push branch, open PR #1 for Sprint 1, then Sprint 2 (promotion + dashboard + read tools).

**Verified by running (observed output, not believed):**
- full api e2e: 366 passed / 1 failed / 5 skipped — the 1 failure reproduced on a STASHED clean tree, so pre-existing not a regression
- npm run typecheck + lint + 601 unit tests + build all green
- mutation checks: fingerprint-ignores-stack -> 2 red; scrub-disabled -> 2 red; reserved-guard-disabled -> 1 red; tree reverted byte-identical each time

**In flight:** nothing — the working tree was clean.

```json session-trail-state
{
  "at": "2026-07-26T17:01:40.305Z",
  "note": "Sprint 1 COMMITTED (c3008a5). Docs amendments (1f20e33), S0 shared surface (36edf59), process fixes (0c3b827). NEXT: push branch, open PR #1 for Sprint 1, then Sprint 2 (promotion + dashboard + read tools).",
  "branch": "feat/signals-loop",
  "head": "c3008a57ab03c10dba12758e800ce1677b8e0dc6",
  "headSubject": "feat(signals-loop): Sprint 1 — errors in, grouped, with friction derived lazily",
  "dirty": [],
  "untracked": [],
  "verified": [
    "full api e2e: 366 passed / 1 failed / 5 skipped — the 1 failure reproduced on a STASHED clean tree, so pre-existing not a regression",
    "npm run typecheck + lint + 601 unit tests + build all green",
    "mutation checks: fingerprint-ignores-stack -> 2 red; scrub-disabled -> 2 red; reserved-guard-disabled -> 1 red; tree reverted byte-identical each time"
  ]
}
```

## 2026-07-26T21:41:00.672Z — `main` @ 3b76d488

_HEAD: signals-loop Sprint 2 — signals become tasks, humans and agents see the same queue (#37)_

Sprint 2 MERGED (3b76d48) + migrations applied to prod. Both gates OFF. NEXT: Sprint 3 on a FRESH branch off main — agent_write credential scope, staged propose->confirm->apply writes, landing S4 (PostHog = ANNOUNCED not shipped), launch.

**Verified by running (observed output, not believed):**
- all 6 CI checks green on PR #37
- prod: 4 migrations applied, recurrence gate + actor validation present in the DEPLOYED function bodies

**In flight at this checkpoint** — uncommitted, so it exists only in this working tree:
- `oadmap/01-growth-engine/signals-loop/sprint-2.md (modified)`

```json session-trail-state
{
  "at": "2026-07-26T21:41:00.672Z",
  "note": "Sprint 2 MERGED (3b76d48) + migrations applied to prod. Both gates OFF. NEXT: Sprint 3 on a FRESH branch off main — agent_write credential scope, staged propose->confirm->apply writes, landing S4 (PostHog = ANNOUNCED not shipped), launch.",
  "branch": "main",
  "head": "3b76d488d81252e8061a91bab53471aa3b12e2f7",
  "headSubject": "signals-loop Sprint 2 — signals become tasks, humans and agents see the same queue (#37)",
  "dirty": [
    "oadmap/01-growth-engine/signals-loop/sprint-2.md"
  ],
  "untracked": [],
  "verified": [
    "all 6 CI checks green on PR #37",
    "prod: 4 migrations applied, recurrence gate + actor validation present in the DEPLOYED function bodies"
  ]
}
```

## 2026-07-26T22:23:13.600Z — `feat/signals-loop-s3` @ 7811682b

_HEAD: chore(process): Codex becomes a build delegate, and the session trail stops losing its own trail_

S3 shared surface committed (7811682): codex-task delegation rail + tier table (ONE entitled model, effort-based tiers), session-trail epic resolution + parsePorcelain fix. NEXT: Story 3.1 agent_write credential scope (architect-only).

**Verified by running (observed output, not believed):**
- 213 script unit tests green
- codex-task live smoke wrote a real file; bogus model + bad tier both fail loud
- mutation check: reintroducing the porcelain .trim() turns 2 specs red, reverted clean

**In flight:** nothing — the working tree was clean.

```json session-trail-state
{
  "at": "2026-07-26T22:23:13.600Z",
  "note": "S3 shared surface committed (7811682): codex-task delegation rail + tier table (ONE entitled model, effort-based tiers), session-trail epic resolution + parsePorcelain fix. NEXT: Story 3.1 agent_write credential scope (architect-only).",
  "branch": "feat/signals-loop-s3",
  "head": "7811682b10e011bca5577e03fbb545e37ccd2b38",
  "headSubject": "chore(process): Codex becomes a build delegate, and the session trail stops losing its own trail",
  "dirty": [],
  "untracked": [],
  "verified": [
    "213 script unit tests green",
    "codex-task live smoke wrote a real file; bogus model + bad tier both fail loud",
    "mutation check: reintroducing the porcelain .trim() turns 2 specs red, reverted clean"
  ]
}
```

## 2026-07-26T22:54:33.132Z — `feat/signals-loop-s3` @ 3c5190fb

_HEAD: feat(signals-loop): Story 3.2 — staged write tools, the engine's first public mutation surface_

S3: 3.1 (agent_write scope) + 3.3a (landing S4, delegated to Codex) + 3.2 (staged write tools) all COMMITTED. NEXT: 3.3b ladder evidence, then cross-family review, then 3.4 launch (flip BOTH gates - Daniel wants it live, not dark).

**Verified by running (observed output, not believed):**
- 17/17 write-tool specs green (gate ON) + dark polarity green (gate OFF)
- 657 unit tests; typecheck 4 projects; lint clean
- full api suite: 6 failures, identical 6 on a stashed clean tree = pre-existing local-env, zero regressions
- mutation checks: same-project check deleted -> only cross-project spec red; token not spent -> single-use + expiry red; both reverted clean

**In flight:** nothing — the working tree was clean.

```json session-trail-state
{
  "at": "2026-07-26T22:54:33.132Z",
  "note": "S3: 3.1 (agent_write scope) + 3.3a (landing S4, delegated to Codex) + 3.2 (staged write tools) all COMMITTED. NEXT: 3.3b ladder evidence, then cross-family review, then 3.4 launch (flip BOTH gates - Daniel wants it live, not dark).",
  "branch": "feat/signals-loop-s3",
  "head": "3c5190fbe9a7a4be1ef51d73df59c729b7b5a4a7",
  "headSubject": "feat(signals-loop): Story 3.2 — staged write tools, the engine's first public mutation surface",
  "dirty": [],
  "untracked": [],
  "verified": [
    "17/17 write-tool specs green (gate ON) + dark polarity green (gate OFF)",
    "657 unit tests; typecheck 4 projects; lint clean",
    "full api suite: 6 failures, identical 6 on a stashed clean tree = pre-existing local-env, zero regressions",
    "mutation checks: same-project check deleted -> only cross-project spec red; token not spent -> single-use + expiry red; both reverted clean"
  ]
}
```

