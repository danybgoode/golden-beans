import { WaitlistForm } from './WaitlistForm'

// Section 7 — Pricing & tenancy. Per landing-end-state.md this section is split: the waitlist
// itself is E1-live (Story 1.3), self-serve pricing tiers are E2 (multi-tenant-activation) — so
// this is a dedicated component, not a generic Teaser (a Teaser has nothing live in it).
export function WaitlistSection() {
  return (
    <>
      <div className="divider">
        <div className="wrap">
          <span className="num">⑦</span>
          <span className="stamp-title">Pricing &amp; tenancy</span>
          <span className="tag tag-stamp-next">SELF-SERVE · NEXT</span>
        </div>
      </div>
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
    </>
  )
}
