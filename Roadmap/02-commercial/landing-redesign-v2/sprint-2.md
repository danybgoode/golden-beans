# Landing redesign v2 — Sprint 2: The redesigned landing

**Status:** ✅ Shipped — PR [#92](https://github.com/danybgoode/golden-beans/pull/92), merged as `4553767`. Live in production.

> **Build contract.** Consumes Sprint 1's classes. Zero inline styles (D3). Every claim on the page
> is either (a) generic product narrative, (b) explicitly labelled as an illustration (D4), or
> (c) computed from live data/flags. Nothing in between.

## Stories

### Story 2.1 — The narrative spine
**As a** technical PM landing here cold, **I want** the page to open with the problem I recognise —
too many opinions, no shared yardstick — **so that** I understand what this is before I'm asked to
connect anything.

**Acceptance:**
- The hero, the `#try` prompt block, and `#how` render per the mockup: new `h1`
  ("Your roadmap has enough opinions."), the foil treatment on the second line, dual CTAs.
- The numbered kraft dividers ①–⑩ carry the mockup's stamp titles.
- `lib/landing-sections.ts` is rewritten to the v2 map (D6) and every section reads its badge from
  the registry, not a literal.
**Risk:** low

### Story 2.2 — The copy-a-prompt blocks
**As a** PM who has not signed up, **I want** to paste one prompt into the agent I already use,
**so that** I can evaluate this without an account.

**Acceptance:**
- Both prompt cards (`#try` and the closing CTA) render the exact prompt text and copy it to the
  clipboard on click, degrading to select-the-text when the clipboard API is unavailable (the
  `CopyUrlField` precedent).
- The prompt text is defined **once** per prompt and rendered from that constant — the copied
  string and the displayed string cannot diverge.
- Every URL named inside a prompt resolves 200 (see 2.4).
**Risk:** low

### Story 2.3 — Proof: computed, not claimed
**As a** decision-maker, **I want** the proof section to show real numbers, **so that** the page's
own claim about receipts is one it satisfies.

**Acceptance:**
- §6 renders the Pod Report's **computed** figures in the mockup's stat-grid layout, keeping the
  honest fallback and the "things we do not measure" tile (D1).
- §6 also renders the live demo-tenant engine read — funnel, North Star, experiment — inside a real
  agent window, distinguishable from the illustrated ones by its surface note (D2, D4).
- No hardcoded velocity/cycle-time numbers appear anywhere in the tree.
**Risk:** low

### Story 2.4 — `/northstar-self-serve.md`
**As a** reader's agent, **I want** the workshop document the prompt tells me to read to exist,
**so that** the page's primary call to action works end to end.

**Acceptance:**
- `GET /northstar-self-serve.md` returns 200 with `text/markdown`, served the same way
  `app/llms.txt/route.ts` serves its document.
- The content facilitates the North Star workshop one question at a time, and describes only
  capabilities that actually exist.
- A spec asserts the status, the content type, and that the document names no unshipped capability.
**Risk:** low

### Story 2.5 — Pricing, honestly
**As a** buyer, **I want** the pricing section to tell me what I can actually do today, **so that**
I don't discover the gap after signing up.

**Acceptance:**
- Three tiers render per the mockup. The free tier's CTA follows `isSignupEnabled()` exactly as the
  current page does (signup when on, waitlist when off).
- The `$49/mo` tier states plainly that billing is not live yet and its CTA is the same real free
  signup (D1).
- The pods tier's CTA is a real contact path.
**Risk:** low

## Smoke walkthrough

1. Open `/` → hero reads "Your roadmap has enough opinions." with "enough opinions." in foil.
2. Click **copy prompt** in `#try` → button confirms; paste into a scratch buffer → the full prompt.
3. Open every URL named in that prompt (`/llms.txt`, `/northstar-self-serve.md`) → both 200.
4. Scroll to §6 → Pod Report tiles show computed figures; the live agent window shows demo-tenant
   numbers matching `curl /api/v1/public/north-star`.
5. Scroll to pricing → the middle tier names its price **and** says billing is not live.
6. Repeat 1–5 at 390px → no horizontal scroll at any point.
