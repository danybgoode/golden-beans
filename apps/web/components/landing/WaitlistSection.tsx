import { isSignupEnabled } from '@/lib/flags'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Panel } from '@/components/ui/Panel'
import { SectionDivider } from '@/components/ui/SectionDivider'
import { WaitlistForm } from './WaitlistForm'

export function WaitlistSection() {
  const signupEnabled = isSignupEnabled()

  return (
    <>
      <SectionDivider number="⑦" title="Pricing & tenancy">
        <Badge status={signupEnabled ? 'live' : 'next'} onKraft>
          SELF-SERVE · {signupEnabled ? 'LIVE' : 'NEXT'}
        </Badge>
      </SectionDivider>

      {signupEnabled ? (
        <section className="band" id="pricing">
          <div className="wrap pricing">
            <h2 className="section-title">Free to start. Pods when you&apos;re ready to scale.</h2>
            <p className="pricing__intro">
              No payment rail in this release — sign up and you get a tenant and an API key immediately, on
              the house. Bring your own agent.
            </p>
            <div className="row2 pricing__grid">
              <Panel>
                <p className="panel-label">FREE PILOT</p>
                <h3>Free</h3>
                <p>
                  Instant tenant, your own API key, the full engine — telemetry, TARS, North Star, A/B. No
                  seat limits.
                </p>
                <Button href="/signup">
                  Start free
                  <Icon name="arrow-right" />
                </Button>
              </Panel>
              <Panel>
                <p className="panel-label">PODS</p>
                <h3>Talk to us</h3>
                <p>
                  The dev-team-as-revenue-engine program — hands-on setup, the Pod Report, a direct line to
                  us. No self-serve price yet; that&apos;s a later epic.
                </p>
                <Button href="https://github.com/danybgoode" variant="ghost">
                  Talk to us
                  <Icon name="external" />
                </Button>
              </Panel>
            </div>
            <p className="note pricing__note">
              * No credit card, no invented tiers — this is genuinely all there is right now.
            </p>
          </div>
        </section>
      ) : (
        <section className="band" id="waitlist">
          <div className="wrap pricing">
            <h2 className="section-title">Hand-planted onboarding, for now.</h2>
            <p className="pricing__intro">
              We&apos;re provisioning pilot tenants by hand while the pods program spins up. Self-serve tiers
              arrive with a later epic — until then, get in the queue.*
            </p>
            <WaitlistForm />
            <p className="note pricing__note">
              * Unlimited seats when tiers land — scarcity is for beans, not software. The queue is real,
              though: tenants are provisioned by a human with a checklist.
            </p>
          </div>
        </section>
      )}
    </>
  )
}
