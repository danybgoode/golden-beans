# Commercial shell — Sprint 2: The operate routes

**Status:** ✅ Merged — [PR #9](https://github.com/danybgoode/golden-beans/pull/9) (`b475a90`), CI
green, cross-agent advisory (Codex) findings fixed pre-merge (`538d557`). Deployed to production
automatically via the GitHub integration (confirmed: `gh api repos/.../deployments` shows `b475a90`
as the live Production deployment, status `success`). Post-merge production setup done via CLI:
`connector_tokens` migration applied (`supabase db push`), `SITE_URL` env var set and confirmed
live (the `/install` page's rendered SDK snippet shows the real prod URL, not `localhost`) — no
manual deploy was run. **Correction (2026-07-21):** Vercel does not update already-deployed
functions; every env change needs a later Git-tracked deployment before it is live.
**Still open (deferred to Sprint 3, not blocking):** the demo project's `connector_tokens` row
hasn't been minted in prod yet (`/install` there still says "not seeded" — harmless while
`CONNECTOR_ENABLED` stays off); the live Claude-session connector round-trip can't happen until
Story 3.3 flips that flag, so it isn't a Sprint 2 gap, it's a Sprint 3 dependency.

## Stories

### Story 2.1 — Read-only MCP connector v1 (ships dark) ✅
**As a** PM's agent, **I want** a tokenized MCP endpoint (opaque revocable per-project credential
in the URL path, pattern-lifted from mb `seller-agent-connect-mcp-url`) exposing **read-only**
tools — funnel, north-star, experiments for *your* project — **so that** the headline operate
route is real.
**Acceptance:** a fresh Claude session adds the connector via the deep-link and reads the demo
project's funnel; a token scoped to project A cannot read project B; revoking the token (DB row)
kills access without a deploy; the route no-ops 404/403 while `CONNECTOR_ENABLED` is unset
(**born dark** — Stage 6b); no write tools exist in v1.
**Risk:** **HIGH — Daniel merges.** New primitive (public route contract + token namespace) — the
cross-panel advisory offer stands; run it before this PR if Daniel wants it.
**Build note:** uses the real `@modelcontextprotocol/sdk` `Server` class (stateless
`WebStandardStreamableHTTPServerTransport`), not mb's hand-rolled JSON-RPC dispatcher — confirmed
with Daniel at plan time. Commit `5e85932`.

### Story 2.2 — Install page ✅
**As a** visitor, **I want** the install page (copy-your-URL field, "Add to Claude" deep-link,
`npx` wizard docs, plugin route teased for E2), **so that** each persona has a route in.
**Acceptance:** deep-link (`claude.ai/new?modal=add-custom-connector` — **re-verify at build
time**, last verified 2026-07-11) works on the free tier against the demo project; npx docs match
the real SDK surface.
**Risk:** LOW
**Build note:** re-verified live — the doc's `claude.ai/new?modal=...` guess was stale; the real
URL (confirmed in mb's shipped `ConnectAgentPanel.tsx`) is
`claude.ai/customize/connectors?modal=add-custom-connector`. There is no `npx` wizard/CLI in
`packages/sdk` (library import only) — docs describe `npm install` + the real SDK surface instead,
and the pre-existing "③ NPX WIZARD ✅ LIVE" landing-card mislabel is fixed to match. **Owed to
Daniel:** production needs a `SITE_URL` env var set before Sprint 3 flips the connector live (the
install page's URL-builder has no safe prod default — see `lib/site-url.ts`). Commit `33ffc1a`.

### Story 2.3 — Design-direction polish pass ✅
**As the** brand, **I want** a polish pass applying `references/design-direction.md` (roastery
world · agent-window frame · kraft/foil + dark-roast + brass materials · voice guardrails) with
the mb `frontend-design` heuristics checklist, **so that** the PostHog bar is met, not
approximated.
**Acceptance:** heuristics checklist run + noted in the PR; evidence-first ratio held (≥ half of
each viewport is real UI/numbers); fresh PostHog captures archived to `references/posthog/`;
fidelity checked against `references/design/` (Claude Design export) where it exists.
**Risk:** LOW
**Build note:** `globals.css` was already a faithful port of `tokens.css` (Sprint 1) — this pass
fixed a real spacing bug on `/install` (double section padding), extended the 390px overflow check
to `/install`, archived fresh PostHog captures (`references/posthog/`, still matches
design-direction.md's read), and ran the heuristics checklist against the new surface. The
claude-in-chrome browser extension wasn't connected in this environment — verified visually via
Playwright's own Chromium instead (desktop + 390px screenshots). Commit `bd7c434`.

## Sprint QA
- **api spec(s):** 2.1 → MCP round-trip with a disposable token (list tools, read demo funnel,
  cross-project 403, revoked-token 401, dark-flag 404)
- **browser smoke owed:** yes, to Daniel — **the connector smoke** (fresh Claude session:
  deep-link → add → query → revoke → confirm dead). Owed by name; an automated smoke can't cover
  the Claude-side UX.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 2 — Smoke walkthrough (do these in order)
Env: no per-branch Vercel preview yet (ci.yml's own header comment — ADR unchanged since Sprint 1
despite prod now being linked); run locally against `npm run build && npm run start` +
`supabase start` + `npm run seed:demo` pre-merge. Production `https://golden-beans-gamma.vercel.app`
post-merge — **connector stays dark there** until Story 3.3 flips `CONNECTOR_ENABLED` (and
**`SITE_URL` must be set in prod first** — owed to Daniel, see Story 2.2's build note — or the
install page's copy-URL field will render a broken `localhost` link in production).

1. With `CONNECTOR_ENABLED` unset (the default — don't set it), `curl -X POST` the MCP route
   directly with any token.
   → 404, `{"error":"Not found."}` — dark, confirmed locally this sprint.
2. Set `CONNECTOR_ENABLED=true` and restart. Run `npm run seed:demo` — it prints a real connector
   URL. Open `/install`, copy the demo URL, click **Add to Claude**.
   → Claude's add-custom-connector modal opens (it does **not** pre-fill the URL — paste the
   copied one manually, confirmed against mb's shipped UX). The connector lists exactly 3 tools:
   `get_tars_funnel`, `get_north_star`, `compare_experiment`.
3. Ask Claude for the demo project's funnel, North Star, and the `quick-upload-ui` experiment.
   → Real TARS numbers (targeted/adopted/retained), a real North Star series + WoW trend, and a
   real control/treatment conversion-rate comparison — matching the landing's live-proof section
   and this sprint's local verification exactly.
4. **(auth path — Daniel)** Revoke the demo token (Supabase Studio → `connector_tokens` →
   set `revoked_at`), ask Claude again.
   → Access dead within one request (401) — verified locally this sprint via a disposable token;
   the live Claude-session round-trip itself is owed to Daniel (an automated smoke can't drive
   Claude's own UI).

If any step fails, note the step number + what you saw — that's the bug report.

**Owed to Daniel (can't self-smoke):** the full Claude-session connector round-trip (deep-link →
add → query → revoke → confirm dead, step 2-4 above, live in Claude's own UI); setting `SITE_URL`
in production before Story 3.3's flag flip.
