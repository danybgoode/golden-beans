import { isSignupEnabled } from '@/lib/flags'
import { primaryCtaHref } from '@/lib/primary-cta'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

// landing-maker-ops · Sprint 2 — the page's primary action, in one place.
//
// A server component, so `isSignupEnabled()` is read fresh per request rather than baked into a
// build. That matters here for the reason AGENTS.md rule #4 spells out: Vercel snapshots env vars
// into a deployment at build time, and a CTA whose destination was decided at build time would keep
// pointing at a 404 for as long as the deployment lived after the gate was flipped.
export function RunYourFirstBet({
  variant = 'gold',
  className,
}: {
  variant?: 'gold' | 'ghost'
  className?: string
}) {
  return (
    <Button href={primaryCtaHref(isSignupEnabled())} variant={variant} className={className}>
      Run your first Bet
      <Icon name="arrow-right" />
    </Button>
  )
}
