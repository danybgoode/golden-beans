# The mockups, as built — Sprint 3: The two missing screens, and no flags

**Status:** ✅ COMPLETE (2026-09-10) — 3.1, 3.2, 3.3 and 3.5 built. 3.4 closes with the epic.

> Two surfaces in the approved design were never built at all, and one flag was standing between the
> console and the people using it. What it took, beyond the three stories as written:
>
> - **The denominator arithmetic in D14 was incomplete, and Daniel ruled on it (D14-b).** Unmapping
>   `measure-north-star` from `/app/impact/…` left that route with NO approved state — the approved
>   33 hold no impact screen — so 28 could never be reached. It BORROWS the state instead (the D2-d
>   mechanism, owned and dated), which is honest: same language, different subject.
> - **`getProjectNorthStarByProjectId` is a new READ, and the per-input series read is now shared.**
>   The feature page asks "what does THIS FEATURE feed" and North Star asks "what feeds the North
>   Star"; the second is not a subset of the first, because an input attached to no feature still
>   feeds the metric. No schema change, no migration (D13).
> - **The authed fixture had ONE leading input where the design draws three**, so the contract's
>   `smallplots: 3` could not have been satisfied by any correct page. It has three now, and one of
>   them deliberately has NO series so the "nothing recorded yet" plot state is exercised.
> - **`.ds-chart-smalls` was capped at 380px per track**, so three approved plots wrapped 2 + 1 in
>   the console's 1120px column. A count is not a layout, and only opening the page shows it.
> - ⚠️ **The Activity timeline rendered as ONE CRAMMED LINE and had since Story 4.3 of the previous
>   epic.** Title, timestamp and reason are three `<span>`s inside a `<span>` — all inline, so every
>   `margin-top` below them did nothing. The route matched its approved signature the whole time it
>   looked like that. Found while adding the pager, by looking.
> - **The audit query had no TIEBREAKER**, which pagination turns from harmless into a defect: two
>   rows written in one transaction share `created_at`, Postgres may return them in either order, and
>   sliced into pages that means one row on two pages and another skipped, with every count correct.
> - ⚠️ **Six spec files read `CONSOLE_SHELL_ENABLED` and would have SKIPPED FOREVER** — including
>   `console-visual.authed.spec.ts`, the epic's own blocking gate. That is the most dangerous half of
>   deleting a flag, and it is invisible: a skipped suite is green.
> - **`⌘K still finds a SURFACE once features are in the list` was passing incidentally.** It
>   asserted `toHaveCount(1)`, which held only because no fixture feature's key contained the word
>   "Activity" — so the test written for the crowded case was running on an uncrowded one. Story
>   3.2's fixture creates that collision; the assertion is now presence under crowding, and a first
>   draft that asserted the surface ranked FIRST went red against `console-palette.ts:96`, which says
>   features come first by design.
>
> ### Raised, then decided and built — Story 3.5
>
> **The Activity entry named its actor as a raw UUID.** The approved state draws *"**Daniel** turned
> `ml.sync_enabled` off in Development"*; the product rendered `actor_user_id`. Daniel ruled
> (2026-09-10) to build it — and building it found that **no name existed anywhere to render**:
> sign-up collected an email and a password, and no screen let anyone set a name, in the approved
> design or the product. His second ruling the same day: collect an optional name at sign-up and in
> the Account menu, and show the name when set, the email until then. See Story 3.5.

## Stories

### Story 3.1 — North Star becomes a Measure surface ✳ *`measure-north-star`* — ✅
**As a** person, **I want** Measure to open on the North Star, **so that** the section shows the
number the project exists to move.
**Acceptance:**
- A North Star surface exists in `lib/project-route-inventory.ts` under `section: 'measure'`, and
  **it is the section's default** — the approved Measure rail opens on it.
- It matches `measure-north-star.png`: the hero number with its weekly delta, the trend plot with
  its crosshair, and the leading inputs as **three separate small plots**.
- ⚠️ **Three plots, never three lines on one chart** (`APPROVED.md` DD4). They are counts of
  different things on different scales; one axis would make the largest look like the most
  important.
- The page says when the North Star was last synced and by what, because it is synced from outside
  the product.
- **The `measure-north-star` state stops being mapped onto `/app/impact/…`.** That mapping was an
  architect's substitution for a route that did not exist; `/app/impact/…` keeps its own state.
**Risk:** high

### Story 3.2 — Activity paginates ✳ *`ship-activity`* — ✅
**As a** person, **I want** Activity to be a page, **so that** it stops being an endless list.
**Acceptance:**
- `/app/flag-audit/[projectSlug]` matches `ship-activity.png` and **paginates**. It currently
  renders every row `getFlagRegistryView()` returns, with no limit and no slice.
- Page size and controls come from the approved state. The URL carries the page, so a copy-paste
  opens the same one — the rule `console-ia-overhaul` Story 1.3 set for the environment.
**Risk:** high

### Story 3.3 — Delete the flag ✳ *D4* — ✅
**As a** product owner, **I want** no flag between the console and the people using it,
**so that** nothing is dark and nothing is half-on.
**Acceptance:**
- `CONSOLE_SHELL_ENABLED` is removed from `lib/flags.ts` and from the **four** files that gate on
  it: `app/app/page.tsx`, `setup/keys/[projectSlug]/page.tsx`,
  `setup/connect/[projectSlug]/page.tsx`, `setup/connect/[projectSlug]/actions.ts`.
