---
epic: think-skills
sprint: 3
title: "The metric reaches the engine"
risk: high
phase: Shipped
stories_total: 1
stories:
  - id: S3.1
    title: "`gf north-star set`"
    as_a: "the product owner"
    i_want: "to send the workshop's metric and inputs to my project with one command, after seeing what changes"
    so_that: "the engine measures what we agreed, without retyping it"
    risk: high
    status: done
---
# Think skills — PMF Narrative, North Star and Risk Validation ship in the plugin and write files groom reads — Sprint 3: The metric reaches the engine

**Status:** ✅ Shipped — #216 (`fbce291`), deployed to production 2026-10-01; plugin + kit **0.19.0** released; CLI **0.3.0** built, npm publish owed to Daniel

## Stories

### Story 3.1 — `gf north-star set` ✅
**As** the product owner, **I want** to send the workshop's metric and inputs to my project with one command, after seeing what changes, **so that** the engine measures what we agreed, without retyping it.
**Acceptance:** `gf north-star set <file>` reads the sync block from the file; by default prints the current North Star (`GET /api/v1/north-star`) against the proposed one and sends nothing; `--yes` posts to `POST /api/v1/north-star/sync` exactly once and prints the result; a 400 prints the route's `issues`; the exit code comes from the body (`ok: false` is non-zero). Uses the existing `gf auth` key. `cli-write.test.ts` covers dry run (no request), `--yes` (one request), 400 and auth failure, each observed failing first. The North Star skill names the command.
**Risk:** high

**Amended 2026-09-30 (architecture lock, C1):** the command can't use "the existing `gf auth` key" against
`POST /api/v1/north-star/sync`, because that route accepts only a project ingest key. It calls a new
`/api/v1/cli/north-star` route instead (GET for members, POST for owners), which shares the sync logic with the
existing route. The product owner chose this over a project-key flag and over cutting S3. The rest of the acceptance
stands.

## Build contract (locked by the architect before the builder started)

Cites the epic README's C1, C2, C7, D6, D10 and D11. Nothing here restates a rule that lives there.

1. **Extract first, behaviour unchanged:** `apps/web/lib/north-star-sync.ts` takes the existing GET's read and the
   sync route's upsert. Both existing routes keep byte-identical responses, and `e2e/north-star-sync.spec.ts` passes
   with **no edit**.
2. **The route (D6):** `apps/web/app/api/v1/cli/north-star/route.ts`, with GET behind `requireCliMember` and POST
   behind `requireCliOwner`, inside the `CLI_WRITE_API_ENABLED` gate. `e2e/cli-north-star.spec.ts` covers: gate off
   gives 404 before auth; a bad token gives 401; a non-member gives 404; a member can GET but gets 404 on POST as a
   non-owner, the way `requireCliOwner` answers; an owner's POST syncs and the old route's GET sees it; a 400 carries
   `issues`; and a project can't be crossed (owner of A, `project: B`, gives 404). The security lens is triggered. **Deviation, said out loud (the build):** the e2e server always runs with
   `CLI_WRITE_API_ENABLED` ON (it's born ON, and `cli-api.spec.ts` pins that), so "gate off gives 404" can't be an e2e case.
   The route enters only through `requireCliMember` / `requireCliOwner`, whose gate-first order belongs to the shared
   `lib/cli-auth.ts` seam, not to this route.
   **Widened, said out loud (review #216, Codex Blocking):** the route parsed its body before the gate, so with the gate
   OFF a malformed body answered 400, not 404. `cli/flags/write` and `cli/keys` had the same order. All three now read
   their body through `readCliBody` in `lib/cli-auth.ts`, which gates first, and `lib/cli-body-order.test.ts` pins that
   no CLI route reads a body itself.
3. **The command (D6):** `packages/cli/src/commands/north-star.ts`, registered in `commands/index.ts`, with the
   `--help` golden regenerated. `cli-write.test.ts` covers five cases, each seen failing once: a dry run sends no POST
   (exactly one GET); `--yes` sends exactly one POST; a 400 renders `issues` with a non-zero exit; auth failure gives
   exit 2; and a file with zero or two JSON fences gives exit 1 with no request. The C2 lines (`new`, `updated`,
   `moved from`, "adds, never replaces") are pinned too. **Added 2026-09-30 (S1 review, Codex #2):** the template's
   `<…>` placeholders pass the schema (`min(1)`), so a payload the coach never filled in would sync as written. Any
   string value matching `^<.*>$` is reported as unfilled in the dry run, and `--yes` refuses it with exit 1 and no
   request. This is a template check, not schema validation, so the thin-shell rule still holds.
4. **The skill names the command (D10):** `north-star`'s ending gives
   `npx -y @golden-frijoles/cli@0.3.0 north-star set Roadmap/00-strategy/north-star.md`, dry run first. The CLI
   moves to 0.3.0, and plugin and kit to 0.19.0.
5. **Owed (D11):** the npm publish and the live `--yes`, both the product owner's.

## Sprint QA
- `cli.test.ts` / `cli-write.test.ts` against a mocked API.
- One live run against Golden Frijoles' own project (owed to Daniel: HIGH, Daniel merges).
- Money/auth path: the command writes production data through the CLI route (owner-only, behind `CLI_WRITE_API_ENABLED`; C1); owed to Daniel by name.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)

1. Run `gf north-star set Roadmap/00-strategy/north-star.md`
   → it prints the current North Star next to the proposed one and says nothing was sent.
2. Run it again with `--yes` (auth/production-write step, owed to Daniel)
   → it prints `ok` and the number of inputs synced.
3. Open https://goldenfrijoles.com/app signed in to that project
   → the North Star surface shows the new metric and its inputs.

If any step fails, note the step number + what you saw — that's the bug report.

### Smoke results (2026-10-01, production @ `fbce291`)

- ✅ **The route is live and gated:** `GET https://goldenfrijoles.com/api/v1/cli/north-star?project=golden-beans` with no
  credential gives 401 `unauthorized`, and so does POST. A malformed body gives 400 (the gate is ON), and the old
  `GET /api/v1/north-star` still gives its own 401.
1. ✅ **Dry run, end to end against production:** the CLI built from `main` (`0.3.0`, `node packages/cli/dist/bin.js
   north-star set <file> --project golden-beans`) authenticated with the stored `gf` login. It printed the metric as
   `new` with two `new` inputs, and *Dry run: nothing was sent.* A prod query afterwards found **0** rows for
   `golden-beans` and for the smoke keys, so nothing was written.
2. ⬜ **Owed to Daniel (auth/production write, D11):** `npm publish` of `@golden-frijoles/cli@0.3.0`, then `npx
   @golden-frijoles/cli north-star set Roadmap/00-strategy/north-star.md --yes` with the real North Star from the coach.
   Note that `gf` is aliased to `git fetch` on his machine (C7).
3. ⬜ **Owed to Daniel:** open https://goldenfrijoles.com/app signed in to `golden-beans` and check that the North Star
   surface shows it.
