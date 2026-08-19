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
      <div className="landing-nav__links">
        <a href="#product">Product</a>
        <a href="#ops">Ops</a>
        <a href="#proof">Proof</a>
        <a href="#pricing">Pricing</a>
      </div>
      <RunYourFirstBet />
    </nav>
  )
}
