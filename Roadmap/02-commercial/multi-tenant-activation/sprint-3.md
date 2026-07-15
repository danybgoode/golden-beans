# Multi-tenant activation — Sprint 3: The flip (landing backfill + trials live)

**Status:** ⬜ not started

## Stories

### Story 3.1 — Landing §1 hero flip + §7 honest tiers
**As a** visitor, **I want** the hero CTA flipped from waitlist to "Start free" and the
pricing/tenancy section showing honest tiers (free pilot · pods = "talk to us" — no fake pricing,
no payment rail), **so that** the public offer matches reality. Goes through E1's section↔epic
registry; renders the signup CTA only when `SIGNUP_ENABLED` is on.
**Acceptance:** gate ON → signup CTA + §7 tiers; gate OFF → waitlist unchanged; badges flip per
the backfill contract (`references/landing-end-state.md` §1/§7).
**Risk:** LOW (public content, gated)

### Story 3.2 — Waitlist → invite conversion
**As a** waitlisted prospect, **I want** an invite that takes me straight into signup, **so that**
E1's queue converts into activated tenants.
**Acceptance:** invite → signup → tenant; duplicate-safe against already-registered emails;
waitlist row marked converted.
**Risk:** LOW

### Story 3.3 — Activation launch
**As** Daniel, **I want** the launch: flip `SIGNUP_ENABLED` in production, dogfood funnel live
(`signup_started → account_confirmed → first_event_ingested`, golden-beans as its own tenant),
trial checklist run end-to-end, announce.
**Acceptance:** flip recorded (env + date); the activation funnel renders real signups in the
engine; at least one pod-trial tenant activated fully self-serve.
**Risk:** HIGH — Daniel flips/merges

## Sprint QA
- **api spec(s):** 3.1 → CTA/§7 render both gate states · 3.2 → invite flow + duplicate safety
- **browser smoke owed:** yes, to Daniel — production flip + one real self-serve pod-trial
  activation (auth path, production env)
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 3 — Smoke walkthrough (do these in order)
Env: production `https://golden-beans-gamma.vercel.app` (this sprint is the flip)

1. Before the flip, open `/` in a private window.
   → Hero shows the waitlist; §7 shows "hand-provisioned pilots".
2. Flip `SIGNUP_ENABLED` in the Vercel production env + redeploy. *(flip — owed to Daniel)*
   → Hero shows "Start free"; §7 shows the tiers.
3. Send an invite to a waitlisted test email; follow it end-to-end. *(auth path — owed to Daniel)*
   → Signup → confirm → tenant + key + onboarding, no manual steps.
4. Open the golden-beans dogfood funnel in `/app`.
   → `signup_started → account_confirmed → first_event_ingested` shows your test activation.
5. Ask a real pod-trial prospect (or a second test identity) to activate unaided.
   → They reach first ingested event without you touching the database.

If any step fails, note the step number + what you saw — that's the bug report.
