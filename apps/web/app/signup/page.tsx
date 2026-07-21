import { notFound } from 'next/navigation'
import { isSignupEnabled } from '@/lib/flags'
import { SignupForm } from './signup-form'

// multi-tenant-activation · Sprint 3, Story 3.1/3.2 — the self-serve front door the flipped hero
// CTA and §7 "Start free" tile both link to. Same dark-until-flipped contract as the API route it
// posts to (app/api/v1/public/signup/route.ts): while SIGNUP_ENABLED is off this page 404s rather
// than rendering a form with nowhere to submit — a live-looking dead end is worse than no route at
// all (mirrors the connector route's own 404-while-dark idiom, lib/flags.ts). `force-dynamic` for
// the same reason as app/page.tsx: the flag is read fresh per request (no module-level capture),
// so the production flip takes effect on already-deployed functions with no redeploy.
export const dynamic = 'force-dynamic'

export default function SignupPage() {
  if (!isSignupEnabled()) notFound()

  return (
    <main className="wrap" style={{ maxWidth: 480, padding: '72px 32px' }}>
      <h1 className="display" style={{ fontSize: 32 }}>
        Start free
      </h1>
      <p style={{ margin: '12px 0 28px', color: 'var(--dim)' }}>
        Instant tenant, your own API key, the full engine. No credit card, no payment rail in this
        release.
      </p>
      <SignupForm />
      <p className="note" style={{ margin: '22px 0 0' }}>
        Already have an account? <a href="/login">Sign in</a>
      </p>
    </main>
  )
}
