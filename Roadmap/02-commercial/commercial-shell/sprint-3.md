# Commercial shell — Sprint 3: Launch & dogfood

**Status:** ⬜ not started

## Stories

### Story 3.1 — Dogfood instrumentation
**As the** team, **I want** the landing instrumented by the engine itself (`golden-beans` as its
own tenant: visitor → waitlist TARS funnel via the real SDK), **so that** we sell what we use and
the epic's Grower signal is measurable.
**Acceptance:** a real visitor→waitlist funnel renders in the engine; the Grower signal (waitlist
conversion rate) is defined in the registry; landing traffic never mixes into the demo or Miyagi
projects.
**Risk:** LOW

### Story 3.2 — SEO/OG + agent-readable manifest ✅
**As a** searcher (human or agent), **I want** correct meta/OG unfurls and an `llms.txt`-style
manifest listing the public routes and connector docs, **so that** both audiences parse the offer.
**Acceptance:** link unfurls with a correct card in a chat app; manifest served and accurate.
**Risk:** LOW
**Build note:** used Next's file-based `opengraph-image.tsx`/`twitter-image.tsx` convention
(`next/og`'s `ImageResponse`, shared JSX in `lib/og-image-content.tsx`) instead of hand-building
`<meta>` tags — no design asset exists in this repo yet (no `apps/web/public/` dir), and the
convention wires up `og:image:width/height/type` automatically. `app/layout.tsx`'s `metadata`
export became an async `generateMetadata()` (not a static object) specifically so `openGraph.url`/
`metadataBase` call `getSiteUrl()` live per request instead of baking in whatever `SITE_URL` (or
none) happened to be set at CI's build time — same rationale `app/page.tsx` already documents for
`force-dynamic`. The manifest lives at `app/llms.txt/route.ts` (a literal `llms.txt` folder name
— confirmed this resolves to `GET /llms.txt` via a real `npm run build` + `npm run start`), builds
every listed URL from `getSiteUrl()`, and lists only what's live this sprint: `/`, `/install`, and
the MCP connector's route shape (`POST /api/v1/public/mcp/c/{token}`, `{token}` documented as a
placeholder, not a literal path — real tokens are minted per project via `/install`). Verified
manually: `npm run build && npm run start`, then `curl`'d `/llms.txt` and the homepage's rendered
`<head>` for the real `og:`/`twitter:` meta tags, and opened `/opengraph-image` directly to confirm
a real on-brand (dark-roast/gold, `references/design-direction.md`) PNG renders. The new Playwright
spec (`e2e/llms-txt.spec.ts`, `api` project) asserts the manifest is 200/plain-text, lists the real
routes, and — via a deliberate mutation check (hardcoded a wrong-env URL into the route, rebuilt,
confirmed the spec went red, then reverted and confirmed green again; written after the code, so a
mutation check stood in for a true red-first TDD run) — that its URLs are actually built from
`getSiteUrl()` live rather than a drifted/hardcoded string. **Owed to Daniel:** the actual "paste
the link into a chat app, see the card unfurl" check is inherently a manual/visual smoke — an API
spec can assert the `<meta>` tags are correct and the image PNG renders, but not how Slack/Discord/
iMessage/etc. actually render the unfurl; noted in the Sprint 3 smoke walkthrough below as step 3,
same "owed to Daniel" pattern as Sprint 2's live connector round-trip. Also owed: this environment
had no Docker daemon available, so the full Supabase-backed `npm run test:e2e` `api` suite couldn't
be run end-to-end here — verified instead via `npx tsc --noEmit`, `npm run build`, and running the
new spec alone against a real `npm run start` server (including the red/green mutation check
above); re-run the full suite once in an environment with Docker/Supabase before merge.

### Story 3.3 — Launch checklist
**As** Daniel, **I want** the launch executed: domain decision (**paid infra ⇒ Daniel green-lights
before provisioning; staying on `golden-beans-gamma.vercel.app` is a valid v1 outcome**),
`CONNECTOR_ENABLED` flipped ON in production (the deliberate enablement flip), waitlist live,
announce.
**Acceptance:** checklist executed and recorded in this doc; flip time-stamped; landing sections
match shipped reality (backfill check).
**Risk:** **HIGH — Daniel merges/flips.** The flip and any domain purchase are named
product-owner actions (LEARNINGS: broad wrap-up authorization never covers deploy/credential/paid
actions — each is opted into by name).

## Sprint QA
- **api spec(s):** 3.1 → landing events land in the gb tenant (and only there) · 3.2 → manifest
  route contents
- **browser smoke owed:** yes, to Daniel — production waitlist submission + unfurl check +
  post-flip connector round-trip
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 3 — Smoke walkthrough (do these in order)
Env: production · `https://golden-beans-gamma.vercel.app` (or the custom domain if 3.3 decides one)

1. Visit the landing in a private window, then join the waitlist with a disposable email.
   → Confirmation state.
2. Open the engine's funnel view for the `golden-beans` tenant.
   → Your visit and signup appear in the visitor→waitlist funnel.
3. Paste the landing URL into a chat app.
   → OG card unfurls with Golden Beans branding.
4. **(flip — Daniel)** After `CONNECTOR_ENABLED` is ON: run the story 2.1 connector round-trip
   against production.
   → Works; token revocation still kills instantly.

If any step fails, note the step number + what you saw — that's the bug report.
