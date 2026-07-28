# Golden Beans — UX guidelines (public surface + product)

> Companion to `design-direction.md` (the brand/visual direction) and `design/brand-system.html`
> (the skin). This doc is the *behavior* layer: what the interface owes the person using it,
> independent of color and type. Draft v1 — written 2026-07-23, for review alongside the
> design-system proposal. Bar we're aiming for: Claude's own apps (web, macOS) — an interface
> that tells you what's about to happen, what's happening, and what happened, without you having
> to guess or click to find out.

## The one rule everything below serves

**Never make someone wonder.** Before an action: what will this do. During: that it's working.
After: what happened and what changed. If a person has to click something to find out what it
does, or refresh to find out if it worked, that's the bug — not a missing nice-to-have.

## Where this comes from

Two sources, both cited so the reasoning is checkable, not vibes:

- **Nielsen Norman's usability heuristics** (1994, still the industry baseline) — the ones that
  matter most for us: visibility of system status, user control and freedom, consistency and
  standards, error prevention, recognition over recall, and helping people recognize and recover
  from errors in plain language rather than a code.
- **Anthropic's own published principles for agentic products** — "maintain simplicity,"
  "prioritize transparency by explicitly showing the agent's planning steps," and Claude Code's
  Plan Mode: show the whole plan up front, let the person review and edit it, let them intervene
  at any point, rather than a black box that reports back only when it's done. Our agent-window
  device (the `you ▸ ... ⚙ tool_name → result` panel) is already this exact idea — it's the one
  piece of our current UI that's already at the bar. The guidelines below are mostly about
  extending that same honesty to *every* control, not just the agent panel.

## State taxonomy — every interactive thing needs these, on purpose

Right now states exist where someone happened to style them and are missing where they didn't.
Every button, field, toggle, and card should be *designed* through this list, not just the
default and hover:

| State | What it communicates | Golden Beans note |
|---|---|---|
| Idle | this is here, this is what it does | label is the verb, not a noun ("Copy," not "Clipboard") |
| Hover | this is clickable, this is what happens if you do | cursor + a visible but subtle shift, never color-only |
| Focus | keyboard users are here | a real visible ring, never `outline: none` without a replacement |
| Active / pressed | you're pressing it right now | see "Tactile" below — this is the state we currently skip |
| Loading / pending | your click registered, work is happening | never a silent no-op between click and result |
| Success | it worked, here's the proof | confirm using the same verb as the trigger ("Copied," not "Done") |
| Error | it didn't work, here's why, here's the fix | plain language, never a raw error code alone |
| Disabled (blocked) | you can't do this *right now*, here's why | e.g. a form mid-submit |
| Disabled (not yet shipped) | this isn't built yet | **this is a different state from "blocked" and must look different** — see below |
| Empty | nothing here yet, here's what to do about it | an invitation, not a dead end |

### The one we most need to fix: "not yet shipped" vs. "temporarily unavailable"

