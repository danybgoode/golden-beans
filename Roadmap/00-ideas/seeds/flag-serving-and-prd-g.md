---
title: "E5 — a) Flag-serving migration · b) PRD-G chaos/SecOps + circuit breakers"
slug: flag-serving-and-prd-g
status: raw
area: "01"
type: feature
priority: "#5"
risk: high
epic: null
build_order: "#5"
updated: 2026-07-14
---

# Seed — E5a flag serving · E5b PRD-G (chaos + SecOps)

Two-stage epic, strictly ordered **a → b** (SCOPE.md Addendum): the flag-serving gateway + Miyagi
`isEnabled()` migration first (F3 circuit breakers are its strongest motivation), then PRD-G
Modules E+F (chaos scenarios, blast radius via S4 targeting rules, business post-mortems, attack
simulations, friction reporting, circuit breakers). PRD: `references/prd-g-chaos-secops.md`.
**Risk callouts recorded in SCOPE.md stand:** money-path flag mutation is backend-owned behind an
explicit allow-list (never a generic engine write); Clerk ToS + staging-vs-prod blast-radius policy
before any attack simulation; client-side SDK injection first. Landing section 6 rows flip here.
Depends: S4 (shipped) + E5a before E5b. Groom as its own session when at front — genuinely HIGH.
