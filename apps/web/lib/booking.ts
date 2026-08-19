// landing-maker-ops · Sprint 5 — the one place the Pods conversation is addressed.
//
// ── Why a module for two strings ──────────────────────────────────────────────────────────────
// The booking link is about to appear in at least three places (the pricing tier, the /talk page's
// embedded frame, and the escape hatch under it), and one of those three is an `<iframe src>` whose
// failure mode is a silently blank rectangle. Three hand-written copies of a URL is two chances to
// fix the wrong one when the handle changes — CODE-QUALITY #1, and cheaper to prevent than to find.
//
// ── Why the embed URL is DERIVED rather than written down ─────────────────────────────────────
// `bookingEmbedUrl()` builds the framed variant from the same constant the plain link uses. If the
// handle ever changes, the escape-hatch link and the frame cannot end up pointing at different
// people — which is the specific bug that would be invisible in review (both look like a cal.com
// URL) and obvious to a customer (the frame books nobody).

/** The canonical, human-shareable booking link. Also the escape hatch when the frame cannot load. */
export const BOOKING_URL = 'https://cal.com/miyagisan/quick-chat'

/**
 * The same booking page, asked to render for embedding in a dark surface.
 *
 * `embed=` is Cal.com's own flag for its embedded layout (it drops their page chrome); `theme=dark`
 * stops a white panel being punched through this site's dark roast ground. Neither is load-bearing — if
 * Cal.com ignores or renames them the frame still books correctly, it just looks less like ours.
 * That is the right dependency to have on a third party: cosmetic, never functional.
 */
export function bookingEmbedUrl(): string {
  const url = new URL(BOOKING_URL)
  url.searchParams.set('embed', '')
  url.searchParams.set('theme', 'dark')
  return url.toString()
}
