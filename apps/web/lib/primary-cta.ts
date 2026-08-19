// landing-maker-ops · Sprint 2 — where "Run your first Bet" actually goes.
//
// The signed-off mockup points every CTA at `href="#start"`, and nothing on the page has that id.
// Four dead anchors is the kind of rot a redesign introduces and a type-checker cannot see: it
// compiles, it renders, and clicking it does nothing at all.
//
// The destination is one decision — "is self-serve signup open?" — and this page asks it in four
// places (nav, hero, methodology, closing). Four copies of a conditional is three chances to update
// three of them (CODE-QUALITY #1), so it is a function, and the function is pure so the branch a
// reader never sees is still tested.
//
// With the gate OFF there is no `/signup` route to send anyone to — it 404s — so the CTA lands on
// the pricing section, which is where the real waitlist form lives. The label does not change: the
// button's promise ("start here") is true in both worlds, and only the mechanism differs.
// `PricingSection` makes the same call for the same reason, reading the same gate.

/**
 * Where the CTA lands when signup is gated off.
 *
 * ROOT-RELATIVE, and that is load-bearing rather than tidy. `Nav` renders this CTA on every route
 * that uses it, not just the landing page — `/talk` does — and a bare `#pricing` resolves against
 * whatever page it is currently on. On `/talk` there is no pricing section, so the primary call to
 * action on the page would be completely inert.
 *
 * This is the SIBLING of the bug Codex found in `Nav`'s own links in round 1 of PR #100. Those were
 * fixed and this was not, because it lives in a different file and looks like a section id rather
 * than a link — which is precisely the shape LEARNINGS' "grep for its siblings" rule exists for.
 * Found by agy in round 2.
 */
export const PRICING_ANCHOR = '/#pricing'

export function primaryCtaHref(signupEnabled: boolean): string {
  return signupEnabled ? '/signup' : PRICING_ANCHOR
}
