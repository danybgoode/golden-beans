# Golden Frijoles — Sprint 2: The product-feel surfaces

**Status:** ⬜ Not started

> **Build contract (locked by the architect before any builder started).**
> Sprint 1 has already landed the brand strings, the corrected control ink, the stamped divider and
> the icon names. This sprint **consumes** them and adds no new dependency, no migration and no new
> `lib/` data seam. Every visual device becomes a **class in `globals.css`** — `check-design-drift`
> runs with `disallowInlineStyle: true` over `components/landing`, which is why the current landing
> has zero inline styles and why the mockup's ~90 of them cannot be copied across
> (landing-redesign-v2 D3, still in force).
> Every framed agent surface keeps its `SurfaceNote` (landing-redesign-v2 D4) — `e2e/landing.browser
> .spec.ts` asserts it, so an `.agent-win` without one fails the gate.

## Stories

### Story 2.1 — Agent surfaces look like a conversation
**As a** reader deciding whether this is for me, **I want** the illustrated agent windows to look
like the chat I already use, **so that** I can picture the product in the tool I actually work in.

**Acceptance:**
- The hero and §2 render the mockup's chat thread: user and agent bubbles with an avatar, a
  gold-edged **context card** carrying what Golden Frijoles supplied, and platform pills
  (ChatGPT · Claude · your agent) in the window bar.
- The bubble layout is asymmetric (user right, agent left) and collapses cleanly at 390px — the
  platform pills hide, the context card loses its indent.
- §2's thread ships the mockup's longer exchange: the reader proposes a redesign, the context card
  reports the drop-off, the agent asks for an appetite, and the shaped bet comes back smaller.
- **The illustration label is unchanged and non-negotiable.** Both windows keep a `SurfaceNote`
  saying they are illustrations, and the hero's status chip stays `illustration` — it must never
  read "via MCP" or "connected" on an invented conversation.
**Risk:** low

### Story 2.2 — The shameless infomercial
**As a** reader who has just been told this is serious, **I want** one section that is openly a
joke, **so that** the page has a voice and I trust its serious claims more, not less.

**Acceptance:**
- A kraft band between §how and ①, carrying the mockup's parody: the "fix your org in three easy
  steps!*" headline with its disclaiming footnote, three rotated kraft cards, the testimonial box,
  and the struck-through consultant price beside the real "starts at $0".
- **Everything invented is labelled as invented** (epic D6): the testimonials carry
  "†They are not. We wrote these." and the asterisk resolves to "Golden Frijoles cannot fix your
  org."
- The card rotations are honoured by class, not inline style, and are dropped under
  `prefers-reduced-motion` only if they animate (they do not — a static rotation is fine).
- The footnote ledger in the footer gains a line naming this section, in reading order.
- The `~~$999~~` markdown-ish strike in the mockup ships as a real `<s>`, not as literal tildes.
**Risk:** low

### Story 2.3 — Break glass, on purpose — and honestly
**As a** PM, **I want** to see that chaos drills and security simulations are part of this product,
**so that** I know the launch-day question has an answer here.

**Acceptance:**
- A band after §3 carrying the mockup's two drill cards: the Black Friday dress rehearsal (with its
  meter rows) and the auth mutiny simulation (with its after-action list).
- The meter fills are **class-driven from a bounded set of widths**, not arbitrary inline styles.
- The `icon-ph` "I" placeholders become real icons from the Sprint 1 seam. No emoji — the drift
  guard's pictograph rule already refuses them.
- **The section reads `isResilienceScenariosEnabled()` and says so when the gate is off** (epic D5).
  With the flag OFF — which is its state in production today — the section renders an honest badge
  in the same vocabulary §3's RISK row already uses, and the copy does not describe the capability
  in the unqualified present tense. Flipping the gate clears the badge with no code change.
- A unit test pins both branches of that badge, so the honest state cannot silently disappear.
**Risk:** low — *the flag is read, never written; no route or gate changes.*

### Story 2.4 — The journey, side by side
**As a** reader, **I want** to see today's context treasure hunt against the shorter path, **so
that** the claim "less coordination" is something I can count rather than something I am told.

**Acceptance:**
- §5's two stacked flow panels become the mockup's side-by-side comparison: seven stops against
  three, each node carrying an icon, with the "after" column tinted.
- On a phone the comparison **scrolls inside its own box** with a visible swipe hint — never by
  dragging the page sideways. This is the `.scroll-x` rail `globals.css` already provides
  (`overscroll-behavior-x: contain`), not a new mechanism, so `mobile-heuristics.browser.spec.ts`
  keeps passing unchanged.
- The stop counts in the badges are derived from the arrays that render the nodes, not written
  down twice (`CODE-QUALITY.md` #2).
**Risk:** low

### Story 2.5 — The release room
**As a** reader, **I want** §4's staged proposal to look like a plan two parties shaped, **so that**
"conservative about actions" reads as collaboration rather than as approval bureaucracy.

**Acceptance:**
- §4 ships the mockup's release room: the shared-plan block, the three-cell collaboration strip
  (why 10% · what would worry us · if it goes sideways) and the three-button decision row.
- The copy moves from "waiting on you" to the mockup's shared framing, and the surface note says
  "a shared plan before a real change".
- It stays labelled as an illustration of the product UI — it is not a screenshot of anyone's
  account, and §3's release list already carries that same caveat.
- The buttons are real controls with the corrected Sprint 1 ink, and they are inert on a marketing
  page — they must not look enabled and do nothing surprising. *(They are `<button type="button">`
  with no handler, exactly as the current §4 ships.)*
**Risk:** low

## Smoke walkthrough

1. Open `/` and read the hero window. *(Expected: chat bubbles with an avatar and a gold-edged
   context card; the note above it still says it is an illustration.)*
2. Scroll past §how. *(Expected: a kraft infomercial band; its testimonials are marked as written by
   us; the $999 is struck through.)*
3. Scroll past §3. *(Expected: the two drill cards. Because `RESILIENCE_SCENARIOS_ENABLED` is off in
   production, an honest badge says so — the same wording §3's RISK row uses.)*
4. At 390px, swipe the §5 comparison sideways. *(Expected: it scrolls inside its own box; the page
   itself does not move sideways.)*
5. Scroll to §4. *(Expected: the shared plan, three collaboration cells, three buttons; hovering the
   gold one keeps its label — Sprint 1's repair holding under a second usage.)*
