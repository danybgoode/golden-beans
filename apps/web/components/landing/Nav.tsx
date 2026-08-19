import Link from 'next/link'
import { BrandLockup } from '@/components/brand/BrandLockup'
import { RunYourFirstBet } from './RunYourFirstBet'

// landing-maker-ops · Sprint 2, Story 2.8 — the nav follows the maker-ops section map.
//
// The links are the four sections a reader actually navigates to, in the order the page argues
// them: what it is (Product), how wide it goes (Ops), whether any of it is real (Proof), what it
// costs (Pricing). `e2e/landing.browser.spec.ts` asserts every one of these resolves to a section
// that exists, because a dead in-page anchor type-checks, renders, and silently does nothing.
//
// The CTA is the page's primary action rather than an anchor. The version this replaces pointed at
// `#connect` on the reasoning that a reader who clicks in the first two seconds has not been told
// what this is yet — true, and it is why the nav CTA is the same "Run your first Bet" as everywhere
// else rather than a different, softer ask. One promise, four places, one implementation.
export function Nav() {
  return (
    <nav className="gb landing-nav">
      <BrandLockup compact />
      {/* ── Root-relative, not bare fragments ────────────────────────────────────────────────────
          `href="#product"` resolves against the CURRENT page, and this nav is no longer only on the
          landing page — `/talk` renders it too. On that route every bare fragment pointed at an
          anchor that does not exist there, so all four links silently did nothing. The spec that
          checks these ("every nav link resolves to a section on the page") only ever loaded `/`,
          so it passed the whole time.

          `/#product` is unambiguous from anywhere, and stays a same-page jump on the landing
          itself. Caught by Codex in cross-family review of PR #100.

          `next/link` rather than a bare `<a>`: with a root-relative href these became real route
          navigations, and `@next/next/no-html-link-for-pages` (correctly) fails the lint for an
          `<a>` to a page — a full document load where a client-side transition belongs. The lint
          rule catching my own fix is the gate doing its job. */}
      <div className="landing-nav__links">
        <Link href="/#product">Product</Link>
        <Link href="/#ops">Ops</Link>
        <Link href="/#proof">Proof</Link>
        <Link href="/#pricing">Pricing</Link>
      </div>
      <RunYourFirstBet />
    </nav>
  )
}
