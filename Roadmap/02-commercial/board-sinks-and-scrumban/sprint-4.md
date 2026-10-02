---
epic: board-sinks-and-scrumban
sprint: 4
title: "Areas and the workspace board"
risk: high
phase: Shipped
stories_total: 2
stories:
  - id: S4.1
    title: "The Roadmap tab shows areas on a horizon"
    as_a: "the product owner or a stakeholder"
    i_want: "the Roadmap tab to show functional areas as rows and Shipped · Now · Next · Later as columns, each row in build order"
    so_that: "the high-level view answers \"where is each area heading\" with both seeds and scaffolded work"
    risk: low
    status: done
  - id: S4.2
    title: "One board across a workspace"
    as_a: "a person with several products"
    i_want: "`/hub/w/<workspace>/board` showing initiatives from every project in that workspace I belong to, with a project filter"
    so_that: "I see all my work in one place"
    risk: high
    status: done
---
# One stage, every client: a six-stage board on the Hub, the CLI mod and every sink — Sprint 4: Areas and the workspace board

**Status:** ✅ Shipped — #228 (`da0828c`), deployed 2026-10-02

## Build contract (locked by the architect before the builder started — README § Architecture lock)
- **S4.1** — D10, D19: the areas view groups rows by `area` and `stage` (Now = Building + QA, Next = Ready to
  build, Later = To groom + Grooming, Shipped = Shipped); `hub-roadmap-areas` registered per D23; the journey track
  retires.
