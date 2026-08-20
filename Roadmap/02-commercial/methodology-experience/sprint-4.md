# Methodology experience — Sprint 4: Evidence, honesty, close-out

**Status:** ✅ **Shipped and verified in production** — PR [#108](https://github.com/danybgoode/golden-beans/pull/108), squashed to `main` as `727fc04`, Production deployment `6009582820` reported `success` for that exact SHA.
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

### Story 4.1 — The methodology reader becomes evidence  ✅ `9d2fef8`

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

### Story 4.2 — The downloadable edition is generated, or the button is cut  ✅ `85536b2` — **generated, so the button ships**

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

### Story 4.3 — Accessible, crawlable, drift-free  ✅ `85536b2` + `bcc8e82`

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
- The routes appear wherever the site tells crawlers what exists. ⚠️ **Amended (A6): there is
  nowhere.** Measured on live production — `/sitemap.xml` is a **404**, and `/robots.txt` is the
  deploy platform's default boilerplate with no `User-agent`, no `Allow` and no `Sitemap:` line.
  This bullet read as though a crawler manifest already existed. So this story BUILDS one: a
  sitemap generated from the real route set (never a hand-written list), and a `robots.txt` this
  repo owns which points at it.
- `generateMetadata` is asserted **per route**, not assumed from D9. All seven methodology URLs
  currently serve the LANDING's `<title>` and description, so nothing — a search result, a link
  preview, an agent's page list — can tell the six chapters apart (A6).
**Risk:** LOW

### Story 4.4 — Ship it, then prove it shipped  ✅ `727fc04`

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

### Story 4.6 — Any agent can read the methodology *(amendment A6)*  ✅ `85536b2` + `a227506`

**As** a maker's agent — Claude, ChatGPT, Gemini, or whatever they run — **I want** to read the whole
method from this site without executing JavaScript or guessing at URLs, **so that** my human can hand
me a link instead of pasting a document.

The product owner asked for this by name on 2026-08-20. Most of it was already implied by D5, D7 and
Stories 4.2/4.3, but it was scattered across three stories as a side effect and **nothing tested it**.
This story owns the outcome; 4.2 and 4.3 build the parts.

**Acceptance — asserted as what an agent RECEIVES, not as which tags exist:**
- Every chapter URL returns **its own** `<title>` and description. Today all seven serve the
  landing's (A6, measured).
- The generated edition (4.2) round-trips **the same six chapters as the module**, derived, and is
  reachable at a stable URL. Signal ratio today is 5.8%–8.1%: an agent spends ~30–41 KB of context to
  read ~2–3 KB of method, and the edition is what fixes that.
- `/llms.txt` names the methodology and the edition, and **every URL it names resolves** — the
  existing `landing-prompts.spec.ts` pattern, which already fetches every URL a prompt mentions.
- The sitemap (4.3) lists **exactly** the routes that exist: every chapter id appears, and no id that
  is not in the module does. Derived from the same source as `generateStaticParams`.
- The whole method is reachable with **JavaScript disabled** — asserted in the `browser` project with
  JS off, not inferred from the routes being server-rendered.
- Verified by the architect against live production, and **owed to the product owner to test himself**
  afterwards.
**Risk:** LOW

## Sprint QA

- **`api` project** — the telemetry spec (event fires, `feature_id` non-null), the metadata spec, the
  agent-readability spec (Story 4.6 — per-route titles, the edition's round trip, every `llms.txt`
  URL resolving, the sitemap matching the module), and the full Sprint 1 + 2 specs still green.
- **`browser` project** — axe on index + one chapter; the Sprint 3 preference-emulation specs still
  green post-materials.
- **Production smoke** — Story 4.4, baselined against old production first.

## Sprint 4 — Smoke walkthrough

Env: **production** · <https://goldenfrijoles.com> · deployed SHA `727fc04` (confirmed via
`gh api repos/danybgoode/golden-beans/deployments`, deployment `6009582820` → `success`).

| # | Do this | Expect |
|---|---|---|
| 1 | Open <https://goldenfrijoles.com/methodology/design-it> and look at the browser tab | **"Design it — the Golden Frijoles methodology"**, not the landing's title. Every chapter is different |
| 2 | View source, find `rel="canonical"` | `https://goldenfrijoles.com/methodology/design-it` — the real host, not `localhost:3000` |
| 3 | Open <https://goldenfrijoles.com/methodology/edition.md> | The whole method as one markdown document, ~13 KB, shown as text rather than downloaded |
| 4 | Open <https://goldenfrijoles.com/sitemap.xml> | 200, with 13 entries including all six chapters and the edition (it was a **404** before this sprint) |
| 5 | Open <https://goldenfrijoles.com/robots.txt> | This repo's, with a `Sitemap:` line and `/s/` disallowed (it was platform boilerplate before) |
| 6 | Open <https://goldenfrijoles.com/llms.txt> | Names `/methodology` and `/methodology/edition.md` |
| 7 | Paste a chapter URL into Claude, ChatGPT or Gemini and ask it to summarise the chapter | It reads it. No JavaScript is needed — the whole method is in the HTML the server sends |
| 8 | Run the epic's specs against production | `PLAYWRIGHT_BASE_URL=https://goldenfrijoles.com npx playwright test apps/web/e2e/methodology-agent-readable.spec.ts apps/web/e2e/methodology-routes.spec.ts apps/web/e2e/methodology-vocabulary.spec.ts --project=api` → **20 passed** |

**Baselined, which is what makes step 8 evidence.** The same agent-readability spec run against
production **before** this merge failed **5 of 6**. The one that passed was the property Sprint 2
already shipped (real server-rendered routes). After the merge: 20 of 20.

**The telemetry is proved by a NON-ZERO number, not by a 200.** Two beacons were fired at live
production and the rows read back out of the production database:

| event | feature_id | chapter |
|---|---|---|
| `methodology_visited` | `methodology_reading` | — |
| `methodology_chapter_opened` | `methodology_reading` | `design-it` |

Both non-null. `commercial-shell` S3's landing beacon wrote `feature_id = NULL` for its whole life
and nothing ever noticed, because a broken funnel and an empty one look identical.

**One thing the deploy did NOT do, found by checking rather than assuming.** The
`methodology_reading` feature was not registered on the production self tenant — the seed script
registers it, and the seed script is not part of the Vercel deploy. Events were landing correctly
and the funnel would still have rendered a permanent zero: the exact defect this story exists to
prevent, one layer further out. Registered via `supabase db query --linked` (the recorded precedent
that avoids putting a plaintext tenant key in a shell), and verified:

```
methodology_reading   targeted 1   adopted 1
```

A real number, from a real read, through the real path.
