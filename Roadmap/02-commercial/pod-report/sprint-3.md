# Pod Report + Roadmap Hub — Sprint 3: Share links + backfill (the flip)

**Status:** 🔨 in progress (2026-07-26). Depends on Sprint 2.5 (the report surface) landing first —
there is nothing to share until the Pod Report renders.

## Design decisions recorded at build time (2026-07-26)

### Share tokens are `api_keys` rows, and the scope filter lives in the DATABASE
The epic's Platform-primitives note says share links "join E2's `api_keys` credential taxonomy as
scoped revocable rows — one taxonomy, not a third system." Built literally: migration
`20260803100000` adds `scope` (`ingest` | `share`), `share_lens` and `expires_at` to `api_keys`.
Revocation reuses `revokeApiKey` — already project-scoped, already audited, already on the
dashboard's key screen. A `report_shares` table would have duplicated the whole lifecycle, and the
duplicate is the one that gets forgotten when a leaked link needs killing.

**The risk that buys, and how it is paid for.** One table means a share token and an ingest key
share one `key_hash` namespace — and a share token travels in a URL: browser history, `Referer`
headers, a screenshot in a chat thread. An ingest key never does. If the ingest lookup ever stopped
filtering by scope (a refactor, a badly-resolved merge), every share link ever pasted anywhere would
become a **write credential** for that tenant.

A `.eq('scope','ingest')` in `lib/auth.ts` was judged not good enough for that blast radius, because
it is a line someone can delete. So the filter moved into the database object the hot path queries:
`active_ingest_keys` is a view with `scope = 'ingest' AND revoked_at IS NULL AND not expired` baked
into its definition, joined to `projects`, granted to `service_role` only. `lib/auth.ts` selects
from the view. **There is no filter in application code to drop.** Same discipline as the write-cap
and evidence-pointer guards elsewhere in this epic: make the failure unrepresentable rather than
merely fixed.

**Rollout order followed** (AGENTS rule #4 / LEARNINGS): migration applied to production **first**,
verified that the view returns all 5 active keys and drops exactly the 3 revoked ones and **zero**
active ones, *then* the code that reads it ships.

### One hash, not two that agree
Both credential kinds land in the same `UNIQUE` column, so they must hash identically. The first
attempt was a test asserting the two hashers agreed — which could not run at all, because
`lib/api-keys.ts` imports `server-only` (LEARNINGS: a pure helper cannot share a file with a
runtime-only import). The obstacle produced the better design: both now delegate to
`lib/credential-hash.ts`, so there is no second implementation to drift and nothing to assert.

## Stories

### Story 3.1 — Scoped share links (dark)
**As** Daniel, **I want** share links with per-audience lenses — *team* (everything) · *client*
(their pod's journey + their Pod Report, never other tenants' data) · *investor* (portfolio
horizon + momentum, no per-story internals) — as opaque revocable tokens in the path (E1 connector
pattern; one credential taxonomy with E2's `api_keys` scoped rows), behind a
`REPORT_SHARES_ENABLED` env gate that **ships dark/OFF**, **so that** externals glance at a link,
never an account.
**Acceptance:** each lens returns only its scope — spec'd with a **real** foreign tenant/token
(S4 lesson); revoked token → 401 immediately; gate OFF → share routes 404; scope enforced
server-side (lens comes from the token, never the URL).
**Risk:** HIGH — Daniel merges (public read of internal data + credential surface)

### Story 3.2 — Landing §5 backfill + hub dogfood
**As the** landing, **I want** §5 (Pods & proof) flipped teaser → live Pod Report section via E1's
section↔epic registry (backfill contract), and the hub instrumented **by the engine itself** (view
events per lens tracked as engine events), **so that** we sell what we use.
**Acceptance:** §5 renders real report output (synthetic/demo-safe — no client data on the public
page, ever); hub views appear in gb's own funnel.
**Risk:** LOW (public content via registry, gated)

### Story 3.3 — Launch
**As** Daniel, **I want** the launch: flip `REPORT_SHARES_ENABLED` in production, mint the first
real investor + client links, verify revocation kills a link, announce, **so that** the roadmap is
something we *show*, live.
**Acceptance:** flip recorded (env + date); one real external audience viewed a live link; a
revoke-confirm-dead cycle executed and noted.
**Risk:** HIGH — Daniel flips/merges

## Sprint QA
- **api spec(s):** 3.1 → lens-scope assertions (investor lens must NOT return story internals;
  client lens must NOT return foreign-tenant data) + revoked-401 + gate-OFF-404 · 3.2 → §5 renders
  registry-driven content in both gate states
- **browser smoke owed:** yes, to Daniel — fresh incognito session: open each lens → revoke →
  confirm dead; plus the production flip
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 3 — Smoke walkthrough (do these in order)
_Write the fool-proof numbered walkthrough here at sprint close (real URLs). Owed per Stage 8b:
each-lens open → revoke → dead, in a fresh incognito session; the production flip._
