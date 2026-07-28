import { isSignupEnabled } from '@/lib/flags'
import { AgentWindow } from '@/components/ui/AgentWindow'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { WaitlistForm } from './WaitlistForm'

// The connector slot remains visibly NEXT until its independent gate is live. The hero's primary
// action follows the real signup flag, so the visual lift cannot accidentally advertise a dark path.
export function Hero() {
  const signupEnabled = isSignupEnabled()

  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div>
          <h1 className="display">
            The growth engine <em className="foil">your agent</em> operates.
          </h1>
          <p className="hero-copy">
            Telemetry, TARS funnels, North Star metrics and A/B experiments — as primitives. Others close the
            signal loop with <i>their</i> AI. Golden Beans closes it with <b>yours</b>, over MCP.
          </p>

          <div className="hero-cta">
            {signupEnabled ? (
              <Button href="/signup">
                Start free
                <Icon name="arrow-right" />
              </Button>
            ) : (
              <WaitlistForm compact />
            )}
          </div>

          <div className="urlfield" aria-disabled="true">
            Connector URL — lights up next
            <Badge status="next">Sprint 2</Badge>
          </div>
          <p className="note hero-note">
            works on the Claude free tier · your data, your Supabase, your agent
          </p>
        </div>

        <AgentWindow>
          <div className="you">
            <b>you ▸</b> add golden-beans
          </div>
          <div className="tool">
            <Icon name="settings" />
            handshake → 6 tools
          </div>
          <div className="agent-result">
            Connected to <b>golden-beans-demo</b>. Ask me for the funnel — or bring your PM, no SQL required.
          </div>
        </AgentWindow>
      </div>
    </section>
  )
}
