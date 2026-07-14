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

## Running locally

Requires local Supabase running (`supabase start`, from `apps/web/`) and the dev server up
(`npm run dev`). Needs `.env.local` (copy `.env.local.example`, fill in the values `supabase start`
prints) — `npm run test:e2e` loads it automatically via `node --env-file-if-exists`.

## Fixtures

The spec uses the two projects seeded by `supabase/seed.sql` (`project-one` / `project-two`, local
dev + CI only — never real credentials).
