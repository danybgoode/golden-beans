# Pod Report + Roadmap Hub — Sprint 1: The rendering primitive + hub skateboard (internal)

**Status:** ✅ SHIPPED 2026-07-25 — PR [#30](https://github.com/danybgoode/golden-beans/pull/30)
squash `bea1728`. Migration `20260802100000` applied to production **before** the merge (the
mandatory order when code reads a new table); production deploy `success`; API-level prod smoke
green. Two independent review seats (Agy + Devin) came back with **zero findings**.
**Owed to Daniel:** the `SELF_PROJECT_API_KEY` repo secret (see Story 1.1) and the browser read of
the three hub views.

## Stories

### Story 1.1 — Report artifacts + the roadmap-push rail
**As a** tenant, **I want** to push my roadmap projection (extract-schema JSON via my API key) and
have it stored as a **versioned, immutable report artifact**, **so that** the engine renders from
data I control. Ships: additive `report_artifacts` migration (tenant-scoped, versioned, immutable;
RLS-on/no-policies pattern), `roadmap-push` command (POSTs `scripts/roadmap-to-notion.mjs
--extract` output — that JSON is the contract, version field validated on ingest), CI step pushing
gb's own roadmap on merge to `main`.
**Acceptance:** push → new queryable version; malformed/wrong-version payload → 4xx; a real
foreign API key cannot read it (S4 realistic-input lesson).
**Risk:** LOW
**Built:** ✅ `73391c9` — `report_artifacts` (one table, `kind`-discriminated, immutable +
per-tenant versioned), `POST /api/v1/roadmap/push`, `scripts/roadmap-push.mjs`, and the
`roadmap-push.yml` workflow. 8 api cases + 21 unit cases.
- **Version allocation is an RPC under a transaction-scoped advisory lock**, not a route-level
  read-then-insert (two pushes reading `max(version)=N` is the classic lost update).
- **The write cap measures exactly what the read path returns** — `getLatestArtifact` returns
  `payload` and nothing derived, so write-accept ⟹ read-accept holds *by construction* rather than
  by two numbers agreeing (the E6 S3 trap).
- **Mutation-verified, both security specs:** dropping the explicit `REVOKE UPDATE, DELETE` +
  immutability trigger fails the append-only spec; removing the advisory lock fails the concurrency
  spec. Both restored and green.
- **⚠️ Owed to Daniel (named credential action):** `roadmap-push.yml` is DORMANT until
  `SELF_PROJECT_API_KEY` exists as a repo secret. It skips cleanly (green, inert) until then.

### Story 1.2 — Journey + epic drill-down views (gb as tenant #0)
**As a** team member, **I want** the hub's **journey view** (the build order as a path, a "you are
here" marker, shipped behind / next ahead) and **epic drill-down** (sprints + stories, ✅ ticks,
risk tiers) rendering gb's latest pushed artifact with a **freshness stamp** ("as of merge
`abc123`, 2h ago" — a design element, not fine print), **so that** "where are we" is a page, not a
doc dive.
**Acceptance:** views render the latest artifact; stamp shows source commit + age; content matches
BUILD-ORDER.md; design language = `references/design-direction.md` (roastery world, agent-window
frame device).
**Risk:** LOW

### Story 1.3 — Horizon view (progress against the desired end-state)
**As a** stakeholder, **I want** the **horizon view** — end-state destinations (generalized from
the landing section↔epic registry) as cards, each showing what's lit ✅ vs coming 🔜 and the epic
that lights it, funnel seeds rendered as deliberately-hazy "on the horizon", **so that** progress
reads against the destination, never as a backlog.
**Acceptance:** every destination shows its lighting epic + honest badge; nothing claims ✅ for
unshipped work (poster rule); seeds render hazy (un-groomed ≠ promised).
**Risk:** LOW

## Sprint QA
- **api spec(s):** 1.1 → push validation (4xx) + foreign-key 403 + version immutability · 1.2/1.3 →
  views render latest artifact; freshness stamp present
- **browser smoke owed:** no (anonymous/internal render checks; browser spec optional)
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 1 — Smoke walkthrough (do these in order)

Environment: production — `https://golden-beans-gamma.vercel.app`. Steps 1–4 are already run and
green (API-level, by the agent); steps 5–7 are **owed to Daniel** because they need a browser and a
repo secret.

1. `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://golden-beans-gamma.vercel.app/api/v1/roadmap/push -H 'Content-Type: application/json' -d '{}'`
   → **401.** The rail is live and fails closed. *(401 rather than 404 is the load-bearing part: it
   proves the route exists and resolves, so a missing table would look different from a missing
   route — the multi-tenant-activation rollout check, reused.)*
2. Repeat with `-H 'Authorization: Bearer definitely-not-a-real-key'`
   → **401.** An invalid credential is rejected the same way as none.
3. Open `https://golden-beans-gamma.vercel.app/hub/golden-beans-demo`
   → **200**, showing "No roadmap pushed yet / empty hopper" and the `roadmap-push.mjs` command.
   That is the deliberate empty state, not a broken page — no artifact has been pushed to
   production yet, and the page says so and tells you how to fix it.
4. Open `https://golden-beans-gamma.vercel.app/hub/some-foreign-tenant`
   → **307 to /login**, never 200. Tenant isolation holds on the live surface.
5. **Owed — Daniel:** add `SELF_PROJECT_API_KEY` as a repo secret (Settings → Secrets → Actions).
   → The `Push roadmap artifact` workflow stops skipping. Until then it is green-and-inert by
   design.
6. **Owed — Daniel:** merge anything to `main`, then wait for the production deploy to finish.
   → The workflow pushes golden-beans' own roadmap, and
   `https://golden-beans-gamma.vercel.app/hub/golden-beans-demo` flips from the empty state to the
   journey view: shipped epics behind, a 📍 "you are here" marker on the first unshipped epic, and
   a freshness stamp reading "as of merge `<sha>`, just now". Content should match
   `Roadmap/00-ideas/BUILD-ORDER.md`.
7. **Owed — Daniel (a judgement call no spec can make):** open `/hub/golden-beans-demo/horizon` and
   read it cold. Does it read as *"here is the destination and how much of it is lit"*, or as a
   backlog with status badges? If it reads as a backlog, the view has failed its purpose even
   though every test passes — that disagreement is the acceptance test, same shape as Sprint 2's
   maturity-lens read.

**Money/auth path:** none. **Migration:** `20260802100000_report_artifacts.sql`, already applied.
