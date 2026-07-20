# Commercial shell — Sprint 3: Launch & dogfood

**Status:** 🟨 In progress — Stories 3.1 + 3.2 merged to `main` ([PR #11](https://github.com/danybgoode/golden-beans/pull/11), squash `7b24502`), deployed to production automatically via the GitHub integration. Story 3.3 (the launch itself) is a checklist of named product-owner actions, not yet executed — see below.

## Stories

### Story 3.1 — Dogfood instrumentation ✅
**As the** team, **I want** the landing instrumented by the engine itself (`golden-beans` as its
own tenant: visitor → waitlist TARS funnel via the real SDK), **so that** we sell what we use and
the epic's Grower signal is measurable.
**Acceptance:** a real visitor→waitlist funnel renders in the engine; the Grower signal (waitlist
conversion rate) is defined in the registry; landing traffic never mixes into the demo or Miyagi
projects.
**Risk:** LOW
**Build note:** the landing now dogfoods the engine as a THIRD tenant (`golden-beans`, separate
from `golden-beans-demo` and Miyagi), through the real `@golden-beans/sdk` — no parallel pipeline
(AGENTS.md rule #1). New `lib/self-track.ts` wraps `createGrowthEngineClient` (baseUrl `getSiteUrl()`,
key from `SELF_PROJECT_API_KEY`); it is **total** — no key ⇒ clean no-op, SDK errors swallowed+logged,
never throws into the request path or blocks the response (CI's `typecheck-build` runs with zero
Supabase env). Funnel identity is a `gb_vid` visitor cookie: since a Server Component can't set
cookies, the entry event fires from a new Route Handler `POST /api/v1/public/self-visit` (mints the
cookie, fires `landing_visited`), driven by an invisible client beacon `SelfTrackBeacon` on `/`; the
conversion `waitlist_joined` is fired from the existing waitlist route's **successful, non-honeypot**
insert path under the SAME cookie (the honeypot's silent-success returns before it, so a bot never
counts). Grower signal registered via a real `POST /api/v1/features/sync`: `waitlist_conversion`
(`landing_visited` → `waitlist_joined`) by new idempotent `scripts/seed-self-project.mjs`
(`npm run seed:self`), sibling to the demo seeder — project row = direct upsert, signal = real API;
it refuses to run if `SELF_PROJECT_SLUG === DEMO_PROJECT_SLUG`. Isolation is structural (tenant
resolved from the Bearer key server-side, never a slug/body field) and asserted in
`e2e/self-track.spec.ts`. Env vars for prod (owed to the integrating session): **`SELF_PROJECT_SLUG`**
(optional, default `golden-beans`) and **`SELF_PROJECT_API_KEY`** (from the seed script's printout).
**Verify gap:** `tsc --noEmit` + `npm run build` clean; the Playwright `api` project (incl. this
spec) could NOT be run here — Docker/local Supabase was unavailable in the worktree — so the e2e
gate + a real red run are owed; the spec's mutation check (removing self-track's no-op guard ⇒ 500s
⇒ first two tests red) is reasoned, not observed. Commit `c029622`.

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

### Cross-agent review (Codex + Agy) — fixed pre-merge
Per the updated `WAYS-OF-WORKING.md` process (this sprint's experiment), both reviews ran as the
judgment-layer pass in place of a same-family Claude reviewer. Blocking findings fixed:
- **`scripts/seed-self-project.mjs` silently rotated the prod API key on a bare re-run** (Codex) —
  a re-run with `SELF_PROJECT_API_KEY` unset minted a fresh random key and overwrote the existing
  project's hash, silently invalidating whatever key the running app was configured with. Fixed:
  `provisionProject()` now looks up the existing row first and leaves an already-provisioned
  project's credential untouched unless `SELF_PROJECT_API_KEY` is explicitly passed; `main()`
  handles the resulting "can't re-authenticate to re-sync" case by saying so plainly instead of
  crashing or silently skipping.
- **The waitlist route and the self-visit route both `await`ed `trackSelfEvent` inline** (Codex),
  which (a) could hold the waitlist response open on a slow/hung self-tracking call after the real
  join had already succeeded, and (b) delayed the self-visit route's `Set-Cookie` behind that same
  network round-trip — a fast follow-up request could arrive before the visitor cookie was even
  delivered, minting a second identity and disconnecting visit from join. Fixed: both now fire
  `trackSelfEvent` via `next/server`'s `after()`, never inline-awaited before the response is
  built; `self-track.ts` also gained a 3s `AbortSignal.timeout()` on the underlying fetch as
  defense-in-depth.
- **`self-visit` had no rate limiting**, unlike every other unauthenticated public write in this
  app (Agy, filed against AGENTS.md rule #2 — the underlying concern is real even though the route
  doesn't trust a slug, so rule #2 wasn't quite the right citation: an anonymous caller could flood
  the route and inflate `landing_visited`, skewing the Grower signal). Fixed: same
  `checkRateLimit`/`hashIp` primitive as the waitlist route, a looser per-minute cap (once per real
  page load, not once per human decision).
- **CI never actually exercised the funnel-isolation spec** (Codex — the "configured" path was
  optional and always skipped). Fixed: `ci.yml` now runs `npm run seed:self` (a fresh CI Supabase
  never already has this project, so it always takes the mint-a-real-key path) and exports the
  printed key as `SELF_PROJECT_API_KEY`, so `self-track.spec.ts`'s isolation test runs for real on
  every PR instead of perpetually skipping.
- Regenerated `Roadmap/00-ideas/BUILD-ORDER.md` (Codex caught it reporting a stale progress count).
- Two Agy nits (an "unused" `randomUUID` import, an "unused" `Metadata` type import) were checked
  against the diff and are both false positives — `randomUUID` is used as the cookie-absent
  fallback, `Metadata` types `generateMetadata()`'s return — no change made.

**Round 2** (re-ran both reviews against the fixes above): Codex found the identity race wasn't
fully closed and CI confirmed it live — the very first `e2e` run after `after()` landed hit exactly
this, failing `funnel events land in the self tenant and NEVER the demo project` because the DB
read raced the now-deferred write (`Received Array []`, expected `["golden-beans"]`). Two fixes:
- **The visitor cookie is now minted client-side, synchronously** (`SelfTrackBeacon.tsx`, via
  `document.cookie`, before firing the beacon POST) instead of relying on the self-visit route's
  `Set-Cookie` — a network round-trip (even a fast, non-blocking one) is never as fast as an
  in-memory same-tick write, and the route can no longer win a race against a real user action.
  The server-side mint stays as a fallback for non-JS/API callers.
- **`e2e/self-track.spec.ts`'s isolation test now polls** (`pollForEvents`, 200ms/5s bounded) for
  both events instead of reading immediately after the response — the exact fix the live CI failure
  called for.
Also corrected the spec's own header comment: the earlier "mutation check" claim no longer holds
now that tracking runs via `after()` (a route's response can't reflect a tracking failure that
happens after the response is already sent), and CI now always configures `SELF_PROJECT_API_KEY`
globally, so the "unset key" no-op branch is no longer independently exercised by any automated
run — verified by code inspection only (a one-line guard), stated as an accepted gap rather than
silently dropped.

**Round 3 — a real CI ordering bug, caught by actually running it**: even with the poll fix, the
`e2e` job still failed, but now with a genuine `0/2 events after 5000ms` (not a race — the events
simply never landed). Root cause: `ci.yml`'s "Seed the self-tracking project" step exported
`SELF_PROJECT_API_KEY` into `$GITHUB_ENV` AFTER "Start the app in the background" had already
forked the `npm run start` process — a value added to `$GITHUB_ENV` reaches later STEPS' shells,
never an already-running background process's env, so every self-track call for the rest of the
job silently no-op'd (no error; that's the whole design). Fixed by reordering: a new early step
generates the key via `openssl rand -hex 24` and exports it to `$GITHUB_ENV` **before** the server
starts (so the server boots already knowing it), and the seed step passes the SAME value as
`SELF_PROJECT_API_KEY` (already ambient) so the DB's stored hash matches what the running server
expects, instead of minting a second, different key nobody told the server about. This is exactly
the kind of gap only real execution catches — a purely static review of either the app code or the
workflow file in isolation wouldn't surface a cross-step env-propagation-timing bug.

### Story 3.3 — Launch checklist ⬜ (mechanical prep done; the launch actions themselves are Daniel's)
**As** Daniel, **I want** the launch executed: domain decision (**paid infra ⇒ Daniel green-lights
before provisioning; staying on `golden-beans-gamma.vercel.app` is a valid v1 outcome**),
`CONNECTOR_ENABLED` flipped ON in production (the deliberate enablement flip), waitlist live,
announce.
**Acceptance:** checklist executed and recorded in this doc; flip time-stamped; landing sections
match shipped reality (backfill check).
**Risk:** **HIGH — Daniel merges/flips.** The flip and any domain purchase are named
product-owner actions (LEARNINGS: broad wrap-up authorization never covers deploy/credential/paid
actions — each is opted into by name).

**Backfill check (done):** re-verified every `next`-status entry in `lib/landing-sections.ts`
against its epic's frontmatter — `signals-loop`, `pod-report`, and `multi-tenant-activation` are
all still `status: scaffolded` (unshipped), so `inverted-loop`/`pods-proof`/`pricing` staying
badged `next` is accurate, not stale. No section claims shipped work it hasn't earned. Nothing in
3.1/3.2 lit up a NEW landing section (dogfood instrumentation and the SEO manifest are both
infrastructure, not a section on `references/landing-end-state.md`'s map), so no registry entry
needed to flip.

**Waitlist live (confirmed):** has been live in production since Sprint 1 (`d3b19ed`); unaffected
by this sprint beyond the new dogfood tracking hook on its success path (3.1, already merged).

**Everything else is a named product-owner action, not run this session** (per this story's own
HIGH-risk tier and the repeated cross-session pattern of NOT inferring these from a broad
authorization — see `Roadmap/LEARNINGS.md` and team memory). A checklist, ready for you to execute
in any order:

- [ ] **Set `SELF_PROJECT_API_KEY` in production** — a copy-pasteable kit is in this session's
  reply (mint via `scripts/seed-self-project.mjs` against prod Supabase, then `vercel env add`).
  Until this is set, Story 3.1's dogfood funnel silently no-ops in prod (by design — never breaks
  the page) but reports nothing real yet.
- [ ] **Mint the demo project's `connector_tokens` row in prod** — still open since Sprint 2
  (confirmed still unminted this session via a read-only query); harmless while the connector
  stays dark, but needed before step 4 of the smoke walkthrough below can run at all.
- [ ] **Domain decision** — provision a custom domain (paid infra, your green-light required first)
  or explicitly confirm staying on `golden-beans-gamma.vercel.app` for v1 (also a valid, no-cost
  outcome per the epic README).
- [ ] **Flip `CONNECTOR_ENABLED=true` in production** — the deliberate enablement flip; timestamp
  it here once done, then run the connector round-trip smoke (walkthrough step 4 below).
- [ ] **Announce** — say the word if you'd like a draft announcement post/email; not written
  speculatively here since tone/channel is your call.

Once all five are done, tick this story and flip the epic README's frontmatter to `shipped`.

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
