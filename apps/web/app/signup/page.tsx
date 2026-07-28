import { notFound } from 'next/navigation'
import { isSignupEnabled } from '@/lib/flags'
import { BrandLockup } from '@/components/brand/BrandLockup'
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
    <main className="auth-shell">
      <BrandLockup />
      <section className="auth-shell__card">
        <p className="kicker">Plant your first signal</p>
        <h1 className="display auth-shell__title">Start free</h1>
        <p className="auth-shell__intro">
          Instant tenant, your own API key, the full engine. One small primitive set, no artificial ceiling.
          No credit card.
        </p>
        <SignupForm />
        <p className="note auth-shell__foot">
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </section>
    </main>
  )
}
