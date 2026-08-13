# Wave 2026-08-13 — scenarios become PM-operable

The product owner explicitly started `scenarios-pm-operable` as one orchestrated epic build. This is
the next boundary anticipated by `wave-2026-08-08.md`, which named Scenarios as the front-of-queue
candidate once the previous M bet landed.

| Bet | Appetite | Displaced (the opportunity cost) |
|---|---|---|
| **#16 Scenarios made PM-operable** — define, launch and stop a bounded scenario from the signed-in UI, then read its impact honestly | **M** (one architect run with three review boundaries) | The CMS-neutral experiment integration spike remains parked; the Git & Releases discovery spike also stays unfunded while the product closes its already-built chaos/secops capability gap |

**Decisions of record.**

- The bet is underwritten by the product owner's 2026-08-13 build instruction; the seed and epic
  frontmatter point here.
- The generated epic kickoff remains the build contract. Its architecture lock immediately found an
  auth/DB fork in the scaffolded premise; that fork is recorded as Amendment 1 in the epic README and
  must be answered before command-path code starts.
- #14's charting decision is still open. D7's already-approved comparison-table fallback keeps this
  bet from choosing a dependency under delivery pressure.
- The M circuit breaker remains active. If the owner-session facade cannot share the existing
  transaction logic, stop and re-shape rather than duplicate a scenario control plane.

**Why this was worth the wave.** The capability already has live definitions, stopped runs, impact
evidence and breaker trips, but the PM sees only six read-only tables. This closes the gap between the
product's sharpest differentiator and the person the product says can operate it.
