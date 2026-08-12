import { BrandLockup } from '@/components/brand/BrandLockup'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

// landing-redesign-v2 · Sprint 2, Story 2.1 — the nav follows the v2 section map.
//
// The links point at the four sections a reader actually navigates to, in the order the page
// argues them. `#connect` rather than `/install` for the CTA on purpose: the reader who clicks a
// nav CTA in the first two seconds has not been told what this is yet, and §8 is the section that
// tells them before handing over a connector URL. `/install` is one click further, from a section
// that has earned it.
export function Nav() {
  return (
    <nav className="gb landing-nav">
      <BrandLockup compact />
      <div className="landing-nav__links">
        <a href="#product">Product</a>
        <a href="#how">How it works</a>
        <a href="#proof">Proof</a>
        <a href="#pricing">Pricing</a>
      </div>
      <Button href="#connect">
        Connect your agent
        <Icon name="arrow-right" />
      </Button>
    </nav>
  )
}