- It is removed from **every Vercel environment**, and from `ci.yml` where the gate lights it.
- `grep -rn "CONSOLE_SHELL_ENABLED" apps scripts .github` returns **no live read** — the remaining
  hits are all comments recording the deletion, which is this repo's own habit and is worth more
  than a scrubbed word. The check that matters is behavioural and is asserted:
  `apps/web/lib/flags.test.ts` walks every `process.env.<NAME>` read in `flags.ts` and holds the
  gate table equal to it, so the function being gone is what removes the row.
- ⚠️ **SIX spec files read the variable and would have skipped forever.** `console-visual`
  (the epic's own gate), `design-system-specimen`, `charts`, `setup-surfaces`,
  `console-shell.authed` and `console-shell-public.browser`. Every one is unconditional now, and
  `console-shell.authed`'s gate-OFF describe — four assertions its own header already recorded as
  running nowhere — is deleted, because the state it described is unreachable rather than merely
  unrun. The anonymous case it was really about is covered by `console-shell-public.browser.spec.ts`,
  which runs without a session.
- The `'console'` branch of `closedConnectorGate` is deleted with it: AGENTS rule #3 is the
  `connectorEnabled` half and always was.
- **No new flag replaces it.** Rollback is `git revert` of a sprint PR — sound here because this
  epic ships no migration, no schema change and no auth change.
**Risk:** high

### Story 3.4 — Close it honestly
**As a** product owner, **I want** the record to say what happened, **so that** the next epic does
not inherit a false green.
**Acceptance:**
- `RETROSPECTIVE.md` records the three facts: the gate asserted presence on 25 of 27 routes, the
  screenshot layer was never built, and coverage was computed from typed booleans.
- It records that `design-system-rails` reported **27/27 complete, `outstanding: []`** while at
  least five routes did not match, and **does not rewrite that epic's docs** — the record of what
  it claimed is evidence.
- The durable lesson goes to `Roadmap/LEARNINGS.md`, deduped and sharpened, not appended.
**Risk:** low

### Story 3.5 — Activity names who acted ✳ *`ship-activity`* — ✅
**As a** person reading Activity, **I want** to see who made a change, **so that** the sentence
reads the way the approved state draws it rather than as a UUID.
**Acceptance:**
- Activity's sentence names the actor: their **name** when one is set, else their **email**, else
  (a failed or skipped lookup) their id — never a blank and never an invented word. The exact id
  stays in the actor's `title`, one hover away: a name is self-chosen and two people can share one.
- The flags page's "Lifecycle audit" table uses the same label — the second surface that printed
  the id.
- Sign-up carries an **optional** "Your name" field, after the two the approved state draws.
  ⚠️ **Daniel's approved deviation from `door-signup-open`, 2026-09-10.** The structural contract
  records `doorform` as a block, not its fields, so the route's signature is unchanged.
- The Account menu lets an existing account set or clear its name — every account created before
  this story has none, including the one that owns the product.
- **One definition of a name** (`lib/display-name.ts`, zero imports): both doors validate with it.
  Whitespace collapses; zero-width, bidi-override and other unshowable characters are REFUSED rather
  than stripped (an override can make one name read as another); 80 characters, counted as a reader
  counts them.
- **The lookup is narrow** (`lib/actor-names.ts`): it only ever reads ids from audit rows already
  read project-scoped behind `requireProjectMembership`, returns a name and an email and nothing
  else, is capped at 25 distinct actors, and never throws. No migration — the auth admin API.
**Risk:** medium — the first code that reads another person's auth record.

## Sprint QA
- **api spec(s):** `e2e/north-star.authed.spec.ts` (the surface exists, is Measure's default, and
  renders three separate plots) · `e2e/flag-audit.authed.spec.ts` (paginates; the page survives a
  copy-paste) · `e2e/actor-names.authed.spec.ts` (the email until a name is set, then the name, never
  the raw id in the sentence; a refused name changes nothing) · `lib/display-name.test.ts` (what a
  name may be) · the visual gate covers the routes against their PNGs.
- **browser smoke owed:** yes, to Daniel — **removing the flag from every Vercel environment** is a
  live environment change and is never covered by a merge authorization.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: **production · https://goldenfrijoles.com**

1. Go to https://goldenfrijoles.com/app and click **Measure**.
   → It opens on **North Star**. The rail lists North Star, Journeys, Scenarios & drills.
2. Look at the North Star page.
   → The big number with its weekly change, one trend plot, and **three separate small plots**
   underneath. Not three lines on one chart.
3. Go to **Ship › Activity**.
   → A page of activity with pagination. Go to page 2, copy the URL, open it in a new tab.
   → You land on page 2.
4. ✅ **DONE 2026-09-10** — `CONSOLE_SHELL_ENABLED` removed from Production, Preview and Development
   (Daniel authorized it by name). `vercel env ls | grep -c CONSOLE_SHELL` returns **0**.
   ⚠️ Vercel snapshots env vars into a deployment at build time, so the removal reaches running
   functions on the next deploy — which the merge of this PR performs. Nothing reads the variable
   any more either way, so there is no window where the two disagree about anything.
   → Still to confirm on the deployed build: the console serves normally and nothing 404s.
5. Open the PR's CI run.
   → The visual gate is **green for every route**, and coverage reports every route matching its
   approved PNG — derived from the gate, not typed.

If any step fails, note the step number + what you saw — that's the bug report.
