---
title: "Four destinations — an information architecture for the signed-in console"
slug: console-ia-overhaul
status: scaffolded
area: "02"
type: feature
priority: null
appetite: M
underwritten_by: null
risk: high
epic: "02-commercial/console-ia-overhaul"
build_order: 25
updated: 2026-08-27
---

<!-- SCAFFOLDED 2026-08-27. The epic README's frontmatter `status:` is now the SSOT for the board;
     this seed is funnel-only from here and its `status:` no longer drives anything. Architecture
     decisions D1–D9 and the per-sprint build contracts live in the epic, not here. -->

> **Scaffolded → [`Roadmap/02-commercial/console-ia-overhaul/`](../../02-commercial/console-ia-overhaul/README.md).**

# Pitch — Four destinations

## Problem

The signed-in product has **seventeen destinations and no information architecture**. Fifteen live in
`lib/project-route-inventory.ts`; four more (`Home`, `Sections`, `Connect`, `Agent notes`) are bolted
into `ProductShell`'s header outside the inventory entirely. They are presented as one flat list
inside a `<details>` disclosure, ordered by the sprint that happened to build each one. Nobody chose
to have seventeen — they accumulated.

The product owner's words, 2026-08-27: *"Those are not intentional at all. Never were part of any
strategy at all. They were just bolted there whenever we built a new feature."*

**The defect underneath the nav is that the product has no unit of work.** Golden Beans is a growth
engine: you ship a thing, switch it on for some people, and watch whether it moved the number. That
is one loop about one object — a **feature**. There is no page for a feature. There are five pages
that each hold one aspect of one:

| Aspect | Where it lives today | Reachable? |
|---|---|---|
| Its switch | `/app/flags/[projectSlug]` | yes |
| Its funnel | `/app/funnel/[projectSlug]/[featureKey]` | **only by typing the key into the URL** |
| Its impact | `/app/impact/[projectSlug]/[featureKey]` | **only by typing the key into the URL** |
| Its experiment | `/app/experiments/[projectSlug]` | separate list |
| Its history | `/app/flag-audit/[projectSlug]` | separate list |

So the nav lists *containers*, because there is nothing else to list. This is the same defect
`flags-console-parity` fixed one level down — that page showed the storage model instead of the job;
the navigation shows the route table instead of the work.

Three specific harms fall out of it, all verified against `main`:

1. **Two nav entries instruct the user to edit the address bar.** `funnel` and `impact` are keyed by
   feature and there is no picker, so the inventory emits a literal placeholder
   (`DEFAULT_FEATURE_HINT = 'your-feature-key'`) and the entry's own description reads
   *"swap the feature key in the URL"*.
2. **`Connect` hands a signed-in user the wrong token.** It points at `/install`, which imports the
   landing page's `Nav` and `Footer` (marketing chrome inside a signed-in session) and resolves
   `getActiveConnectorUrl(DEMO_PROJECT_SLUG)` — the **demo project's** connector URL, not the
   viewer's. Meanwhile `/app/onboarding/[projectSlug]` already renders the correct per-project
   URL, already inside `ProductShell` — and is marked `status: 'flow-only'`, which
   `getProjectSurfaceLinks` filters out of the nav. **The feature is finished and hidden.**
3. **Four separate pages issue secrets** (`keys`, `flag-credentials`, `agent-keys`, and the connector
   token). Nobody thinks *"I need a flag credential"*; they think *"I need to give something access"*.

