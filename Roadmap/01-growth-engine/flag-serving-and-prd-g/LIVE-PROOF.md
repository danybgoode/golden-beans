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

## 2026-08-01 — re-entry audit and exact handoff

No missing feature branch was found: the implementation commits are already merged. Golden production
is on commit `6118402`; the linked Supabase migration ledger matches all Sprint 3 migrations. Local
re-verification passed typecheck, lint, 834 unit tests, the 8-case dark-gate API suite, 429 enabled
API tests (31 deliberate skips), and the production build.

Safe public-boundary probes establish the current execution-gate state without reading tenant data or
running a scenario:

| Boundary | Observed response | Meaning |
|---|---:|---|
| `GET /api/v1/flags/snapshot` without a credential | `401` | flag serving ON |
| `GET /api/v1/scenarios/snapshot` without a credential | `401` | resilience scenarios ON |
| `POST /api/v1/scenarios/security` with an empty body | `400` | security simulations ON |
| `POST /api/v1/breakers/automatic` with an empty body | `400` | automatic breakers ON |

The three proof-only gates must not remain ON after the exercise. Their current state is recorded as an
open operational risk, not as completed acceptance.

The remaining authorized sequence is deliberately narrow:

1. Read the prepared run records and their real owner/actor through the scoped admin seam.
2. Start the short-TTL internal resilience run and exercise only `miyagi.internal.probe`; capture the
   control/fault technical delta and canonical product-impact state.
3. Run the prepared closed defensive simulation against the same verified target under its stored caps;
   capture the expected validation/rate/auth guard result.
4. Record one staged manual breaker decision and one automatic trip on the disposable safe test flag;
   verify neither path reenables it.
5. Stop/expire both runs, revoke disposable proof credentials/fixtures, and verify the normal Miyagi path.
6. Set `RESILIENCE_SCENARIOS_ENABLED`, `SECURITY_SIMULATIONS_ENABLED`, and
   `AUTOMATIC_CIRCUIT_BREAKERS_ENABLED` OFF in Production, then merge a Git-tracked cleanup commit so the
   new deployment snapshots those values. Re-probe all three routes for flat `404`.

This sequence performs production mutations and reads scoped credentials. It requires Daniel's explicit
authorization naming the proof runs, breaker transitions, credential access and Production gate changes;
the broad instruction to wrap the epic is not used as substitute authority. The signed-in owner UI smoke
also remains pending because no production Clerk browser session was connected during this audit.
