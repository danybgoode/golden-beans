import { WaitlistForm } from './WaitlistForm'

// Section 1 — Hero. Per references/landing-end-state.md's own section table, this section's
// "Lights up" column reads "E1 (waitlist CTA) → E2 (real signup CTA)" — the connector CTA
// (copy-URL + "Add to Claude") is NOT E1 scope; it ships dark in Sprint 2, Story 2.1
// (CONNECTOR_ENABLED, HIGH risk). Per the project's own honesty-badge rule ("capability badges
// never claim ✅ for unshipped work"), the connector slot stays in its designed position but
// renders as a non-interactive block — no <button>/<a href>, no fabricated key string — while
// the waitlist is the real, working, primary CTA.
export function Hero() {
  return (
    <section>
      <div className="wrap hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 48, alignItems: 'center' }}>
        <div>
          <h1 className="display" style={{ fontSize: 'clamp(38px,5vw,62px)' }}>
            The growth engine <em style={{ fontStyle: 'normal', color: 'var(--gold)' }}>your agent</em> operates.
          </h1>
          <p style={{ margin: '20px 0 30px', fontSize: 19, color: 'var(--dim)', maxWidth: 560 }}>
            Telemetry, TARS funnels, North Star metrics and A/B experiments — as primitives. Others
            close the signal loop with <i>their</i> AI. Golden Beans closes it with{' '}
            <b style={{ color: 'var(--crema)' }}>yours</b>, over MCP.
          </p>
          <div style={{ display: 'flex', gap: 10, maxWidth: 600, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 260px', minWidth: 260 }}>
              <WaitlistForm compact />
            </div>
          </div>
          <div
            className="urlfield"
            aria-disabled="true"
            style={{ maxWidth: 600, marginTop: 14, color: 'var(--dim-2)' }}
          >
            Connector URL — lights up next
            <span className="tag tag-next" style={{ marginLeft: 'auto' }}>🔜 Sprint 2</span>
          </div>
          <p style={{ margin: '16px 0 0', font: '400 13px var(--mono)', color: 'var(--dim)' }}>
            works on the Claude free tier · your data, your Supabase, your agent
            <span className="tag tag-live" style={{ marginLeft: 8 }}>LIVE · waitlist</span>{' '}
            <span className="tag tag-next">🔜 signup · connector</span>
          </p>
        </div>
        <div className="agent-win">
          <div className="agent-bar">
            <span className="agent-dots"><span /><span /><span /></span>
            claude<span className="agent-chip">connected</span>
          </div>
          <div className="agent-body" style={{ font: '500 13px var(--mono)' }}>
            <div className="you"><b>you ▸</b> add golden-beans</div>
            <div className="tool" style={{ lineHeight: 1.7 }}>
              <b>⚙ handshake</b> → 6 tools<br />
              get_tars_funnel · get_north_star<br />
              compare_experiment · sync_features<br />
              track · bucket
            </div>
            <div style={{ color: 'var(--crema)', font: '400 13px var(--sans)', lineHeight: 1.55 }}>
              Connected to <b>golden-beans-demo</b>. Ask me for the funnel — or bring your PM, no
              SQL required.<span className="cursor" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
