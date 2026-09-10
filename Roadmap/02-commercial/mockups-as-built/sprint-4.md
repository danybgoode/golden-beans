# The mockups, as built — Sprint 4: The nine routes nothing was measuring

**Status:** ✅ COMPLETE (2026-09-10) — all eight routes match. **22 of 22.**

> What it took, beyond the five stories as written:
>
> - ⚠️ **THREE of the eight were FIXTURE gaps, not page defects.** `/hub/[projectSlug]`,
>   `/hub/…/horizon`, `/hub/…/report` and `/s/[token]` all rendered their EMPTY states, because the
>   authed fixture tenant had never pushed a roadmap or a pod-report artifact — so they came out as
>   `head → list` where the design draws seven blocks and four. The pages were already built. Both
>   artifacts are pushed through `push_report_artifact`, the product's own write path, so a payload
>   the fixture accepts is one the API accepts.
> - **`/install` is ONE card, not three**, and the SDK block is a third labelled section inside it
>   rather than a card of its own — `landing-readability-pass` retired the landing's §sdk into this
>   page, and deleting it to match a mock would undo a shipped epic's decision. The prototype has no
>   reason to draw it: it has no SDK.
> - **`setup-connect`'s three steps moved OUT of the page's card**, into a sibling
>   (`ConnectorSteps`). While they were nested the whole page read as `head → card` — one block
>   where the design draws three. Its closing `Callout` became a plain `<p>`: a `.ds-callout--info`
>   is an ANNOTATION to the contract (D2-c), so the page's fourth block was missing while the line
>   was on screen.
> - **`setup-keys`' counting sentence moved INSIDE its card**, the same way the Activity pager did.
> - **`setup-shares`' head moved into `ShareManager`** so the `+ New share link` trigger, the mint
>   form and the shown-once URL share one piece of state — the `keys-surface.tsx` pattern. Its
>   `Cancel` button is deleted: the dialog owns whether it is open, so a fourth way out that the form
>   cannot perform would be a control that does nothing.
> - **The pod report is wrapped in ONE `document`**, which is what closes `POD_REPORT_TABLES_DEFERRAL`
>   rather than extending it: the deferral's premise was that the approved state "is PROSE and
>   contains no table at all", and the state is a DOCUMENT — a document may contain a table. Nothing
>   is deleted to satisfy a geometry assertion.
> - **The hub's provenance stamps are gone from Roadmap and Horizon**, because neither approved state
>   draws one — and every fact they carried (when, from which merge, how stale, the `data-freshness-tone`)
>   moved into the closing note and the answer respectively. A report that cannot tell you how stale
>   it is, is a screenshot.
>
> ### Four defects only LOOKING could find, on routes whose signature already matched
>
> - **The `.ds-doc` measure squeezed every table to 70ch.** `max-width` was on the CONTAINER, which
>   is indistinguishable from the prototype's rule while a document holds only prose — and wrong the
>   moment it holds the pod report's metric tables. The measure is on the prose children now.
> - **`.ds-dests` overflowed a 360px phone.** `minmax(320px, 1fr)` is a track FLOOR, so a container
>   narrower than 320px scrolls sideways. It had never been seen because Horizon rendered its empty
>   state on every fixture tenant — the mobile sweep swept a page with nothing to lay out.
> - **`.ds-step-action` was `inline-flex`**, so "Add to Claude ↗" sat on the same line as the step it
>   belongs under. The approved state draws it beneath.
> - **Setup › Connect opened on a STATUS verdict** about a URL the reader had not been shown yet.
>   The approved order is the thing, then whether it is live.
>
> ### D17 — the epic DOES ship a migration now, and Daniel decided it
>
> The approved `setup-shares` state draws "Expires · **opens**". There was no opens count:
> `/s/[token]` records a view with `trackSelfEvent`, which writes into the SELF tenant — our
> telemetry about our own product — so a customer's project holds no record their own link was
> opened. Daniel's ruling, 2026-09-10: **build it**, which is D16 applied.
>
> `20260910120000_share_open_count.sql` adds `api_keys.opened_count` and `record_share_open()`.
> Additive, defaulted, no backfill: reverting this epic's code leaves a column nothing reads, so
> `git revert` stays a complete rollback of BEHAVIOUR. **It amends D13 ("no migration") and the
> reason D4 gives for revert being sound.** The number is a COUNT and not a log, and the page says
> "opened N times", never a visitor count — a bearer URL forwarded to a room is one link and many
> readers.

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

