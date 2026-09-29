---
epic: think-skills
sprint: 3
title: "The metric reaches the engine"
risk: high
phase: Shaping
stories_total: 1
stories:
  - id: S3.1
    title: "`gf north-star set`"
    as_a: "the product owner"
    i_want: "to send the workshop's metric and inputs to my project with one command, after seeing what changes"
    so_that: "the engine measures what we agreed, without retyping it"
    risk: high
    status: planned
---
# Think skills — PMF Narrative, North Star and Risk Validation ship in the plugin and write files groom reads — Sprint 3: The metric reaches the engine

**Status:** ⬜ not started

## Stories

### Story 3.1 — `gf north-star set`
**As** the product owner, **I want** to send the workshop's metric and inputs to my project with one command, after seeing what changes, **so that** the engine measures what we agreed, without retyping it.
**Acceptance:** `gf north-star set <file>` reads the sync block from the file; by default prints the current North Star (`GET /api/v1/north-star`) against the proposed one and sends nothing; `--yes` posts to `POST /api/v1/north-star/sync` exactly once and prints the result; a 400 prints the route's `issues`; the exit code comes from the body (`ok: false` is non-zero). Uses the existing `gf auth` key. `cli-write.test.ts` covers dry run (no request), `--yes` (one request), 400 and auth failure, each observed failing first. The North Star skill names the command.
**Risk:** high

## Sprint QA
- `cli.test.ts` / `cli-write.test.ts` against a mocked API.
- One live run against Golden Frijoles' own project (owed to Daniel: HIGH, Daniel merges).
- Money/auth path: the command writes production data behind the project key; owed to Daniel by name.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)

1. Run `gf north-star set Roadmap/00-strategy/north-star.md`
   → it prints the current North Star next to the proposed one and says nothing was sent.
2. Run it again with `--yes` (auth/production-write step, owed to Daniel)
   → it prints `ok` and the number of inputs synced.
3. Open https://goldenfrijoles.com/app signed in to that project
   → the North Star surface shows the new metric and its inputs.

If any step fails, note the step number + what you saw — that's the bug report.
