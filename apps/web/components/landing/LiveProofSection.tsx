// Section 2 — Live proof. Story 1.1 scaffolds the `.agent-win` chat-chrome shell with
// placeholder numbers matching the design reference (references/design/e1.html); Story 1.2
// replaces the placeholder values below with real query results from the synthetic
// `golden-beans-demo` project (lib/tars-query.ts / lib/north-star-query.ts / lib/ab-query.ts,
// called in-process — see lib/public-demo.ts for the read-path allow-list).
export function LiveProofSection() {
  return (
    <>
      <div className="divider">
        <div className="wrap">
          <span className="num">②</span>
          <span className="stamp-title">Live proof — straight from the roaster</span>
          <span className="tag tag-stamp">LIVE</span>
        </div>
      </div>
      <section className="band" id="live-proof">
        <div className="wrap">
          <h2 style={{ fontSize: 34 }}>Not screenshots. The actual engine, live.</h2>
          <p style={{ margin: '12px 0 28px', color: 'var(--dim)', maxWidth: 640 }}>
            Everything below is rendered from the synthetic{' '}
            <b style={{ color: 'var(--crema)' }}>golden-beans-demo</b> project by the same queries
            your agent would run.* No client data appears on this page, ever.
          </p>
          <div className="agent-win" style={{ borderRadius: 16 }}>
            <div className="agent-bar">
              <span className="agent-dots"><span /><span /><span /></span>
              claude — connected: golden-beans · golden-beans-demo
              <span className="agent-chip">revocable</span>
            </div>
            <div className="agent-body" style={{ padding: '24px 26px', gap: 18 }}>
              <div className="you"><b>you ▸</b> how&apos;s the setup-guide funnel?</div>
              <div className="tool">
                <b>⚙ get_tars_funnel</b> {'{'} project: &quot;golden-beans-demo&quot;, feature: &quot;setup_guide&quot; {'}'} →{' '}
                {'{'} targeted: —, adopted: —, retained: — {'}'}
              </div>
              <div className="row2" style={{ gridTemplateColumns: '1fr 340px', gap: 28, alignItems: 'end' }}>
                <div className="funnel">
                  <div className="bar"><div style={{ height: 0 }} />Targeted</div>
                  <div className="bar"><div style={{ height: 0 }} />Adopted</div>
                  <div className="bar"><div style={{ height: 0 }} />Retained</div>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, paddingBottom: 8 }}>
                  <span className="note" style={{ fontSize: 12 }}>
                    Targeted is registry-declared, not gateway-observed — the engine tells you so itself.
                  </span>
                </div>
              </div>
              <hr />
              <div className="you"><b>you ▸</b> and the north star?</div>
              <div className="tool">
                <b>⚙ get_north_star</b> {'{'} project: &quot;golden-beans-demo&quot; {'}'} → {'{'} metric: &quot;payable_sellers&quot; {'}'}
              </div>
              <p className="note" style={{ fontSize: 12 }}>Wired to real data in Story 1.2.</p>
              <hr />
              <div className="you"><b>you ▸</b> is quick-upload winning?</div>
              <div className="tool">
                <b>⚙ compare_experiment</b> {'{'} experiment: &quot;quick-upload-ui&quot;, metricEvent: &quot;upload_completed&quot; {'}'}
              </div>
              <div className="note" style={{ fontSize: 12 }}>
                deterministic client-side bucketing · basic lift only — no significance engine yet, and we won&apos;t pretend otherwise.
              </div>
            </div>
          </div>
          <p className="note" style={{ margin: '18px 0 0' }}>
            * Same endpoints, same JSON: /api/v1/public/north-star is public for the demo project. Curl it mid-meeting.
          </p>
        </div>
      </section>
    </>
  )
}