### Story 4.1 — Setup › Connect and Setup › Keys — ✅
**As a** person, **I want** the two Setup screens I approved.
**Acceptance:**
- `/app/setup/connect/[projectSlug]` matches `setup-connect`: `head → list → list → note`. It
  renders `head → card` today — one card where the design draws two lists and a closing note.
- `/app/setup/keys/[projectSlug]` matches `setup-keys`: `head → list`. ✅ — the counting sentence
  moved inside the card, which is what the extra `note` block was.
- ✅ **`+ New key` opens the wizard shape** (2026-09-10). It did not, and this doc reported the story
  done: it expanded an inline panel from `keys-surface.tsx`, which did not import `NewThingDialog`.
  Found by pressing the button on production.
  **Why no gate caught it:** the structural contract asserts the page's DEFAULT state, and the panel
  only exists after a click the gate never makes. The route legitimately matches `head → list` either
  way — so the criterion could be unmet on a green gate indefinitely.
  **What it took:** `NewKey`'s trigger and open state moved into `NewThingDialog` the way
  `ShareManager`'s were. `NewKey.Trigger` is deleted (the seam renders the button, so one component
  owns the label the gate reads); its `Cancel` is deleted (the dialog owns whether it is open, and a
  control that cannot do what it says is worse than no control); `.ds-mint` went with the card it
  spaced. Setting `minted` is what closes the dialog — one condition decides both, so they cannot
  disagree about whether an unsaved credential is on screen.
- ⚠️ **A SECOND surface was doing the same thing, and only the new guard found it.**
  `+ New destination` toggled a `creating` card in `destination-manager.tsx`. Same conversion, plus
  the `mintError`/`revokeError` split `share-manager.tsx` already carries — a create failure belongs
  inside the dialog, a rotate/remove/test failure beside the list it was aimed at.
- ✅ **The guard that makes this class of defect impossible to ship again**, in
  `console-visual.authed.spec.ts`: *every approved "+ New …" opens the wizard shape, and no surface
  answers it inline*. It reads the approved action labels out of `STATE-CONTRACT.json` rather than a
  list retyped in the spec, presses each, and requires a `<dialog>` that is genuinely `:modal` and
  carries `.ds-dialog`. `/app/flags/[projectSlug]`'s New feature wizard is exempted from the CLASS
  check by name — it renders `console.css`'s `.modal`, a stated `design-system-rails` S4.1 deviation.
  **Mutation-checked twice:** red on Destinations before its fix, and red on all six D8 surfaces with
  `showModal()` swapped for `show()`.
**Risk:** high

### Story 4.2 — Setup › Share links — ✅
**Acceptance:**
- `/app/shares/[projectSlug]` matches `setup-shares`: `head → answer → list`. It renders
  `head → answer → note → list` today, and its head draws no `+ New share link` — the approved
  state does, and it opens the wizard shape (D8).
**Risk:** high

### Story 4.3 — Tasks — ✅ (already matching; no change needed)
**Acceptance:**
- `/app/tasks/[projectSlug]` matches `tasks-standalone`:
  `crumbs → head → answer → band → band → band → band`. It renders no breadcrumb row and one band
  fewer today.
**Risk:** high

### Story 4.4 — The hub: roadmap, horizon and report — ✅
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

### Story 4.5 — The public surfaces: /install and /s/[token] — ✅
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
2b. Go to https://goldenfrijoles.com/app/destinations/miyagisanchez and press **+ New destination**.
   → The same wizard shape opens as a modal, over a dimmed page — not an inline card.
3. Go to https://goldenfrijoles.com/app/shares/miyagisanchez and press **+ New share link**.
   → The wizard shape opens. **(Owed to Daniel by name — this mints a real share link.)**
4. Go to https://goldenfrijoles.com/app/tasks/miyagisanchez
   → A breadcrumb row above the head, and four bands.
5. Go to https://goldenfrijoles.com/hub/miyagisanchez, then Horizon, then Report.
   → Each matches its mockup. The report is prose with a provenance stamp, not a table.
6. Open the PR's CI run.
   → The visual gate is green for **every route**, and `STATE-MATCH.json` lists all 21.

If any step fails, note the step number + what you saw — that's the bug report.
