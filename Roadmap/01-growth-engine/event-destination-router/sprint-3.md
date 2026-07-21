# Event destination router — Sprint 3: CRM proof and operating view

**Status:** 🟨 partially built — 3.3 done; 3.1 specified (cross-repo half owed); 3.2 deliberately NOT built

## Where each story actually stands

**Story 3.1 — Miyagi merchant-lifecycle projection · SPECIFIED, consumer owed**
The Golden Beans side needs no new code: the Sprint 2 signed-webhook destination already delivers
these events, and Sprint 1's `subject: { type: 'merchant', id }` context is what routes them. What was
produced here is the producer-side contract the Miyagi PR implements against —
[`miyagi-lifecycle-contract.md`](./miyagi-lifecycle-contract.md): transport, envelope, the six
lifecycle fixtures, and the six guarantees Miyagi must uphold (idempotency by event id, verify
before acting, 5xx-not-2xx on outage, Medusa stays commerce truth, no PII).
**Owed:** the Miyagi PR itself (endpoint + projection table + migration + idempotency store), the
identical fixtures running in both suites, and the disposable-merchant smoke. Cross-repo — Daniel
merges both PRs.

**Story 3.2 — Optional Attio adapter · NOT BUILT, deliberately**
This one was left alone on purpose rather than half-built. It needs a destination *kind* abstraction
(`webhook | attio`), a scoped vendor credential, and a merchant/contact/opportunity mapping — against
a mutable third-party API, with **no token available to verify any of it**. Writing a speculative
Attio mapping nobody can execute would produce plausible-looking code whose correctness is unknown,
which is precisely the failure mode this epic's 11-round cross-review exists to catch. It is also the
one story the epic itself marks *optional*.
**Recommendation:** scope it with a real Attio workspace token in hand, as its own sprint. Nothing
else in the epic depends on it — the adapter seam is a *destination kind*, and today's single kind
(signed webhook) is a complete, shipped product on its own.

**Story 3.3 — Delivery operating view + public-offer backfill · BUILT**
- Migration `20260725100000_delivery_health.sql` — `delivery_health()` RPC aggregating per-destination
  counts **in the database** (a Node-side count over a bounded fetch would describe a *window* while
  claiming to describe everything). `LEFT JOIN` so a destination with zero deliveries still appears —
  "configured, nothing ever delivered" is the state an operator most needs to see.
- `getDeliveryHealth()` + the Delivery-health table on `/app/destinations/[projectSlug]`: enabled
  sinks, delivered / awaiting-retry / dead-lettered / queued counts, total attempts, last delivery.
  Carries **no signing secret, no target URL, no payload** — pinned by a spec that greps the RPC's
  actual output for `whsec_` and the target host.
- Landing backfill (`PrimitivesGrid.tsx`): a new row, badged **🔜 honestly**, worded
  "at-least-once, with retries" — never exactly-once. It stays 🔜 until *both* the dispatcher is live
  in production (`DESTINATION_DELIVERY_ENABLED` is still born OFF) **and** the 3.1 CRM proof lands,
  exactly as this story's acceptance requires. Built ≠ live, and a ✅ on that label promises curl-able.

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
