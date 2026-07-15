# e2e harness

Two Playwright projects, matching WAYS-OF-WORKING.md's "Automated QA" section — coverage grows by
**one spec per new browser-/API-testable story**, not as a separate project.

- **`api` project — the deterministic gate (always-on).** `npm run test:e2e`, API-level via the
  `request` fixture, no browser binaries. CI runs this on every PR. Must be green before merge.
- **`browser` project — opt-in real-browser smoke (NOT the gate).** `npm run test:e2e:browser`,
  Chromium, `*.browser.spec.ts`. Not needed yet — the funnel page (Sprint 2) is asserted via its SSR
  HTML through the `api` project's `request` fixture instead of a browser binary.

## Specs

- `track.spec.ts` — Story 1.1 (`POST /v1/track`): missing/invalid API key → 401, malformed body →
  400, valid request → 201 + row persisted, and tenant isolation (project-two's key can never
  produce a row scoped to project-one, verified via a direct DB read using the service-role key —
  there's no public read endpoint yet in v1).
- `sdk.spec.ts` — Story 1.2 (TS SDK): `track()`/`trackAdoption()` reach `/v1/track` and return the
  envelope shape, including the never-throws bad-key case.
- `features-sync.spec.ts` — Story 2.1 (`POST /v1/features/sync`): 401/400 gates, a valid sync
  upserts a fresh `synced_at`, re-sync updates in place (no duplicate row), tenant isolation.
- `tars.spec.ts` — Story 2.2 (`computeTars`): a synthetic `setup_guide`-shaped event fixture against
  the pure aggregation function — no network, still runs under `api` per house convention.
- `funnel.spec.ts` — Story 2.3 (funnel endpoint/page): 404 for an unregistered feature; a registered
  feature's JSON endpoint and the SSR funnel page both reflect a real synthetic event sequence
  (the page's rendered HTML is inspected via the `request` fixture — no browser binary needed).
- `north-star-sync.spec.ts` — Story 3.1 (`POST /v1/north-star/sync` + `GET /v1/north-star`): 401,
  `telemetry_event`/`external_push` `sourceEvent` validation, duplicate keys → 400, a valid sync is
  queryable, re-sync with a different `valueSource` → 400, tenant isolation.
- `feature-input-link.spec.ts` — Story 3.2 (`POST /v1/features/:key/link-input`): 401, 404 for an
  unknown input, idempotent link (no duplicate row on re-link), tenant isolation.
- `input-values.spec.ts` — Story 3.3 (`POST /v1/inputs/:key/values`): 401, malformed/impossible
  dates → 400, 404 for an unknown input, pushing to a `telemetry_event`-sourced input → 400 (those
  are computed, never pushed), duplicate dates in one payload → 400, a valid push is idempotent on
  re-run, tenant isolation, and the append-only trigger rejects a mutation attempt.
- `impact.spec.ts` — Story 3.4 (per-feature input-impact report): 404 for a feature with no linked
  inputs; the JSON endpoint and the SSR impact page both reflect a real telemetry series and a real
  pushed-revenue series for a linked feature.
- `bucketing.spec.ts` — Story 4.1 (SDK `bucket()`): synchronous (no network), the same
  userId+experimentKey always resolves to the same variant regardless of the order variants are
  passed in, and an empty/all-zero-weight variant list returns an `ok:false` envelope.
- `exposure.spec.ts` — Story 4.2 (SDK `trackExposure()`): a bucketed variant persists an
  `experiment_exposed` event with `tags.variant` set, caller-supplied tags are merged (not
  overwritten), and exposure events are queryable alongside other events by `feature_id`.
- `experiments.spec.ts` — Story 4.3 (variant comparison endpoint/page): 400 for a missing
  `metricEvent` query param, an honest empty state (200, not 404) for an experiment with no
  exposures yet, and real exposure + conversion events across two variants produce the expected
  basic-lift math on both the JSON endpoint and the SSR page.

## Running locally

Requires local Supabase running (`supabase start`, from `apps/web/`) and the dev server up
(`npm run dev`). Needs `.env.local` (copy `.env.local.example`, fill in the values `supabase start`
prints) — `npm run test:e2e` loads it automatically via `node --env-file-if-exists`.

## Fixtures

The spec uses the two projects seeded by `supabase/seed.sql` (`project-one` / `project-two`, local
dev + CI only — never real credentials).