We already have great bones for this — the `🔜`/honesty-badge convention *is* status
communication done right in spirit. But right now "not yet shipped" (the connector field on the
hero) and an ordinary disabled/pending state (a form mid-submit) can end up looking identical —
both dimmed, both inert. They mean completely different things to the person looking at them:
one is "this doesn't exist yet, don't worry about it," the other is "this exists, wait a second."
Keep them visually distinct on purpose: not-yet-shipped gets the amber "next" tag treatment and
stays legible (it's honest marketing, it should read clearly); blocked/pending gets a spinner or
inline microcopy and returns to normal the moment it's unblocked.

## Communicate the trigger, not just the result

Every clickable thing should answer "what happens if I press this" before it's pressed —
ideally from the label alone, without needing a tooltip:

- Name buttons after the effect, not the mechanism: "Start free," "Copy," "Join the waitlist" —
  already how this project writes labels. Keep doing this everywhere new gets built, including
  internal `/app` routes.
- A control's name doesn't change mid-flow. If the button says "Copy," the confirmation says
  "Copied" — same verb, past tense. (`CopyUrlField.tsx` already does exactly this — use it as the
  reference implementation when building the next one.)
- Destructive or hard-to-reverse actions (revoking a connector token, deleting a destination) get
  a second, explicit confirmation naming what's about to happen and that it can't be undone —
  never a bare "Are you sure?".
- Links that leave the product (GitHub, docs) vs. links that navigate inside it should be
  visually distinguishable, not just by the URL you'd have to hover to check.

## Tactile: the "pushed / pulled" language, made literal

`brand-system.html` already describes the lever toggle as "machined, weighty, clickable" — that's
the right instinct, and `.btn-gold`'s under-shadow (`box-shadow: 0 3px 0 var(--gold-deep)`)
already *implies* a pushable button. What's missing is the payoff: nothing currently happens when
you actually press it. The fix is small and should apply everywhere a `.btn` is used:

- **Press = the shadow collapses and the element moves down into it.** A button with a 3px
  under-shadow should lose ~2px of that shadow and translate down ~2px on `:active`, and recover
  on release. That's the entire trick — no bounce, no overshoot.
- **The brass lever toggle already nails this** (weighted knob, eased slide) — treat it as the
  reference for "tactile," not the exception.
- **Restraint is the point.** One consistent press behavior across every button beats five
  different clever ones. Nothing should wobble, bounce, or animate on page load "for delight" —
  motion earns its place by confirming a real action, never as ambient decoration. Respect
  `prefers-reduced-motion`: press feedback can stay (it's a state, not decoration), but skip
  anything springy for people who've asked for less motion.

## Mobile-first, actually first

Author for the narrowest viewport as the *default* CSS, then add complexity for wider ones —
not the reverse. Concretely: base rules should already be single-column, full-width CTAs,
compact spacing; a `min-width` query then *adds* the two-column grid, the wider `.wrap` padding,
the side-by-side hero — rather than a single `max-width: 720px` block that fights the desktop
rules with `!important`. Practical bar: nothing should need a horizontal scrollbar at 360px
wide, no tap target under ~44px, and no hover-only affordance (a state that's only discoverable
by a mouse hovering has no mobile equivalent).

## Accessibility floor (non-negotiable, not a stretch goal)

- Every focusable element has a visible focus state — this is the *keyboard* version of "user
  control and freedom," not a nice-to-have.
- Color is never the only signal — the honesty badges already pair color with text/icon, keep
  that discipline for every new status indicator.
- Contrast: body text on `--roast` already targets AA (per the token file's own comment on
  `--dim`) — hold new colors to the same bar, check before shipping, not after.
- Anything that updates live without a click (the funnel numbers, the North Star delta) should be
  in an `aria-live` region so it's announced, not just visually swapped.
- Motion respects `prefers-reduced-motion: reduce`.

## Errors and empty states are UI, not afterthoughts

- Errors explain what happened and what to do next, in the product's own voice — never a bare
  stack trace or HTTP status to an end user. ("Something went wrong — try again" is fine for a
  transient failure; anything actionable should say what the person can actually do.)
- An empty state (no experiments yet, no destinations yet) is a prompt to act, not a blank
  panel — say what goes here and offer the control that fills it, right there.

## Icons carry meaning, not decoration

Once icons replace the emoji/unicode glyphs currently standing in (see the design-system
proposal), every icon needs a text label or accessible name — never an icon alone as the only
explanation for what a control does, especially for anything destructive or non-obvious. Icon
choice should stay consistent per meaning across the whole product: one glyph = one meaning,
everywhere (the same "shipped" checkmark in the hero, the bag label, and any future `/app`
status list).

## Applying this to what's live today

None of the above requires new sections or new claims about capability — it's entirely about how
the *existing* capability communicates itself. Two concrete near-term applications called out
because they're visible today:

1. The connector URL field on the hero (`aria-disabled`, "lights up next") is a good instinct —
   make sure its visual treatment reads as "not yet shipped," never as "broken" or "loading."
2. `WaitlistForm`'s error state (`Something went wrong — try again`) is exactly the right voice —
   use it as the template for every future error message rather than writing new ones ad hoc.

---
*This is a first draft for review, not a locked spec — flag anything that doesn't fit how the
product actually behaves and we'll revise before it becomes the reference doc new sections get
checked against.*
