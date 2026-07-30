# Production-infrastructure proof

## 2026-07-29 — activation record

Scope is pre-launch and internal/synthetic only. External cohorts remain unapproved and OFF.

- Golden production target: `miyagi.internal.probe` at `https://miyagisanchez.com`
- target ownership: signed challenge verified
- resilience run: `187c663c-74da-4000-b31c-a5a20b58be94`
- defensive-security run: `8324a5d2-1ff2-4aef-808d-4a32ceb369c1`
- both runs were prepared while root execution gates were OFF
- a resilience start attempt returned the expected flat `404`
- `RESILIENCE_SCENARIOS_ENABLED`, `SECURITY_SIMULATIONS_ENABLED`, and
  `AUTOMATIC_CIRCUIT_BREAKERS_ENABLED` were then set for Production

This commit is the required Git-tracked deployment that makes those Vercel environment values
available to running functions. It is not a manual Vercel deployment. The completed run evidence,
breaker transitions, stop/revoke cleanup, and gate-disable deployment are appended before epic
close.
