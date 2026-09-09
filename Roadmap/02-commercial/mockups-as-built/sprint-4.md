# The mockups, as built — Sprint 4: The nine routes nothing was measuring

**Status:** ⬜ not started

> **⛔ Read the epic README's ONE RULE before starting.** Every screen below is drawn and approved.
> There is nothing to design and nothing to decide.
>
> This sprint exists because the gate built in Sprint 1 found nine routes that do not have the
> structure of their approved state and were **in no story of this epic** — while
> `design-system-rails` reported them as `27/27` complete with `outstanding: []`.
>
> Daniel's decision, 2026-09-09 (epic **D16**): *"Build all 17. Add Sprint 4 for the 10. The
> appetite grows and that's accepted — the deliverable is the approved design on every route, not a
> subset with a debt list."*
>
> **The same two hard rules as Sprint 2: no capability is lost, and no `<details>` survives. When
> those conflict, the answer is the wizard shape as a modal (D8), never a disclosure.**

## How a story here is done

Every story is the same shape, and the gate is the acceptance check:

1. The route's structural signature equals its approved state's — `npm run test:e2e:local -- --authed
   apps/web/e2e/console-visual.authed.spec.ts` names the blocks that disagree.
2. `apps/web/design-system/STATE-MATCH.json` gains the route, committed in the same story. That is
   the ratchet closing behind it (**D15**) — from then on the route cannot silently regress.
3. Every existing behavioural spec for the route is still green. That pair — the gate green and the
   old specs green — is what proves a change replaced UI rather than a capability.

## Stories

### Story 4.1 — Setup › Connect and Setup › Keys
**As a** person, **I want** the two Setup screens I approved.
**Acceptance:**
- `/app/setup/connect/[projectSlug]` matches `setup-connect`: `head → list → list → note`. It
  renders `head → card` today — one card where the design draws two lists and a closing note.
- `/app/setup/keys/[projectSlug]` matches `setup-keys`: `head → list`. It renders an extra `note`
  block today, and its `+ New key` control opens the wizard shape (D8).
**Risk:** high

### Story 4.2 — Setup › Share links
**Acceptance:**
- `/app/shares/[projectSlug]` matches `setup-shares`: `head → answer → list`. It renders
  `head → answer → note → list` today, and its head draws no `+ New share link` — the approved
  state does, and it opens the wizard shape (D8).
**Risk:** high

### Story 4.3 — Tasks
**Acceptance:**
- `/app/tasks/[projectSlug]` matches `tasks-standalone`:
  `crumbs → head → answer → band → band → band → band`. It renders no breadcrumb row and one band
  fewer today.
**Risk:** high

### Story 4.4 — The hub: roadmap, horizon and report
**Acceptance:**
- `/hub/[projectSlug]` matches `hub-roadmap`: `head → answer → tiles(4) → list → sectionlabel →
  list → note`. It renders `head → list`.
- `/hub/[projectSlug]/horizon` matches `hub-horizon`: `head → answer → destinations → haze`.
- `/hub/[projectSlug]/report` matches `hub-report`: `head → provenance → document`.
- ⚠️ **These three share `app/hub/hub.module.css`** and go to ONE builder for that reason.
- ⚠️ `route-manifest.ts` carries `POD_REPORT_TABLES_DEFERRAL` on the two pod-report surfaces,
  which says the approved `hub-report` state "is PROSE and contains no table at all". That
  deferral's premise is now the story: the state is `head → provenance → document`, and building it
  is what closes the deferral. **Close it in this story rather than extending its date.**
**Risk:** high

### Story 4.5 — The public surfaces: /install and /s/[token]
**Acceptance:**
- ⚠️ **`/login` is NOT in this story.** It was in the list Daniel decided on, and it matches its
  approved state — it only looked broken because the gate opened it from the signed-in fixture and
  measured the `/app` it was redirected to (epic **D16-b**). It is in the matching floor.
- `/install` matches `public-install`: `title → note → demobar → list`. It renders three `card`s
  where the design draws one list.
- `/s/[token]` matches `public-share`: `sharehead → provenance → document`.
- ⚠️ These are **anonymous** surfaces. The gate opens them in a context with no session — a
  signed-in reader is redirected off `/login`, and the gate reports that as a redirect rather than
  measuring the page it landed on.
**Risk:** high

## Sprint QA
- **api spec(s):** none new — **Sprint 1's gate is the spec**, and each story is done when its route
  is in `STATE-MATCH.json`. Existing behavioural specs for each route must stay green.
- **browser smoke owed:** yes, to Daniel — the walkthrough below, on production.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 4 — Smoke walkthrough (do these in order)
Env: **production · https://goldenfrijoles.com**

1. Go to https://goldenfrijoles.com/app/setup/connect/miyagisanchez
   → Two lists and a closing note, as approved — not one card.
2. Go to https://goldenfrijoles.com/app/setup/keys/miyagisanchez and press **+ New key**.
   → The wizard shape opens as a modal. Minting still works end to end.
   **(Owed to Daniel by name — this mints a real credential.)**
3. Go to https://goldenfrijoles.com/app/shares/miyagisanchez and press **+ New share link**.
   → The wizard shape opens. **(Owed to Daniel by name — this mints a real share link.)**
4. Go to https://goldenfrijoles.com/app/tasks/miyagisanchez
   → A breadcrumb row above the head, and four bands.
5. Go to https://goldenfrijoles.com/hub/miyagisanchez, then Horizon, then Report.
   → Each matches its mockup. The report is prose with a provenance stamp, not a table.
6. Open the PR's CI run.
   → The visual gate is green for **every route**, and `STATE-MATCH.json` lists all 21.

If any step fails, note the step number + what you saw — that's the bug report.
