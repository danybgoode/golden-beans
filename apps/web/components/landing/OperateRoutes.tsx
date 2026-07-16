// Section 3 — Three operate routes. ① connector URL (Story 2.1/2.2) and ③ the SDK import are
// E1-live; ② the pod plugin is E2 (multi-tenant-activation) — rendered dimmed/dashed per the
// design system's own "unlit card" pattern (references/design/e1.html), not a full Teaser (it's
// one card among three live ones, not a whole unlit section).
//
// ③ was originally labeled "NPX WIZARD" — packages/sdk has no bin/CLI at all, just a library
// import, so that claimed ✅ LIVE for a capability that never existed. Corrected here (Story 2.2)
// to match what actually ships, per the honesty-badge rule (✅ only for shipped capability).
export function OperateRoutes() {
  return (
    <>
      <div className="divider">
        <div className="wrap">
          <span className="num">③</span>
          <span className="stamp-title">Three ways in — zero integrated AI</span>
        </div>
      </div>
      <section>
        <div className="wrap">
          <h2 style={{ fontSize: 34 }}>Bring the agent you already pay for.</h2>
          <div className="cards3" style={{ marginTop: 28 }}>
            <a href="/install" className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ font: '700 12px var(--mono)', color: 'var(--gold)', letterSpacing: '.1em' }}>① CONNECTOR URL</span>
                <span className="tag tag-live">✅ LIVE</span>
              </div>
              <h3 style={{ fontSize: 18 }}>Paste it into Claude</h3>
              <p style={{ fontSize: 14, color: 'var(--dim)' }}>
                Copy your tokenized MCP URL, hit <b style={{ color: 'var(--crema)' }}>Add to Claude</b>.
                Your PM asks their agent for the funnel. Revoke the token, revoke the access.
              </p>
              <div style={{ marginTop: 'auto', font: '500 12px var(--mono)', color: 'var(--gold-hot)', background: 'var(--roast)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px' }}>
                /install → copy the demo URL
              </div>
            </a>
            <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderStyle: 'dashed', borderColor: '#4a3f2d', opacity: 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ font: '700 12px var(--mono)', color: 'var(--gold)', letterSpacing: '.1em' }}>② THE POD PLUGIN</span>
                <span className="tag tag-next">🔜 multi-tenant-activation</span>
              </div>
              <h3 style={{ fontSize: 18 }}>Cowork / Claude Code</h3>
              <p style={{ fontSize: 14, color: 'var(--dim)' }}>
                The full pods experience — grooming, build order, benchmarks — installed as a
                plugin for your whole team.
              </p>
              <div style={{ marginTop: 'auto', font: '500 12px var(--mono)', color: 'var(--dim)', background: 'var(--roast)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px' }}>
                /plugin install golden-beans
              </div>
            </div>
            <a href="/install" className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ font: '700 12px var(--mono)', color: 'var(--gold)', letterSpacing: '.1em' }}>③ SDK IMPORT</span>
                <span className="tag tag-live">✅ LIVE</span>
              </div>
              <h3 style={{ fontSize: 18 }}>For your engineers</h3>
              <p style={{ fontSize: 14, color: 'var(--dim)' }}>
                An npm-installed SDK, first event out in minutes. Few lines to your first North
                Star input — <code style={{ font: '500 12px var(--mono)', color: 'var(--crema)' }}>track</code>,{' '}
                <code style={{ font: '500 12px var(--mono)', color: 'var(--crema)' }}>trackAdoption</code>,{' '}
                <code style={{ font: '500 12px var(--mono)', color: 'var(--crema)' }}>bucket</code>.
              </p>
              <div style={{ marginTop: 'auto', font: '500 12px var(--mono)', color: 'var(--gold-hot)', background: 'var(--roast)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px' }}>
                npm install @golden-beans/sdk
              </div>
            </a>
          </div>
          <p className="note" style={{ margin: '18px 0 0' }}>
            The SDK is always the data-in layer. The routes above are how humans — and their agents — operate what it collects.
          </p>
        </div>
      </section>
    </>
  )
}
