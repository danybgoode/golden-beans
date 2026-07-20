# Event destination router — Sprint 3: CRM proof and operating view

**Status:** ⬜ not started

## Stories

### Story 3.1 — Miyagi merchant-lifecycle projection proof

**As Miyagi's** activation team, **I want** merchant lifecycle events delivered into a Miyagi-owned projection,
**so that** product behavior updates the relationship pipeline without manual reconciliation.

**Acceptance:** permission, preview approval, claim, three-products-live, first-sale and 30-day-retained fixtures
update the correct disposable merchant; replay is idempotent by event id; PII is absent from event metadata;
Medusa remains the source for shop/product/order facts; either side can be unavailable without losing events.

**Risk:** high — cross-repo contract and Miyagi DB migration; Daniel merges both PRs.

### Story 3.2 — Optional Attio adapter proof

**As a** three-person pilot team, **I want** an optional Attio mirror, **so that** I can operate in a polished
CRM UI while Miyagi remains canonical.

**Acceptance:** configured merchant/contact/opportunity mapping is idempotent; provider outage appears in
delivery history but never blocks Miyagi; token is scoped and revocable; deleting the adapter loses no canonical
history; unsupported free-tier behavior degrades with an explicit operator message.

**Risk:** high — external credential and mutable vendor contract; Daniel merges and owns the real-workspace smoke.

### Story 3.3 — Delivery operating view and public-offer backfill

**As a** tenant owner, **I want** destination health summarized in `/app` and the public primitive described
honestly, **so that** I can see whether delivery works and prospects understand what is actually shipped.

**Acceptance:** view shows enabled sinks, success/failure/retry counts and last delivery without secret/PII;
landing primitive flips from future to shipped only after the dispatcher and CRM proof are live; no exactly-once
claim is made.

**Risk:** low — read-only UI/copy over shipped server contracts.

## Sprint QA

- **contract specs:** identical lifecycle fixtures run in Golden Beans and Miyagi suites; replay proves the
  projection idempotent.
- **adapter specs:** Attio HTTP behavior mocked for create/update/rate-limit/outage; no live token in CI.
- **browser smoke owed:** yes to Daniel for the real Attio workspace and authenticated delivery-health view.
- **deterministic gate:** both repos' typecheck/build/API gates green before merge; Miyagi consumer merges first
  or degrades safely until Golden Beans delivery turns on.

## Sprint 3 — Smoke walkthrough (do these in order)

Env: production · https://golden-beans-gamma.vercel.app + https://miyagisanchez.com

1. Create the documented disposable merchant in Miyagi and perform the preview-approved fixture.
   → Golden Beans delivery history shows one successful merchant event.
2. Open Miyagi's merchant activation record for that disposable merchant.
   → Its lifecycle projection shows preview approved once with the correct timestamp.
3. Replay the same Golden Beans delivery.
   → The Miyagi record remains one logical milestone, with replay visible only in delivery history.
4. Open the pilot Attio workspace.
   → The same merchant is present once; if Attio is disabled, Miyagi remains complete and Golden Beans names
   the adapter as disabled rather than failed.
5. Open https://golden-beans-gamma.vercel.app/app and then https://golden-beans-gamma.vercel.app/.
   → Authenticated delivery health is visible without secrets; the public page describes reliable destinations
   without claiming unsupported providers or exactly-once delivery.

If any step fails, note the step number + event id — that's the bug report.
