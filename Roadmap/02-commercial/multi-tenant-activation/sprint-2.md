# Multi-tenant activation — Sprint 2: Self-serve activation

**Status:** 🟦 In review — all three stories built, deterministic gate green (128 `api` specs, 0 failed)

## How it was built (design notes, for the reviewer and for future-you)
- **`SIGNUP_ENABLED` is checked in FOUR places, not one** — the `/signup` page, the signup API
  route, the landing CTA, and (the non-obvious one) **the auth callback**. A gate checked only at
  the front door leaves a queue of already-sent confirmation links that can still create tenants
  after the flag is flipped back off.
- **Provisioning happens in the auth callback, never at signup.** That is what makes "unconfirmed
  accounts own no tenant" *structural* rather than a check someone can forget — an account that
  never completes the email round-trip never reaches the provisioner at all.
- **Idempotency is keyed on MEMBERSHIP, not on `created_by`** — a hand-seeded member signing in
  must not be handed a second, empty tenant.
- **No upsert on `slug`.** A plain INSERT with a retry on unique-violation. An
  `onConflict: 'slug', ignoreDuplicates` upsert would report success while writing nothing when
  the slug already belongs to someone else, and the provisioner would then hand back a plaintext
  key for a project the caller does not own — the exact cross-tenant bind cross-review caught in
  the S1 seed scripts (`Roadmap/LEARNINGS.md`).
- **The quota reuses the existing atomic counter**, at a month-long window, rather than a second
  table or a `COUNT(*)` per ingest (unbounded scan that gets slower as a tenant gets more
  valuable, and races the same way the naive rate limit did).
- **The one-time key reaches onboarding via an httpOnly cookie, never a query parameter** — a
  `?key=…` redirect writes the credential into access logs, browser history and any `Referer`.
- **Limits are per-project ROWS** (`monthly_event_quota`, `ingest_rate_per_min`), so raising a
  real customer's ceiling is an `UPDATE`, never a deploy. A spec demonstrates exactly that.

## Two bugs this sprint found in its own work (kept here deliberately)
1. **The month window was wrong first.** Flooring `Date.now()` by "milliseconds in this month"
   lands on an arbitrary multiple of that duration since the Unix epoch, *not* on the 1st — every
   quota would have reset on a wandering date matching no calendar. No HTTP spec could have seen
   it (the counter still counts, just against the wrong bucket); the fix was to extract the maths
   into a pure module and assert it directly.
2. **The audit log was not actually append-only.** The migration granted `SELECT, INSERT` and a
   comment claimed the trail could not be rewritten. False: Supabase's default privileges already
   grant `service_role` ALL on new public-schema tables, so a narrower GRANT is purely additive
   and revokes nothing. A spec that *attempted the UPDATE with the app's own client* caught it; an
   explicit `REVOKE` is what made the claim true.

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

## Known limitation — our signup route is not the only way to create an account
Cross-review (Codex, round 3) is right about this and it must not be glossed: the Supabase **anon
key is public by design** (it is inlined into the client bundle), so anyone can call Supabase
Auth's `signUp` endpoint directly and create an account **without passing our gate, honeypot, or
IP rate limit**. Those guards protect *our* route, not account creation as such.

What still holds, and why this isn't a hole in the epic's actual promise:
- **`SIGNUP_ENABLED=false` still means no tenants.** The gate is re-checked in `/auth/callback`
  and `/app/provision`, both of which run server-side, so a directly-created account gets **no
  project, no membership, no key** while the flag is off. It is an inert `auth.users` row.
- Once the flag is on, a bypassing signup lands a tenant whose blast radius is bounded by Story
  2.2's per-project quota and per-key rate limit.

**Owed to Daniel before/at the 3.3 flip** (Supabase Dashboard, not code):
1. Consider **disabling public signups** in Auth settings and letting provisioning run through the
   admin API server-side — that makes our route the only path, structurally.
2. At minimum, set Supabase's own **Auth rate limits** (per-IP signup + email send), which is the
   layer that actually governs the direct path.

## Sprint QA
- **api spec(s) — shipped:** `e2e/signup.spec.ts` (gate polarity incl. the "opens on a typo" cases ·
  gate-OFF 404 on both the route and the page, indistinguishable across well-formed/malformed/empty
  payloads · slug derivation incl. the reserved/demo-slug hijack · month-window maths) and
  `e2e/ingest-guardrails.spec.ts` (payload cap 413 with nothing persisted · per-key rate limit ·
  the limit being per-KEY not per-project · over-quota 429 naming the reset date · quota isolation
  between two tenants · ceiling-raise-without-deploy · audit-log append-only).
- **Mutation-checked** (`Roadmap/LEARNINGS.md` — "a spec that passes is not a spec that can
  fail"): the signup gate was re-broken to a truthiness check, the reserved-slug guard removed,
  and the original month-window bug reintroduced. All three mutations were caught by the specs
  that claim to defend them; restored and re-verified green afterward.
- **Why so much is asserted on pure modules rather than over HTTP:** the gate is OFF in CI, so the
  only signup behaviour an HTTP spec can reach is the 404. Everything past the gate sits behind a
  real email round-trip this harness cannot perform — the exact structural trap that let S1's
  open-redirect specs pass against a deliberately vulnerable build.
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
