# Growth Engine v1 — Retrospective

_Closed: 2026-07-16_

## What shipped

A standalone, telemetry-first Unified Growth Engine, dogfooded against one real Miyagi feature end
to end, across four sprints:

- **Sprint 1** (PR [#1](https://github.com/danybgoode/golden-beans/pull/1), `55b6606`; Miyagi PR
  [#253](https://github.com/danybgoode/miyagisanchezcommerce/pull/253), `6e8d912`) — `POST
  /v1/track` ingest, the TS SDK (`track`, `trackAdoption`), and the setup-guide funnel instrumented
  behind `growth.telemetry_enabled` (default OFF). Infra provisioned: Supabase project
  `golden-beans` + Vercel project `golden-beans`.
- **Sprint 2** (PR [#2](https://github.com/danybgoode/golden-beans/pull/2), `02c6219`) — a feature
  registry seeded from Miyagi's live `platform_flags`, TARS (Targeted/Adopted/Retained) aggregation,
  and the first real funnel page — confirmed live by Daniel with real production traffic.
- **Sprint 3** (PR [#3](https://github.com/danybgoode/golden-beans/pull/3), `bd154f1`; fix PR
  [#4](https://github.com/danybgoode/golden-beans/pull/4), `75134a7`) — a North Star metric
  (`payable_sellers`) with two leading inputs, feature→input linkage, real revenue ingest from
  Miyagi's `financial_event` ledger, and a per-feature impact report.
- **Sprint 4** (PR [#5](https://github.com/danybgoode/golden-beans/pull/5), squash `94f0067`) — A/B
  v1: deterministic client-side hash bucketing in the SDK, exposure events, and a side-by-side
  variant comparison view (basic lift). Deployed to production
  (`dpl_3XbG9GfK3Q5WGSTTW21CM2jKAhy5`).

Production: `https://golden-beans-gamma.vercel.app`. Supabase project `golden-beans` (ref
`slweidgffcfndnskcskc`).

## What went well

- **The reuse-first design habit compounded.** Every sprint after S1 built on the prior sprint's
  primitives rather than inventing parallel ones — S2's registry reused S1's SDK envelope
  convention, S3's revenue sync reused S2's client-push pattern verbatim, and S4 avoided a new DB
  migration entirely by recognizing the existing `events` table's `tags`/`metadata` JSONB (designed
  extensible from day one in S1) already covered what a new `experiments` registry would have
  provided. Each sprint's own risk tier stayed lower as a direct result.
- **The pure/impure split (`lib/x.ts` pure + `lib/x-query.ts` DB-touching) held up across four
  different domains** (TARS, North Star, A/B) without needing to be reinvented or adapted — new
  code could mirror an existing pair almost verbatim, which also made each new spec fast to write
  (same fixture/assertion shape as the sprint before it).
- **The layered review process (deterministic gate → advisory cross-agent → fresh independent
  reviewer) caught real, different things at each layer** in S4: the deterministic gate caught a
  stale generated file (`BUILD-ORDER.md`); the advisory cross-agent pass (Codex) caught a
  cosmetic hash-range edge case and a trim inconsistency; the fresh independent reviewer caught a
  genuine correctness bug (see below) that both the builder's own manual smoke *and* the advisory
  pass missed. No single layer would have caught everything — the combination did its job.

## What we learned

- **A manual smoke test written by the same session that built the feature can share the
  implementation's own narrow, unstated assumption — and miss the exact bug a differently-shaped
  test would catch.** S4's comparison query originally required the *metric/conversion* event to
  also carry `featureId` set to the experiment key (mirroring how the *exposure* event is scoped).
  Every spec written during the build, and the builder's own manual `curl` smoke, happened to tag
  the conversion event with `featureId` too — so both looked green. A real conversion event
  (`checkout_completed`, `signup`, ...) fired through the normal `track()` path has no reason to
  carry an unrelated experiment's key; the bug would have silently reported 0 conversions for every
  real caller. Only a **fresh reviewer with no context on how the feature was built** — reviewing
  the diff and its acceptance criteria cold — thought to ask "what does a *realistic*, untagged
  conversion event look like?" Promoted to `Roadmap/LEARNINGS.md`.
- **A broad wrap-up instruction ("merge on green", "wrap up all around as per process") authorizes
  the ordinary steps of that process, not a categorically more consequential action inside it** — a
  production deploy, or fetching/printing a live secret key to mint a new credential. Both got
  blocked mid-session in S4 despite two rounds of broad authorization language, requiring the
  product owner to name each action specifically. Promoted to `Roadmap/LEARNINGS.md`.
- **Cross-repo revenue ingest (S3) surfaced two distinct, non-obvious infra facts** — a sibling
  system can have multiple databases wearing similar names (only one of which is actually Supabase),
  and a correct connection string can still be network-unreachable from outside the VPC. Both
  already promoted to `Roadmap/LEARNINGS.md` at S3 close; still holding, no new instance this epic.

## Gaps / follow-ups

- **Owed to Daniel: Sprint 4's real-production smoke** (an authenticated round-trip against
  `https://golden-beans-gamma.vercel.app` proving bucketing → exposure → comparison end-to-end with
  real data). No session held a plaintext production API key to run this as the agent — same
  limitation Sprints 2–3 hit for their own agent-verified Part A's. A copy-pasteable smoke kit
  (mint a disposable project via the Supabase SQL editor, run the `curl` sequence, clean up) is in
  `sprint-4.md`.
- **v1's honest boundary carries forward**: TARS numbers are registry-declared, not
  gateway-observed; A/B bucketing has no flag-serving gateway (Decision 1); the funnel page has no
  auth (no admin-auth system exists yet — acceptable for this internal tool, worth revisiting before
  the URL is shared more broadly, per S2's own carried-forward note).
- **No index on `events(project_id, event)`.** S4's comparison query filters by event name without
  `feature_id` for the metric-event half (a deliberate, correct fix — see "What we learned" above),
  which doesn't hit the existing `(project_id, feature_id, created_at)` composite index. Fine at
  current volume (same stance already taken for `tars-query.ts`'s unpaginated full-history read);
  worth an index if/when this table's row count grows enough to matter.
- **v2 candidates**, not scoped here: a resolve endpoint / flag-serving gateway if telemetry-first
  ever needs to become gateway-observed; a statistical-significance engine on top of S4's basic
  lift; chaos-scenario tagging (the `tags`/`metadata` extensibility this epic leaned on throughout
  is explicitly designed to carry that without a migration).
