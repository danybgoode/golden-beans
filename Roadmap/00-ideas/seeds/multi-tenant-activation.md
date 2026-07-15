---
title: "E2 — Multi-tenant activation: auth hardening, self-serve tenants, pod trials"
slug: multi-tenant-activation
status: raw
area: "02"
type: feature
priority: "#2"
risk: high
epic: null
build_order: "#2"
updated: 2026-07-14
---

# Seed — E2 Multi-tenant activation

From SCOPE.md's follow-on table. Auth hardening · hand-provisioned → self-serve tenants · pod
trials ("integrate this pod, give it to your PM"). The S1 tenant-scoped schema means no migration —
this epic is credentials, signup, isolation-hardening, and the E1 waitlist converting to real
signups (landing hero CTA flips per the backfill contract). **Revisit triggers due here:** deploy
rail (Vercel vs Cloud Run at scale) + Postgres ingest write-ceiling (ClickHouse question) — both
recorded in SCOPE.md panel adjudication #5. Depends: E1. Groom when it reaches the front.
