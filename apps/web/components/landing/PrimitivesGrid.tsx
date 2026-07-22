// Section 6 — Primitives grid, the "bag label." Rows mirror what growth-engine-v1 actually
// shipped (Roadmap/01-growth-engine/growth-engine-v1/README.md) — every ✅ row here is curl-able
// today against the demo project; rows flip as later epics ship (Story 1.4's registry drives the
// section-level badge, not these per-row facts, which are a fixed historical record of S1-S4).
export function PrimitivesGrid() {
  return (
    <>
      <div className="divider">
        <div className="wrap">
          <span className="num">⑥</span>
          <span className="stamp-title">What&apos;s in the bag</span>
          <span className="tag tag-stamp">LIVE — rows flip as epics ship</span>
        </div>
      </div>
      <section id="primitives">
        <div className="wrap row2" style={{ gridTemplateColumns: '.9fr 1.1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 34 }}>Primitives, honestly badged.</h2>
            <p style={{ margin: '14px 0 0', color: 'var(--dim)', maxWidth: 440 }}>
              The label is the feature grid. If a row says ✅, you can curl it today* — the badge
              flips in the same epic that ships the capability, or it doesn&apos;t flip at all.
            </p>
            <p className="note" style={{ margin: '14px 0 0' }}>
              * Try it: GET /api/v1/public/north-star on the demo project. No sales call required.
            </p>
          </div>
          <div className="baglabel">
            <div className="roundstamp">SMALL<br />BATCH<br />★★★</div>
            <div className="brand">
              <b>GOLDEN BEANS</b>
              <small>SINGLE-ORIGIN GROWTH PRIMITIVES</small>
            </div>
            <div className="netwt"><span>NET WT.</span><span>6 primitives shipped · 4 roasting</span></div>
            <div className="row"><span>schema-validated telemetry ingest · tenant-scoped</span><b className="ok">✅ SHIPPED</b></div>
            <div className="row"><span>TypeScript SDK · track / trackAdoption / bucket</span><b className="ok">✅ SHIPPED</b></div>
            <div className="row"><span>feature registry + TARS funnels</span><b className="ok">✅ SHIPPED</b></div>
            <div className="row"><span>North Star metric + per-feature impact</span><b className="ok">✅ SHIPPED</b></div>
            <div className="row"><span>A/B comparison (basic lift)</span><b className="ok">✅ SHIPPED</b></div>
            {/* event-destination-router · Sprint 3, Story 3.3 — the public-offer backfill. Flipped
                🔜 → ✅ on 2026-07-22, when BOTH acceptance conditions held: the dispatcher is LIVE in
                production (DESTINATION_DELIVERY_ENABLED flipped ON) AND the CRM projection proof
                (Story 3.1, the Miyagi consumer in medusa-bonsai) has landed and is receiving signed
                deliveries. An owner can create a signed destination at /app/destinations today and
                receive their project's events — so the ✅ is honest (curl-able today).
                Wording stays "at-least-once", never exactly-once — delivery is at-least-once by
                contract and claiming otherwise on the bag label would be a lie the architecture
                cannot back. */}
            <div className="row"><span>signed event destinations · at-least-once, with retries</span><b className="ok">✅ SHIPPED</b></div>
            <div className="row"><span>read-only MCP connector</span><b>🔜 Sprint 2</b></div>
            <div className="row"><span>self-serve tenants &amp; auth hardening</span><b>🔜 multi-tenant-activation</b></div>
            <div className="row"><span>pod report (velocity, DORA, cost per point)</span><b>🔜 pod-report</b></div>
            <div className="row"><span>the inverted loop (signal → your agent → fix)</span><b>🔜 signals-loop</b></div>
            <div className="foot"><span>INTEGRATED AI</span><span>0g (0% DV)</span></div>
            <div className="motto">ROASTED IN SMALL BATCHES · BEST SERVED THROUGH YOUR OWN AGENT</div>
          </div>
        </div>
      </section>
    </>
  )
}
