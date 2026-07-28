import { BrandLockup } from '@/components/brand/BrandLockup'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

export function Nav() {
  return (
    <nav className="gb landing-nav">
      <BrandLockup compact />
      <div className="landing-nav__links">
        <a href="#live-proof">Product</a>
        <a href="/install">Install</a>
        <a href="#primitives">Docs</a>
        <a href="#waitlist">Pricing</a>
      </div>
      <Button href="#waitlist" variant="ghost">
        <Icon name="sparkles" />
        Start growing
        <Icon name="arrow-right" />
      </Button>
    </nav>
  )
}
