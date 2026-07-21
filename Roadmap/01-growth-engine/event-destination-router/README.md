---
status: in-progress   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: event-destination-router
---

# Epic: Event destination router — reliable fan-out to CRM and downstream tools

> **Area:** 01-growth-engine · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/event-destination-router.md`](../../00-ideas/seeds/event-destination-router.md)

## Why

Golden Beans already receives and analyzes one tenant-scoped event stream, but every downstream use still
has to pull from that store or add its own integration. This epic makes the stream operational: each accepted
event can be delivered reliably to configured destinations without slowing or coupling ingest to a vendor.
Miyagi's founding-merchant CRM is the first real proof; an optional Attio mirror proves the CRM adapter seam
without making an external free tier the source of truth.

## Platform-primitives note

Golden Beans remains the canonical event/delivery system, not a merchant CRM. The existing `events` row is
written once; an additive transactional outbox creates recoverable delivery work. Delivery is **at least once**,
so stable event ids and consumer idempotency are contractual. Project identity and credentials reuse the
multi-tenant activation epic. No Pub/Sub/Kafka rail is introduced until measured traffic reaches the existing
scale tripwire.

## Decisions locked at scope approval

1. **Provider-neutral first:** signed HTTP webhook is the first sink; Attio is an adapter after that seam works.
2. **Transactional outbox on Supabase:** event + eligible delivery work commit atomically; destination health is
   never on the `/track` response path.
3. **Additive subject context:** old `userId` callers remain valid; actor, subject, correlation, occurred-at and
   idempotency fields are optional and versioned.
4. **Miyagi owns merchant workflow:** Golden Beans delivers lifecycle facts; Miyagi materializes relationship
   state and Medusa remains commerce truth.
5. **No planning panel:** Daniel approved the recommended architecture directly on 2026-07-20.

## What already exists (reuse, don't rebuild)

| Capability | Existing seam | Reuse |
|---|---|---|
| Tenant-scoped ingest | `apps/web/app/api/v1/track/route.ts` + `apps/web/lib/auth.ts` | Persist the canonical event once |
| Open event envelope | `apps/web/lib/track-schema.ts` | Add versioned subject/correlation fields compatibly |
| TypeScript SDK | `packages/sdk/src/index.ts` | Extend `track()` without breaking callers |
| Canonical event table | `apps/web/supabase/migrations/20260713220000_track_events.sql` | Add outbox/delivery tables, not a second ingest |
| Tenant/key lifecycle | `02-commercial/multi-tenant-activation` | Project membership, scoped credentials and `/app` boundary |
| DB-backed guards | `apps/web/lib/rate-limit.ts` | Serverless-safe bounded writes |
| TARS/North Star/A/B | shipped Growth Engine v1 | Continue reading canonical events independent of sink health |
| MCP connector | `02-commercial/commercial-shell` | Read delivery health through the existing connector taxonomy later |

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Versioned actor/subject event contract | high |
| 1 | 1.2 Transactional outbox + delivery enablement gate | high |
| 2 | 2.1 Tenant destination lifecycle + signed webhook | high |
| 2 | 2.2 Bounded retry, terminal failure, history and replay | high |
| 3 | 3.1 Miyagi merchant-lifecycle projection proof | high |
| 3 | 3.2 Optional Attio adapter proof | high |
| 3 | 3.3 Delivery operating view + landing backfill | low |

## Kill-switch

`DESTINATION_DELIVERY_ENABLED` is an **enablement** gate, born **OFF** in preview and production. It gates
only the dispatcher; ingest and outbox persistence remain active so disabling delivery loses no events.
Per-destination disable/revocation is the fine-grained kill. Additive migrations use expand/contract and do not
sit behind the runtime gate.

## Deploy order

`multi-tenant-activation` must provide membership and credential lifecycle first. Then ship Sprint 1 with
delivery OFF, Sprint 2 against a disposable receiver, and Sprint 3 against a disposable Miyagi merchant before
enabling production delivery. Golden Beans deploys through its Vercel Git integration; the Miyagi projection
contract lands in a separate Miyagi PR and must degrade safely until both sides serve compatible versions.

## Definition of Done (epic)

- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough with deployed URLs and disposable credentials/data
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Landing public-offer section reflects the shipped destination primitive honestly
- [ ] Team memory updated if the project keeps one
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] `DESTINATION_DELIVERY_ENABLED` exists with enablement polarity, born OFF; production flip and per-sink disable verified
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** and `node scripts/build-order.mjs` run