- **S4.2** — D11, C8, C9: `/hub/w/<workspaceId>/board`. Reads only through `getWorkspaceProjects()` (AGENTS §
  The tenancy invariant; cite it, don't restate it), then each project's latest artifact by id. A workspace the
  viewer is not in, a malformed id, and a `?project=` outside the result all 404. The fresh reviewer and the
  security lens are mandatory.

## Built — what changed against the contract (said out loud)
- **S4.1 — the Roadmap tab is areas × Shipped · Now · Next · Later** (`lib/hub-areas.ts`, pure), held to the approved
  surface `hub-roadmap-areas` (D23; the visual gate measures it and it is in the `STATE-MATCH.json` floor). The journey
  track retires from the tab; its "you are here" is the Board's answer line ("Next to pull: …") and this tab's own
  ("Now: …"). The share page (`/s/<token>`) keeps its journey — a different approved state — so `lib/hub-journey.ts`
  and the track CSS stay. Shipped shows a count and the latest three per area; every name opens its card on the Board.
  **The Hub computes no stage here either (D19).** The first draft placed a pre-stage push from its old `status`; the
  fresh review caught that this contradicted the lock and linked to cards the board could not open. A push without
  stages now gets the board's own empty state ("push again").
- **On a phone the area table STACKS** (each horizon labelled), it does not scroll sideways. Found by the existing
  390px spec: an early `min-width` overrode the house rule that clips `.ds-listhead` to a 1px box under 900px, and
  the absolutely-positioned header escaped the card and widened the page to 744px.
- **S4.2 — `/hub/w/<workspaceId>/board`** (lock C8: workspaces have no slug). Tenancy, per AGENTS § The tenancy
  invariant: session required (a workspace is never public); a malformed id, a workspace the viewer is not in, or a
  `?project=` outside `getWorkspaceProjects()` all 404. The membership 404, the `?project=` 404 and the session
  redirect were each observed red with the guard removed; the UUID check is defence in depth (a malformed id already
  matches no workspace). **Access model A is pinned at the page:** a sibling project in the viewer's OWN workspace,
  with a pushed board, that the viewer is not a member of stays off the chips and cards, and its `?project=` is a 404;
  swapping the helper for "every project in the workspace" turns that spec red. The ONLY
  multi-project read is `getWorkspaceProjects()`; each project's artifact is then read by id. The view is the project
  board's own component (`BoardView`), so the columns and filters are one implementation; a card opens on ITS project's
  board, and its project is the server's slug (by row identity), never a field of the push. **No WIP advice on the
  workspace board:** a limit is one project's `board.wip`, and a column summed across projects has none to measure. An
  empty project list says so in words (no membership, or an unreadable list), never "0 of 0". The approved `hub-workspace-board` surface draws no answer line, so the workspace board has none.
- **"Open a project's board" is a link, not a dialog**, so the route is covered by `hub-board.authed.spec.ts` (which
  measures it with the gate's own functions) rather than by the gate's press-every-head-action loop, which expects a
  modal.
- **The approved surfaces `hub-roadmap-areas` and `hub-workspace-board` are registered** — corrected only for routes
  and the `tabs` line, recorded at the product owner's instruction (D23).

## Stories

### Story 4.1 — The Roadmap tab shows areas on a horizon ✅
**As** the product owner or a stakeholder, **I want** the Roadmap tab to show functional areas as rows and Shipped · Now · Next · Later as columns, each row in build order, **so that** the high-level view answers "where is each area heading" with both seeds and scaffolded work.
**Acceptance:** Matches the approved `hub-roadmap-areas` state; Now = Building + QA, Next = Ready to build, Later = To groom + Grooming; the journey track is retired and its "you are here" lives in the board's answer line; `hub.spec.ts` updated.
**Risk:** low

### Story 4.2 — One board across a workspace ✅
**As** a person with several products, **I want** `/hub/w/<workspace>/board` showing initiatives from every project in that workspace I belong to, with a project filter, **so that** I see all my work in one place.
**Acceptance:** Reads only through `getWorkspaceProjects()` (workspaces epic). A project from another workspace in the filter 404s (api spec). ~~Before the workspaces epic ships, the route renders the `hub-workspace-board-unbuilt` state.~~ Moot: `workspaces` shipped 2026-10-01 (lock C9).
**Risk:** high — tenancy (cross-project read)

## Sprint QA
- **api spec(s):** S4.1 `e2e/hub.spec.ts` areas view; S4.2 cross-workspace 404 + member-only filter spec.
- **browser smoke owed:** yes, to Daniel: the workspace board (auth/tenancy path).
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge (and `skills-ci` for anything under `skills/`).

## Sprint 4 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com

1. Go to https://goldenfrijoles.com/hub/golden-beans-demo **(auth path — owed to Daniel by name)**.
   → Areas as rows; Shipped · Now · Next · Later as columns.
2. Go to https://goldenfrijoles.com/hub/w/9e58bc7d-a0a8-43c9-89a2-c544cab854f2/board (Daniel's products — workspaces have ids, not slugs: C8).
   → Cards from every project in your workspace; a project filter lists only your projects.
3. Edit the URL to the other workspace's id, `01e9568b-f7d5-4d39-b8b5-d05e9c9d09b5`.
   → A 404 page.

If any step fails, note the step number + what you saw — that's the bug report.

### Smoke results (2026-10-02, after the merge of `da0828c`, deploy `success`)
1. ✅ https://goldenfrijoles.com/hub/golden-beans-demo — 3 area rows (01 Growth Engine, 02 Commercial, 09 Platform Infra), Shipped · Now · Next · Later; no journey track; the
   answer reads "43 of 50 epics have shipped. Now: …"; 28 names link to `/board?card=`, and one opened (200). (The
   demo Hub reads anonymously — it is the public self-tenant, rule #2 — so this step needed no sign-in.)
2. ⏳ **Owed to Daniel (signed in):** `/hub/w/9e58bc7d-a0a8-43c9-89a2-c544cab854f2/board`. Signed out it sends you to
   `/login` (307), malformed id included — the session check comes first. The signed-in behaviour is pinned locally by
   `hub-board.authed.spec.ts` (approved-state signature, project chips, access model A).
3. ⏳ **Owed to Daniel (signed in):** the Miyagi workspace id → 404. Pinned locally by the tenancy spec (a foreign
   workspace, a malformed id and a foreign `?project=` are each 404; each guard observed red with it removed).
