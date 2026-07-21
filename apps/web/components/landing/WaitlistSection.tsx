import { WaitlistForm } from './WaitlistForm'
import { isSignupEnabled } from '@/lib/flags'

// Section 7 — Pricing & tenancy. Per landing-end-state.md this section is split: the waitlist
// itself is E1-live (Story 1.3), self-serve pricing tiers are E2 (multi-tenant-activation) — so
// this is a dedicated component, not a generic Teaser (a Teaser has nothing live in it).
//
// multi-tenant-activation · Sprint 3, Stories 3.1/3.2 — the E2 half actually lands here. Gate ON:
// honest tiers only (free pilot · pods = "talk to us" — no invented prices, no payment rail, per
// the epic's Decision 2) and the waitlist form is gone from the page entirely (3.2's acceptance:
// "the waitlist form is gone", not merely hidden). Gate OFF: byte-for-byte the old section — the
// waitlist API route (app/api/v1/public/waitlist/route.ts) is untouched and still the real path.
// Decided server-side via isSignupEnabled() (this stays a Server Component), same reasoning as
// Hero.tsx — one render per request, never a client-side re-branch on the same flag.
export function WaitlistSection() {
  const signupEnabled = isSignupEnabled()

  return (
    <>
      <div className="divider">
        <div className="wrap">
          <span className="num">⑦</span>
          <span className="stamp-title">Pricing &amp; tenancy</span>
          {signupEnabled ? (
            <span className="tag tag-stamp">SELF-SERVE · LIVE</span>
          ) : (
            <span className="tag tag-stamp-next">SELF-SERVE · NEXT</span>
          )}
        </div>
      </div>
      {signupEnabled ? (
        <section className="band" id="pricing">
          <div className="wrap" style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 34 }}>Free to start. Pods when you&apos;re ready to scale.</h2>
            <p style={{ margin: '14px auto 0', maxWidth: 560, color: 'var(--dim)' }}>
              No payment rail in this release — sign up and you get a tenant and an API key
              immediately, on the house. Bring your own agent.
            </p>
            <div
              className="row2"
              style={{ marginTop: 34, textAlign: 'left', maxWidth: 760, marginLeft: 'auto', marginRight: 'auto' }}
            >
              <div className="panel">
                <p className="panel-label">FREE PILOT</p>
                <h3 style={{ margin: '10px 0 0', fontSize: 26 }}>Free</h3>
                <p style={{ margin: '10px 0 0', color: 'var(--dim)', fontSize: 14 }}>
                  Instant tenant, your own API key, the full engine — telemetry, TARS, North Star,
                  A/B. No seat limits.
                </p>
                <a href="/signup" className="btn btn-gold" style={{ marginTop: 18, display: 'inline-block' }}>
                  Start free
                </a>
              </div>
              <div className="panel">
                <p className="panel-label">PODS</p>
                <h3 style={{ margin: '10px 0 0', fontSize: 26 }}>Talk to us</h3>
                <p style={{ margin: '10px 0 0', color: 'var(--dim)', fontSize: 14 }}>
                  The dev-team-as-revenue-engine program — hands-on setup, the Pod Report, a direct
                  line to us. No self-serve price yet; that&apos;s a later epic.
                </p>
                <a
                  href="https://github.com/danybgoode"
                  className="btn btn-ghost"
                  style={{ marginTop: 18, display: 'inline-block' }}
                >
                  Talk to us →
                </a>
              </div>
            </div>
            <p className="note" style={{ margin: '24px auto 0', maxWidth: 560 }}>
              * No credit card, no invented tiers — this is genuinely all there is right now.
            </p>
          </div>
        </section>
      ) : (
        <section className="band" id="waitlist">
          <div className="wrap" style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 34 }}>Hand-roasted onboarding, for now.</h2>
            <p style={{ margin: '14px auto 0', maxWidth: 520, color: 'var(--dim)' }}>
              We&apos;re provisioning pilot tenants by hand while the pods program spins up.
              Self-serve tiers arrive with a later epic — until then, get in the queue.*
            </p>
            <WaitlistForm />
            <p className="note" style={{ margin: '18px auto 0', maxWidth: 560 }}>
              * Unlimited seats when tiers land — scarcity is for beans, not software. The queue is
              real, though: tenants are provisioned by a human with a checklist.
            </p>
          </div>
        </section>
      )}
    </>
  )
}
