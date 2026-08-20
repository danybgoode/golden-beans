# Methodology experience — Sprint 4: Evidence, honesty, close-out

**Status:** ⬜ Not started
**Branch:** `feat/methodology-experience-s4` (cut from `feat/methodology-experience-s3`)
**Risk:** LOW, except 4.4 (the merge/deploy) — **MEDIUM**

> **Build contract (locked by the architect before any builder starts).**
> Nothing in this sprint adds reader-facing capability. It closes the gap between what the epic
> claims and what can be shown: the reader becomes measurable, the download button becomes honest or
> disappears, the page becomes accessible and crawlable, and the whole thing is proved in production
> rather than assumed from a green CI run.
>
> **Done means shipped, not merged** (WAYS-OF-WORKING #8). A merged PR that has not deployed is not
> done.
> Cite the epic's D5, D6, D9; do not re-derive them.

## Stories

### Story 4.1 — The methodology reader becomes evidence

**As the** product owner, **I want** to know whether anyone actually reads this, **so that** the next
Bet on the methodology is placed on Evidence rather than on how good the page looks.

**Acceptance:**
- Reader telemetry rides the **existing** `SelfTrackBeacon` pattern — `methodology_visited` on the
  index and `methodology_chapter_opened` per chapter. No second beacon, no new endpoint.
- The methodology is registered as a feature so the funnel has shape, the same way
  `lib/provisioning.ts` registers a starter feature for a new tenant.
- **The events carry a `feature_id`.** `commercial-shell` S3 shipped a landing beacon that wrote
  `feature_id = NULL` for its whole life and nothing errored and nothing alerted (LEARNINGS,
  2026-08). Assert it in the spec; do not assume it from the code.
- No PII, no reading of the chapter's content into the event — an id and a route segment.
**Risk:** LOW

### Story 4.2 — The downloadable edition is generated, or the button is cut

**As a** reader who wants the guide offline, **I want** the download to give me the same text the
site shows, **so that** I am not carrying a stale fork of the methodology around.

**Acceptance:**
- The edition is **generated from `lib/methodology-chapters.ts`** (epic D5). A hand-maintained
  markdown twin is not an acceptable implementation of this story.
- The generated edition is linked from `/methodology` and referenced from `app/llms.txt`, so an agent
  reading the site gets the method too.
- **If generation is not built inside this story's budget, the button is cut** — not pointed at
  `references/`, and not left with a dead handler. A button that says "download" and does nothing is
  the exact defect `MethodologySection` already refused to ship once.
- Whichever way it lands, the outcome is written into this file with the reason.
**Risk:** LOW

### Story 4.3 — Accessible, crawlable, drift-free

**As** anyone arriving from a search result, a screen reader or a link preview, **I want** the
methodology to work, **so that** the guide is readable by more than a sighted mouse user on Chrome.

**Acceptance:**
- `npm run check:design-drift` green across the new files — no raw hex, no pictograph, no enclosed
  numeral, no heading ending in a full stop, `token-source` intact.
- One `<h1>` per route; real landmarks; every interactive element keyboard-reachable with visible
  focus; the index cards and TOC pass axe on the index and one chapter.
- `generateMetadata` per route following `app/layout.tsx`'s precedent (epic D9) — dynamic, not a
  static object, and **naming no capability a flag flip can falsify**. OG/Twitter images for the
  index and for chapters.
- The routes appear wherever the site tells crawlers what exists.
**Risk:** LOW

### Story 4.4 — Ship it, then prove it shipped

**Acceptance:**
- PR opened, gate green, `origin/main` merged into the branch before merging. Two cross-family review
  rounds routed by `scripts/review-route.mjs`, **the last round clean from both families**.
- Merged to `main`. The deployed SHA confirmed via
  `gh api repos/danybgoode/golden-beans/deployments` — **never assumed from a green CI run.**
- **Production smoke on the live site, by exercising behaviour, and baselined against the OLD
  production first** so a pass is evidence rather than a script that would have passed either way
  (the predecessor epic's Story 4.4 is the worked pattern — 34 checks, baselined at 19 failures):
  - `/` §loop renders exactly three moves with the product owner's copy.
  - `/` contains no rendered "Shape".
  - All six `/methodology/<chapter>` URLs answer 200; the index answers 200.
  - No rendered lede contains `{`.
  - Every CTA and nav link on `/` and `/methodology` resolves to a 200.
  - The reduced-transparency fallback renders opaque.
  - No horizontal scroll at 390px on the index and a chapter.
  - The dogfood beacon still fires: `landing_visited` is still being ingested after the deploy, and
    `methodology_visited` is arriving with a non-null `feature_id`.
**Risk:** MEDIUM — it is the deploy

### Story 4.5 — Close the epic

**Acceptance:**
- `Roadmap/README.md` poster updated — the 02-commercial feature map gains the methodology
  experience, plus a Recent highlights entry.
- Each `sprint-N.md` carries its fool-proof smoke walkthrough with real production URLs, and its
  `Status:` ticked with commit refs.
- `RETROSPECTIVE.md` written — what shipped, what worked, what did not, the owed ledger. In
  particular: did the Apple-materials pass survive its circuit breaker, and did *Design* read better
  than *Shape*?
- Durable learnings promoted to `Roadmap/LEARNINGS.md`, deduped — sharpen the existing line, do not
  append a near-duplicate.
- Epic README frontmatter `status: shipped`; seed frontmatter `status: shipped`.
- `node scripts/build-order.mjs` regenerated (never hand-edited).
- Branches deleted.
**Risk:** LOW

## Sprint QA

- **`api` project** — the telemetry spec (event fires, `feature_id` non-null), the metadata spec, and
  the full Sprint 1 + 2 specs still green.
- **`browser` project** — axe on index + one chapter; the Sprint 3 preference-emulation specs still
  green post-materials.
- **Production smoke** — Story 4.4, baselined against old production first.

## Sprint 4 — Smoke walkthrough

*Written at sprint close, with real production URLs. Placeholder — do not tick the sprint without it.*
Env: production · `https://goldenfrijoles.com`
