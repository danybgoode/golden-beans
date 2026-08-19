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
//
// No `variant` prop. It had one — `'gold' | 'ghost'`, defaulting to gold — and all four call sites
// used the default, so it was an unexercised branch shipped on the assumption someone would want it.
// This IS the page's primary action; a ghost version of it would be a different, softer ask, and the
// decision to offer one belongs to whoever needs it, along with the reasoning for where. Flagged by
// Mistral Vibe in round 11 of PR #100.
export function RunYourFirstBet({ className }: { className?: string }) {
  return (
    <Button href={primaryCtaHref(isSignupEnabled())} className={className}>
      Run your first Bet
      <Icon name="arrow-right" />
    </Button>
  )
}
