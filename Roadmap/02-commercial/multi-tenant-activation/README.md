---
status: in-progress   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: multi-tenant-activation
---

# Epic: Multi-tenant activation — auth hardening, self-serve tenants, pod trials

> **Area:** 02-commercial · **Risk:** high · **Scope seed:** [`00-ideas/seeds/multi-tenant-activation.md`](../../00-ideas/seeds/multi-tenant-activation.md)

## Why
The engine is multi-tenant by design but single-tenant in practice: dashboards are anonymous
(anyone who guesses a project slug reads any tenant's data), credentials are one unrotatable key
per project, and new tenants exist only if Daniel provisions them by hand. This epic closes the
auth hole, makes credentials a lifecycle (issue/rotate/revoke), and turns signup into instant
tenant activation — then flips the landing hero (§1) and pricing/tenancy (§7) from waitlist to a
real signup CTA in the same epic, per the backfill contract. Success includes a dogfooded
signup→activated funnel rendered by the engine itself.

## Platform-primitives note (the Medusa-first slot, gb edition)
The tenancy substrate already exists — S1's `projects` + hashed-key resolver + tenant-scoped
`events` (Decision 8: no query path can cross projects). **No tenancy migration.** New primitives
are additive only: Supabase Auth users, `project_members`, `api_keys` (many revocable keys per
project — connector tokens and SDK keys become one taxonomy), quotas + audit rows. Same RLS-on/
no-policies service-role pattern as every existing table.

## Decisions locked (Daniel, 2026-07-15)
1. **Supabase Auth** (same Supabase project; no new vendor; users stay in our DB).
2. **Instant tenant + credentials on confirmed signup**, guardrailed; **no payment rail in E2**.
3. **Scale debt adjudicated: stay Vercel + Supabase Postgres** with named tripwires (see seed —
   ~5M events/mo or $50/mo functions → Cloud Run ingest; agg p95 >2s / ~50M rows → ClickHouse).
4. **E2 stays #2**; no E1↔E3 swap.

## What already exists (reuse, don't rebuild)
- `apps/web/lib/auth.ts` + `20260713220000_track_events.sql` — hashed-key tenant resolution; extend to `api_keys` rows, don't replace
- RLS service-role pattern (mirrors mb `platform_flags`) — all new tables
- E1 (build pending): waitlist + guards (lift for signup), install page (per-tenant onboarding), section↔epic registry (the §1/§7 flip goes through it), connector tokens (fold into `api_keys`), `CONNECTOR_ENABLED` env-gate precedent
- `packages/sdk` + funnel pages — dogfood the signup→activated funnel
- LEARNINGS → S4 realistic-input lesson — isolation specs use a *real* foreign projectSlug

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | ✅ 1.1 Supabase Auth + `project_members` + authed `/app` shell | **HIGH — Daniel merges** |
| 1 | ✅ 1.2 Dashboards behind per-tenant authorization (slug-guessing dies; demo allow-list survives) | **HIGH — Daniel merges** |
| 1 | ✅ 1.3 `api_keys` lifecycle (issue/label/rotate/revoke; existing hashes migrated in) | **HIGH — Daniel merges** |
| 2 | 2.1 Signup → instant tenant + first key (guardrailed, ships dark behind `SIGNUP_ENABLED`) | **HIGH — Daniel merges** |
| 2 | 2.2 Isolation guardrails (quota · payload caps · per-key rate limit) + credential audit trail | **HIGH — Daniel merges** |
| 2 | 2.3 First-run onboarding (copy MCP URL + ≤5-line SDK snippet with your key) | LOW |
| 3 | 3.1 Landing §1 hero CTA flip + §7 honest tiers (gated on `SIGNUP_ENABLED`) | LOW |
| 3 | 3.2 Waitlist retirement (re-scoped from "waitlist → invite conversion" — the queue is empty; see `sprint-3.md`) | LOW |
| 3 | 3.3 Activation launch: flip the gate, dogfood funnel live, one self-serve pod-trial tenant | **HIGH — Daniel flips/merges** |

## Kill-switch (decided at grooming, Stage 6b)
`SIGNUP_ENABLED` env-gate at the signup route + landing CTA registry — **enablement, ships
dark/OFF**, flipped at 3.3 (gb has no flag service by design; precedent: E1's `CONNECTOR_ENABLED`).
Fine-grained kill: revoking an `api_keys` row / membership cuts a tenant instantly, no deploy.
Carve-out: the auth boundary itself (1.1/1.2) can't sit behind a runtime flag — it *is* the fix;
rollback = revert on `main` (migrations are additive/expand-only).

## Deploy order
Single repo, Vercel rail (per-PR previews). **Builds after E1** (needs waitlist, install page,
section registry, connector tokens); if E1 slips, Sprints 1–2 stand alone and Sprint 3 re-scopes.
Within the epic: 1.1 → 1.2/1.3 → 2.x → 3.x; every signup-facing surface stays dark until 3.3.
Miyagi is untouched except hand-seeded membership rows (its ingest key keeps working through the
1.3 migration — acceptance-checked).

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] **Landing backfill check** (WAYS-OF-WORKING, adopted 2026-07-14): §1 hero + §7 tenancy match shipped reality
- [ ] Team memory updated (if kept)
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch:** `SIGNUP_ENABLED` exists with stated polarity (enablement, born OFF, flipped at 3.3) + key/membership revocation verified. *Verify-only — decided at grooming.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (run `node scripts/build-order.mjs`)
