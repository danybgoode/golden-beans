# Multi-tenant activation — Sprint 3: The flip (landing backfill + trials live)

**Status:** ✅ 3.1 + 3.2 merged (PR #14 → `bbaffd2`). ✅ **3.3 — the gate is FLIPPED in production**
(`SIGNUP_ENABLED=true`, 2026-07-21). Signup is live at `https://golden-beans-gamma.vercel.app/signup`.

> ### ✅ LAUNCHED — a real user activated fully self-serve (2026-07-21)
> The Supabase Auth redirect allow-list was configured (Dashboard → Authentication → URL
> Configuration), and a real signup ran end-to-end in production. It was deliberately not automated:
> the only CLI path is `supabase config push`, which pushes the *entire local* `config.toml`
> (including `site_url = http://127.0.0.1:3000`) over production auth config — the "a full deploy
> replaces the ENTIRE config" trap in `LEARNINGS.md`.
>
> **Verified in the production database, not assumed:** the `miyagi` tenant has `created_by` set,
> 1 owner membership, 1 active API key, 1 connector token, and the `first_integration` starter
> feature. `signup_started → account_confirmed` are both tagged `activation` and share **one user
> id**, 39 seconds apart. `audit_log` holds `signup_requested` then `tenant_provisioned`.
>
> **Remaining gap:** `first_event_ingested` has no real data — nobody has pasted the onboarding
> snippet yet, and the tenant's `first_event_at` is null.

**Flip record:** `SIGNUP_ENABLED=true` set on the Vercel Production scope 2026-07-21. **A redeploy
WAS required** — contrary to what `AGENTS.md` claimed at the time; the flag stayed dark for 7+
minutes until commit `c3876a8` triggered a build. Both docs are corrected.

**Verified live after the flip:** `/signup` 200 · signup API validates (400 on a bad payload) ·
landing hero shows "Start free" · §7 shows `SELF-SERVE · LIVE` + honest tiers with **no `<form>` on
the page at all** (the waitlist form is gone from the DOM, not hidden) · `/install` and the landing
still 200 · an invalid ingest key still returns **401, not 500** (schema and code agree).

## What "the flip" actually is now
Set `SIGNUP_ENABLED=true` in the Vercel production env, then create a new Git-tracked deployment.
All four gates read the value fresh within a running deployment, but Vercel snapshots that
deployment's environment at build time. Flipping it back off likewise needs a Git-tracked redeploy
to become a complete rollback, including for confirmation links already sitting in inboxes (the
callback re-checks the gate).

## Stories

### Story 3.1 — Landing §1 hero flip + §7 honest tiers
**As a** visitor, **I want** the hero CTA flipped from waitlist to "Start free" and the
pricing/tenancy section showing honest tiers (free pilot · pods = "talk to us" — no fake pricing,
no payment rail), **so that** the public offer matches reality. Goes through E1's section↔epic
registry; renders the signup CTA only when `SIGNUP_ENABLED` is on.
**Acceptance:** gate ON → signup CTA + §7 tiers; gate OFF → waitlist unchanged; badges flip per
the backfill contract (`references/landing-end-state.md` §1/§7).
**Risk:** LOW (public content, gated)

### Story 3.2 — Waitlist retirement *(re-scoped 2026-07-20 — see note)*
**As a** visitor, **I want** the waitlist to disappear the moment self-serve signup is real, **so
that** the page never asks me to queue for something I can just start.
**Acceptance:** gate ON → §7 shows the signup CTA and the waitlist form is gone from the page;
gate OFF → the waitlist is unchanged and still works; the waitlist API route survives either way
(it is the gate-OFF fallback, not dead code).
**Risk:** LOW

> **Why this changed.** The original story was "waitlist → invite conversion" — a converter that
> walks E1's queue and invites each entry into signup. **The queue is empty (0 rows, checked
> against production 2026-07-20) and this product has never been promoted**, so that converter
> would ship with nothing to convert and no way to test it against a real row. Per
> WAYS-OF-WORKING's orientation rule ("surface the existing-features path first; build new only
> when the outcome genuinely needs it"), the outcome that actually matters here is the *landing
> backfill contract* — the public offer must match shipped reality — and retiring the waitlist
> achieves that directly. If a queue ever accumulates before the flip, the manual path is one
> line: signup is open, send them the URL.
>
> **Deliberately NOT built here:** an owner inviting a *teammate* into an existing project.
> `project_members` still only grows by hand-seeded SQL or by self-serve signup (which makes you
> the owner of your *own* new project). That is real missing capability, but it is team
> management, not activation — logged as a seed for a later epic rather than smuggled into this
> one.

### Story 3.3 — Activation launch
**As** Daniel, **I want** the launch: flip `SIGNUP_ENABLED` in production, dogfood funnel live
(`signup_started → account_confirmed → first_event_ingested`, golden-beans as its own tenant),
trial checklist run end-to-end, announce.
**Acceptance:** flip recorded (env + date); the activation funnel renders real signups in the
engine; at least one pod-trial tenant activated fully self-serve.
**Risk:** HIGH — Daniel flips/merges

## Sprint QA
- **api spec(s):** 3.1 → CTA/§7 render both gate states · 3.2 → waitlist form absent when the gate
  is on, present + still POSTable when it's off
- **browser smoke owed:** yes, to Daniel — production flip + one real self-serve pod-trial
  activation (auth path, production env)
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 3 — Smoke walkthrough (do these in order)
Env: production `https://golden-beans-gamma.vercel.app` (this sprint is the flip)

1. Before the flip, open `/` in a private window.
   → Hero shows the waitlist; §7 shows "hand-provisioned pilots".
2. Set `SIGNUP_ENABLED=true` in the Vercel production env, then trigger a new deployment with a
   commit to `main` (never a manual CLI deploy, which violates AGENTS rule #4). *(flip — owed to Daniel)*
   → Hero shows "Start free"; §7 shows the tiers.
   Also check §7: the waitlist form is gone, replaced by the tiers + "Start free".
3. Sign up from the flipped landing with a fresh email. *(auth path — owed to Daniel)*
   → Signup → confirm → tenant + key + onboarding, no manual steps.
4. Open the golden-beans dogfood funnel in `/app`.
   → `signup_started → account_confirmed → first_event_ingested` shows your test activation.
5. Ask a real pod-trial prospect (or a second test identity) to activate unaided.
   → They reach first ingested event without you touching the database.

If any step fails, note the step number + what you saw — that's the bug report.
