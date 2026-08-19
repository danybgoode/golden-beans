# Maker ops — Sprint 5: The Pods booking flow

**Status:** ✅ done

> **Build contract.** Added mid-build by the product owner (epic D8). Scope is deliberately small:
> the consulting tier keeps its place, loses its price, and gains a booking conversation that
> happens inside our own chrome. No new runtime dependency, no third-party script.

## Stories

### Story 5.1 — The consulting tier stops implying a price
**As a** reader comparing three tiers, **I want** the Pods tier to say plainly that it is priced
after a conversation, **so that** I am not left guessing whether the missing number is an oversight.

**Acceptance:**
- No figure. The price slot says what the tier is rather than standing empty, so the three cards
  stay aligned on their price line.
- Three bullets naming what a Pod actually is: scoped to your team, measured before and after,
  priced after we talk.
- The CTA goes to `/talk`, not to a GitHub profile.
**Risk:** low

### Story 5.2 — Booking happens inside our own page
**As a** team lead who wants to talk, **I want** to know what the call is before I pick a time,
**so that** I am booking a conversation rather than a mystery.

**Acceptance:**
- `/talk` carries the site nav, ground and footer; Cal.com renders only the calendar.
- The page says what the call is (twenty minutes, not a demo, an honest read including when a Pod
  would not help) before the calendar appears.
- The booker is an `<iframe>`, never Cal.com's embed script: a script executes in our origin, a
  cross-origin frame cannot read this page.
- **The direct booking link renders unconditionally**, as ordinary copy rather than as an error
  state. A blocked frame is a blank rectangle, and nothing on the page can detect it — a
  cross-origin iframe fires `load` even when blocked.
- The frame carries an accessible `title` and a visible edge, so an empty frame reads as "did not
  fill" rather than as finished.
- `/talk` joins `PUBLIC_MOBILE_ROUTES` in the mobile sweep.
**Risk:** low
