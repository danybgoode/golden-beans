# Multi-tenant activation — Sprint 2: Self-serve activation

**Status:** ⬜ not started

## Stories

### Story 2.1 — Signup → instant tenant + first key (ships dark)
**As a** prospect, **I want** signup to provision a working tenant instantly (project + first API
key + my membership) once I confirm my email, **so that** I can trial without waiting on a human.
Guardrails: rate-limit + honeypot (lift E1's waitlist guards), email confirmation before
provisioning, everything behind the `SIGNUP_ENABLED` env gate (**born OFF** — Stage 6b).
**Acceptance:** confirmed signup → tenant + key visible in `/app`; gate OFF → signup route 404s
and the landing still shows the waitlist; unconfirmed accounts own no tenant.
**Risk:** HIGH — Daniel merges

### Story 2.2 — Isolation guardrails + credential audit trail
**As the** operator, **I want** per-tenant event quotas, payload caps, and per-key ingest rate
limits, plus an audit trail of signup/credential actions, **so that** open signup can't hurt real
tenants or the bill.
**Acceptance:** over-quota ingest → 429 with a clear body (and the SDK degrades silently —
fire-and-forget); audit rows exist for issue/rotate/revoke/signup; quota values configurable
per project row, not hardcoded.
**Risk:** HIGH — Daniel merges (shared ingest path)

### Story 2.3 — First-run onboarding
**As a** new tenant, **I want** first-run onboarding — copy-your-MCP-URL ("Add to Claude"
deep-link) + a ≤5-line SDK snippet pre-filled with *my* key, **so that** time-to-first-event is
minutes. Reuses E1's install page, rendered per-tenant.
**Acceptance:** a fresh signup reaches their first ingested event following only on-screen steps;
the funnel page shows it.
**Risk:** LOW

## Sprint QA
- **api spec(s):** 2.1 → signup validation · rate-limit · gate-OFF 404 · no-tenant-before-confirm ·
  2.2 → over-quota 429 · audit-row presence
- **browser smoke owed:** yes, to Daniel — full self-serve pass in a fresh browser: signup →
  confirm email → copy key → first event → funnel renders (auth path, needs a real inbox)
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 2 — Smoke walkthrough (do these in order)
Env: preview URL pre-merge (gate ON in preview env only) · production stays dark until 3.3

1. With `SIGNUP_ENABLED` unset/false, open the signup URL.
   → 404; landing hero still shows the waitlist.
2. On the preview (gate ON), sign up with a disposable test email. *(auth path — owed to Daniel)*
   → Confirmation email arrives; before confirming, `/app` shows no tenant.
3. Confirm the email.
   → A project + API key exist in `/app`; the onboarding screen shows your MCP URL + SDK snippet.
4. Paste the snippet into a scratch page/script and fire one event.
   → The event appears in your funnel page within ~a minute.
5. Re-run the signup form rapidly 10×.
   → Rate-limited well before 10; no duplicate tenants.

If any step fails, note the step number + what you saw — that's the bug report.
