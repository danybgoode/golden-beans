<!-- Keep this short. The risk tier decides who may merge (Roadmap/WAYS-OF-WORKING.md § Review & merge).
     Ported from miyagi-product-management 2026-07-24, adapted to golden-beans' Sprint QA convention
     and the externally-routed review rail (Agy baseline / Devin on high-risk / Cursor tie-breaker). -->

## Summary
<!-- What changed and why, in plain language. Name the story IDs (1.1, 2.3…) and link the sprint doc. -->

## Risk tier
<!-- LOW  → the reviewer/agent may merge on green CI once the cross-agent review is clean.
     HIGH → Daniel merges. Anything touching money, auth, DB migrations, tenancy, concurrency or
            shared infra. When unsure, treat as HIGH. -->
- [ ] **LOW**
- [ ] **HIGH**

## Deterministic gate
<!-- Non-negotiable — nothing merges on a red gate. Tick what actually ran, don't tick what you assume. -->
- [ ] `npm run lint` + `npm run format:check`
- [ ] `npx tsc --noEmit -p apps/web`
- [ ] `npm run build`
- [ ] `npm run test:unit` (fast pure-logic layer)
- [ ] `npm run test:e2e` (Playwright `api` project vs local Supabase)

## Sprint QA
<!-- Per the sprint doc's own "Sprint QA" block: which spec covers which story, and the case count.
     Then the honest gap statement — a browser/session/credential-gated smoke owed to Daniel is
     stated by name here, never glossed. -->
- **Specs added, by story:**
- **Mutation check** — every new spec observed RED at least once, by mutating the *exact* line it
  claims to defend (Roadmap/LEARNINGS.md: a spec can be unreachable-by-construction and still pass):
- **Smoke run / owed to Daniel:**

## Cross-agent review — required on every non-trivial PR
<!-- The builder does not approve its own diff. Runs LOCALLY (a runner has no agy/devin auth), so
     nothing enforces this but you — an unrun cross-review is a blocked merge. Re-run the finder
     after a substantive fix; re-run the other tool only if the fix crosses its boundary. -->
`node scripts/cross-review.mjs <PR#> --agent antigravity`
- [ ] **Agy** (baseline, every PR) — findings + resolution:
- [ ] **Devin** (HIGH risk only: migrations, tenancy, auth, concurrency, shared infra) — findings:
- [ ] **Cursor** (specialist/tie-breaker: SQL, boundary contracts, disagreement) — n/a unless used:

## Kill-switch
<!-- If the epic was groomed with one (groom Stage 6b): name the flag and confirm its polarity —
     enablement gate ⇒ default false / born OFF; kill-switch ⇒ default true / born ON. -->

## Migrations
<!-- Supabase migrations are a SEPARATE step from the Vercel deploy (AGENTS.md rule #4). If this PR
     adds one, state the rollout order: env vars → migration → merge. Getting it backwards is an
     outage, not a hiccup. -->
- [ ] No migration in this PR
- [ ] Migration included — rollout order stated above and `supabase db push` owed at merge