And on the flags page itself, the JSON authoring textarea (*"Create an immutable definition
version"*) and the rule builder (*"Build a rule" · "Rules" · "Save" · "Show JSON"*) still render
**regardless of `FLAG_CONSOLE_ENABLED`** — they sit outside the three `show*` props, so
`flags-console-parity` closed with them still on the page. That is the endless-page complaint that
started this.

## Appetite

**M — one wave.** An architect session, builder fan-out across three sprints, and review rounds.

The circuit breaker is real and named: **if any single sprint exhausts its budget, work stops and
returns to shaping rather than being extended in flight.** This epic is a re-presentation of things
that already work; the moment it starts needing new queries, new tables or a new auth boundary, the
scope was wrong and the honest move is to stop.

## Outcome & signal

**What is true after this ships that is not now:**

- The signed-in product has **four** top-level destinations instead of seventeen, and each answers a
  question a person actually arrives with.
- No navigation entry anywhere instructs anyone to edit a URL.
- A signed-in user copies **their own** connector URL from inside the product and pastes it into
  `https://claude.ai/customize/connectors?modal=add-custom-connector`.
- One page lists everything that has access to the project.
- `/app/flags/[projectSlug]` shows two rows and a summary line in Production, and holds no JSON.

**How the product owner tests it:** open `/app`, and reach every surface in the product in at most
three clicks or one `⌘K` — without typing a URL. Then connect Claude to `miyagisanchez` end to end.

## Stage-2.5 bucket

**Genuinely new — but far smaller than it looks, and one part is already-possible.**

Bucket 1 (already possible today) applies to the single loudest complaint: **Connect**. The
per-project connector URL is built, correct and rendering inside `ProductShell` at
`/app/onboarding/[projectSlug]`. It needs a nav entry and a status line, not a build.

Everything else is bucket 3 — but the platform-first reframe below cuts it hard: **no new table, no
new query, and no new auth boundary.** The nav is generated from an inventory that already exists;
the funnel and impact pages already work and only need to be reached from the right place; the
credential pages already enforce their own checks and only need one shell around them.

## Bill of materials (What / Why)

| What | Why |
|---|---|
| A `section` field on the route inventory | The nav must stay generated from one list. A hardcoded list in `ProductShell` is the drift `shell-nav.ts`'s own D1 comment forbids. |
| Four sections: Today · Measure · Ship · Setup | One per question a person arrives with. Ordered by frequency of use, which is the only defensible way to rank nav items. |
| A project switcher (tier 1) | Golden Beans is project-scoped throughout. One switcher governs everything below it. |
| A per-section rail (tier 3) | Where a section's own scope lives — Ship holds the environment picker, because it scopes Ship and nothing else. |
| `⌘K` | With 42 features and a dozen surfaces, typing the name is the real navigation. It makes tier-3 depth free. |
| Funnel + Impact as tabs on a feature | They were never destinations. This is what removes the URL-editing instruction. |
| `Setup › Connect` | Your token, in the product, with a status. Unburies a finished page. |
| One `Setup › Keys` | A key is a key; which subsystem minted it is a column, not a page. |
| The dormant-flag collapse | 40 identical rows carry no information apart and a lot together. Summarise the uniform, expand the exceptional. |
| Deleting the JSON stack | It is the thing the product owner is actually looking at, and its replacement already shipped. |

## Scope

**In v1:**
- The three-tier shell (project → four sections → rail) behind one enablement gate.
- The inventory gains `section`; `funnel` and `impact` leave it; `DEFAULT_FEATURE_HINT` is deleted.
- `⌘K` over surfaces (features indexed in Sprint 3 — see rabbit holes).
- `Setup › Connect` and one `Setup › Keys`.
- The features list: the answer line, the dormant collapse, pagination inside the collapsed group.
- Funnel + Impact tabs on `/app/flags/[projectSlug]/[flagKey]`.
- Deleting the JSON authoring textarea and the rule-builder stack.

**Out of v1 (no-gos):**
- **No organisation tier.** Golden Beans has no org layer and this does not add one.
- **No change to `/install`.** It is a public marketing page and AGENTS rule #2 requires public
  routes to serve the demo project only. Serving the demo token *there* is correct; the defect was
  linking a signed-in user to it. `/install` is untouched by this epic.
- **No unification of the two feature registries.** TARS features (`setup_guide`) and flag
  definitions (`checkout.stripe_enabled`) are different tables with different naming conventions.
  Merging them is a data decision the product owner owns. The IA works either way: a tab with no
  data says so.
- **No new segments / per-identity targeting.** Flagsmith has them; Golden does not. The prototype
  leaves those tabs honestly empty rather than inventing a model.
- **No redesign of Today's contents.** Command Center already answers the right question; this epic
  renames it and folds the task queue in, and does not re-shape its widgets.
- **No visual redesign of Measure's existing pages.** Journeys and Scenarios move sections; their
  interiors are out of scope.

## Rabbit holes

- **The `⌘K` feature index.** The palette lives in the shell, which does not load the flag registry.
  Reading `getFlagRegistryView()` on every `/app` route to index 42 keys is a real cost for a rarely
  used control. **The either/or is named, not decided here:** lazy-fetch the index on first `⌘K`
  versus seeding it from the pages that already hold the registry. Decide at the architecture lock,
  against measured query cost. Sprint 1 ships the palette over surfaces only, which needs no data.
- **Gate-flip ordering is the whole risk in this epic.** The new nav names destinations that do not
  exist until Sprints 2 and 3. Turning the gate on after Sprint 1 would remove the only route to a
  control — precisely the failure `flags-console-parity`'s Amendment 1 recorded, where hiding the
  legacy stack a sprint early would have left no way to kill a live flag. See D4.
- **The credential merge is auth-adjacent.** Three owner-only pages becoming one is a place where a
  boundary can widen by accident. It is architect-only work and each section must re-assert its own
  check rather than inheriting one page-level guard.
- **`ProductShell` wraps every signed-in route including error and gated states.** `getShellNav`
  documents that it must never throw for exactly this reason. Anything added to the shell inherits
  that constraint — a palette that throws breaks every page in the product at once.

## What already exists (reuse, don't rebuild)

**Golden — use directly:**
- `apps/web/lib/project-route-inventory.ts` — every surface with a label, audience, gate and
  description, already unit-tested. **The nav needs no second list.**
- `apps/web/lib/shell-nav.ts` → `getShellNav()` — resolves the active project, the project list and
  the entitled links. The project switcher's data is already here.
- `apps/web/components/product/ProductShell.tsx` — the shell itself, already below the auth guard.
- `apps/web/app/app/onboarding/[projectSlug]/page.tsx` — **already renders the correct per-project
  connector URL inside `ProductShell`.** Story 2.1 is a nav registration plus a status line.
- `apps/web/lib/connector-tokens.ts` → `getActiveConnectorUrl(projectSlug)`.
- `apps/web/app/app/{funnel,impact}/[projectSlug]/[featureKey]/page.tsx` — both work. They are
  re-pointed, not rewritten.
- `apps/web/lib/tars-query.ts` → `getFeatureFunnel()`, and the North Star / impact query libs.
- `apps/web/lib/flag-list-view.ts` — `buildFlagListView` already projects per-environment state and
  paginates. The dormant collapse is a grouping over its output.
- `apps/web/app/app/flags/[projectSlug]/flag-console.tsx` — the list; extended, not replaced.
- `apps/web/app/app/flags/[projectSlug]/[flagKey]/page.tsx` — the per-feature destination that
  already carries insight, preview, versions and per-environment on/off. It is what makes deleting
  the JSON stack safe.
- `apps/web/lib/flags.ts` — 20+ existing `=== 'true'` gates; the new one goes here.
- `apps/web/app/app/{keys,flag-credentials,agent-keys}/[projectSlug]/page.tsx` — all three already
  `audience: 'owner'`; their checks move with them.

**Design artifacts (approved by the product owner, 2026-08-27):**
- `Roadmap/02-commercial/console-ia-overhaul/design/ia-audit.html` — all 19 surfaces placed, with
  the code evidence for every claim above.
- `Roadmap/02-commercial/console-ia-overhaul/design/flags-console-prototype.html` — the clickable
  prototype. **Reference material, not signed-off scope** (WAYS-OF-WORKING): it is what the
  acceptance criteria describe, not a pixel contract.

## UX heuristics & rails check

- **CI guards covering this surface:** the design-token guard (`scripts/check-design-drift.mjs`) —
  the shell is Tailwind-free and token-driven, so new chrome must use `references/design/assets/
  tokens.css` values, never raw hex. Playwright `api` covers route status/auth boundaries; the
  opt-in `browser` project covers rendered chrome.
- **Audits-lens findings that apply:** `00-ideas/audits/app-ux-audit-2026-08-01.md` §0, §1, §2.4,
  §3.3, §6.3, §6.7, §7 — the same audit that motivated `flags-console-parity`. Its §0/§1 findings
  about reaching a surface and relating surfaces to each other are what this epic actually answers;
  `flags-console-parity` only answered them inside one page.
- **Design-language debt:** the four bolted header links have no shared component; the `<details>`
  Sections disclosure is a bespoke pattern used nowhere else. Both are deleted rather than restyled.
- **The prototype is single-theme dark** because `apps/web/app/globals.css` sets
  `color-scheme: dark`. No light-mode work is implied or in scope.

## Kill-switch / runtime gate (risk: high)

**Recommended — a kill-switch story, enablement polarity.**

- **Flag:** `CONSOLE_SHELL_ENABLED` → `isConsoleShellEnabled()` in `apps/web/lib/flags.ts`, exactly
  `=== 'true'`, matching the 20 existing gates.
- **Polarity:** **enablement / dark-launch — default `false`, created DISABLED in every env**, and
  flipped deliberately in Story 3.5. This is a nav replacement, not a killable capability: the value
  of the flag is that the whole new IA can merge dark while its destinations are still being built.
- **Seam:** one resolver, read server-side in `page.tsx`/`ProductShell` and passed down — the same
  boundary `isFlagConsoleEnabled()` already uses. **No client ever reads `process.env`.** With it
  off, `ProductShell` renders today's header unchanged, which is auditable by `git diff` rather than
  promised in prose.
- **Mechanism:** Vercel env var. **Per AGENTS rule #4 a changed value needs a new commit to `main`
  to reach running functions** — setting the var is half the job.

## Acceptance criteria

Per story, in the sprint docs. The epic-level test the product owner runs:

1. With the gate **off**, `/app` and `/app/flags/miyagisanchez` render exactly as they do today.
2. With the gate **on**, the header shows one project switcher and four sections; no `Home`,
   `Sections`, `Connect` or `Agent notes`.
3. Every surface in the product is reachable in ≤3 clicks or one `⌘K`, with no URL typed.
4. `Setup › Connect` shows a connector URL containing **`miyagisanchez`'s** token, not the demo's.
5. `Setup › Keys` lists all four credential kinds; a non-owner 404s exactly as they do today.
6. `/app/flags/miyagisanchez` in Production shows two rows plus one summary line, and contains no
   textarea, no `Show JSON`, and no occurrence of the word *immutable*.
7. Opening a feature shows Funnel and Impact tabs with real numbers for a feature that is on.

## Open risks / research

- **`claude.ai/customize/connectors?modal=add-custom-connector` takes no URL parameter** — the modal
  has no field for pre-filling. The visitor pastes the copied URL themselves. This is already
  documented in `app/install/page.tsx` (verified against Miyagi's shipped `ConnectAgentPanel`), and
  Story 2.1 keeps the same copy-then-paste shape rather than inventing a deep link.
- **`getShellNav` must never throw** (its own doc comment says so — the shell wraps error states).
  Anything this epic adds to the shell inherits that.
- **Two feature registries** (TARS vs flag definitions) is a live inconsistency this epic surfaces
  and deliberately does not resolve. If the product owner wants them unified, that is a separate
  bet, and the Funnel tab's empty state is what will make the gap visible.
