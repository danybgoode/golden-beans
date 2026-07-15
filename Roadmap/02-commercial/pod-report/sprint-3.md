# Pod Report + Roadmap Hub — Sprint 3: Share links + backfill (the flip)

**Status:** ⬜ not started

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
