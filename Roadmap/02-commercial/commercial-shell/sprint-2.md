# Commercial shell — Sprint 2: The operate routes

**Status:** 🟨 In progress

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

### Story 2.3 — Design-direction polish pass
**As the** brand, **I want** a polish pass applying `references/design-direction.md` (roastery
world · agent-window frame · kraft/foil + dark-roast + brass materials · voice guardrails) with
the mb `frontend-design` heuristics checklist, **so that** the PostHog bar is met, not
approximated.
**Acceptance:** heuristics checklist run + noted in the PR; evidence-first ratio held (≥ half of
each viewport is real UI/numbers); fresh PostHog captures archived to `references/posthog/`;
fidelity checked against `references/design/` (Claude Design export) where it exists.
**Risk:** LOW

## Sprint QA
- **api spec(s):** 2.1 → MCP round-trip with a disposable token (list tools, read demo funnel,
  cross-project 403, revoked-token 401, dark-flag 404)
- **browser smoke owed:** yes, to Daniel — **the connector smoke** (fresh Claude session:
  deep-link → add → query → revoke → confirm dead). Owed by name; an automated smoke can't cover
  the Claude-side UX.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 2 — Smoke walkthrough (do these in order)
Env: preview URL pre-merge · production post-merge (connector stays dark until 3.3)

1. With `CONNECTOR_ENABLED` unset, request the MCP route directly.
   → 404/403 — dark.
2. On the preview (flag set), open the install page, copy the demo URL, click "Add to Claude".
   → Claude opens the add-connector modal pre-filled; the connector lists read-only tools.
3. Ask Claude for the demo project's funnel.
   → Real TARS numbers, matching the landing's live-proof section.
4. **(auth path — Daniel)** Revoke the demo token, ask again.
   → Access dead within one request; no deploy happened.

If any step fails, note the step number + what you saw — that's the bug report.
