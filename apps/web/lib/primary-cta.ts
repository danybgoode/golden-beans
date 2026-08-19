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

/** The section id the CTA falls back to. Also the anchor the pricing section renders. */
export const PRICING_ANCHOR = '#pricing'

export function primaryCtaHref(signupEnabled: boolean): string {
  return signupEnabled ? '/signup' : PRICING_ANCHOR
}
