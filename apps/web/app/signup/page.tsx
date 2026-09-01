import { notFound } from 'next/navigation'
import { isSignupEnabled } from '@/lib/flags'
import { Frame } from '@/design-system/Frame'
import { SignupForm } from './signup-form'

// multi-tenant-activation · Sprint 3, Story 3.1/3.2 — the self-serve front door the flipped hero
// CTA and §7 "Start free" tile both link to. Same dark-until-flipped contract as the API route it
// posts to (app/api/v1/public/signup/route.ts): while SIGNUP_ENABLED is off this page 404s rather
// than rendering a form with nowhere to submit — a live-looking dead end is worse than no route at
// all (mirrors the connector route's own 404-while-dark idiom, lib/flags.ts). `force-dynamic` for
// the same reason as app/page.tsx: the flag is read fresh per request (no module-level capture).
//
// ── design-system-rails · Sprint 6, Story 6.2 — and the ONE approved state that cannot render ──
//
// This page renders `door-signup-open`. The batch also contains **`door-signup-closed`** — the same
// door carrying a waitlist form — and it is **unreachable in this product**, deliberately:
// `notFound()` above means the closed state of `/signup` is a 404, not a waitlist.
//
// That is left alone on purpose. The epic's platform-first note says *every route keeps the gate it
// has today*, and turning a 404 into a 200 is a behaviour change dressed as a port — on the one
// route whose gate decides whether strangers can create tenants. The waitlist itself is not lost:
// it is live on the landing page, which is where `door-signup-closed`'s content already ships.
//
// Recorded rather than quietly skipped, because an approved state with no route is exactly the kind
// of gap this epic exists to make visible. `route-manifest.ts` names `door-signup-open` as this
// route's reference state and says why the other one is not it.
export const dynamic = 'force-dynamic'

export default function SignupPage() {
  if (!isSignupEnabled()) notFound()

  return (
    <Frame variant="door" brandHref="/">
      <h1>Create your account</h1>
      <p className="ds-doorlede">One project to start. You can add more once you are in.</p>
      <SignupForm />
      <div className="ds-doorfoot">
        Already have one? <a href="/login">Sign in</a>
      </div>
      {/* ⚠️ **CORRECTED against the code that runs after confirmation.** The approved state's note
          reads *"Straight to Setup › Connect"*. `app/auth/callback/route.ts` redirects a freshly
          provisioned account to `/app/onboarding/<slug>`, because that is the one screen where the
          project's API key can be shown — it exists for a single request and is never stored. So
          the promise the design makes is right in substance and wrong in destination, and a note
          naming a route the flow does not visit is the class of claim this epic exists to remove. */}
      <div className="ds-doornote">
        <b>Straight to your key and your connector URL.</b> Confirming the email lands you on the one screen
        that can show your project&apos;s API key — it exists for that single request and is never stored —
        not on an empty dashboard.
      </div>
    </Frame>
  )
}
