import { DEMO_PROJECT_SLUG } from '@/lib/public-demo'
import { getFeatureFunnel } from '@/lib/tars-query'
import { getFeatureImpact } from '@/lib/north-star-query'
import { getExperimentComparison } from '@/lib/ab-query'

const FEATURE_KEY = 'setup_guide'
const INPUT_KEY = 'setup_guide_completions'
const EXPERIMENT_KEY = 'quick-upload-ui'
const CONVERSION_EVENT = 'upload_completed'
const MAX_BAR_HEIGHT = 140

// Presentation-layer helper over an already-fetched series — sum of the last 7 days vs. the 7
// before that. Not a new query function; the series itself comes from getFeatureImpact.
function weekOverWeek(series: { date: string; value: number }[]) {
  if (series.length === 0) return null
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const lastWeek = sorted.slice(-7)
  const priorWeek = sorted.slice(-14, -7)
  const lastSum = lastWeek.reduce((sum, p) => sum + p.value, 0)
  const priorSum = priorWeek.reduce((sum, p) => sum + p.value, 0)
  const current = sorted[sorted.length - 1].value
  const wow = priorSum > 0 ? (lastSum - priorSum) / priorSum : null
  return { current, wow, lastSum }
}

// Section 2 — Live proof. Reads the synthetic golden-beans-demo project ONLY, in-process (no
// self-fetch) — the same slug-based getters the unauthed /app/{funnel,impact,experiments} pages
// already call, with DEMO_PROJECT_SLUG as a hardcoded constant rather than request input (so the
// allow-list check in lib/public-demo.ts isn't needed here — it guards the HTTP boundary where a
// slug IS attacker-controlled; see app/api/v1/public/*). Data is seeded by
// scripts/seed-demo-project.mjs through the real, Bearer-authed API — see that script for the
// exact events (same wire contract @golden-beans/sdk's track()/trackExposure() send).
export async function LiveProofSection() {
  const [funnel, impact, experiment] = await Promise.all([
    getFeatureFunnel(DEMO_PROJECT_SLUG, FEATURE_KEY),
    getFeatureImpact(DEMO_PROJECT_SLUG, FEATURE_KEY),
    getExperimentComparison(DEMO_PROJECT_SLUG, EXPERIMENT_KEY, CONVERSION_EVENT),
  ])

  const tars = funnel.ok ? funnel.tars : null
  const maxCount = tars ? Math.max(tars.targeted, 1) : 1
  const adoptionRate = tars && tars.targeted > 0 ? Math.round((tars.adopted / tars.targeted) * 100) : 0
  const retentionRate = tars && tars.adopted > 0 ? Math.round((tars.retained / tars.adopted) * 100) : 0

  const input = impact.ok ? impact.inputs.find((i) => i.key === INPUT_KEY) : undefined
  const northStar = input ? weekOverWeek(input.series) : null

  const comparison = experiment.ok ? experiment.comparison : null

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
            <b style={{ color: 'var(--crema)' }}>{DEMO_PROJECT_SLUG}</b> project by the same
            queries your agent would run.* No client data appears on this page, ever.
          </p>
          <div className="agent-win" style={{ borderRadius: 16 }}>
            <div className="agent-bar">
              <span className="agent-dots"><span /><span /><span /></span>
              claude — connected: golden-beans · {DEMO_PROJECT_SLUG}
              <span className="agent-chip">revocable</span>
            </div>
            <div className="agent-body" style={{ padding: '24px 26px', gap: 18 }}>
              <div className="you"><b>you ▸</b> how&apos;s the setup-guide funnel?</div>
              <div className="tool">
                <b>⚙ get_tars_funnel</b> {'{'} project: &quot;{DEMO_PROJECT_SLUG}&quot;, feature: &quot;{FEATURE_KEY}&quot; {'}'} →{' '}
                {tars
                  ? `{ targeted: ${tars.targeted}, adopted: ${tars.adopted}, retained: ${tars.retained} }`
                  : '{ no data yet — run npm run seed:demo }'}
              </div>
              {tars && (
                <div className="row2" style={{ gridTemplateColumns: '1fr 340px', gap: 28, alignItems: 'end' }}>
                  <div className="funnel">
                    <div className="bar">
                      <div style={{ height: (tars.targeted / maxCount) * MAX_BAR_HEIGHT }} />
                      Targeted · {tars.targeted.toLocaleString('en-US')}
                    </div>
                    <div className="bar">
                      <div style={{ height: (tars.adopted / maxCount) * MAX_BAR_HEIGHT }} />
                      Adopted · {tars.adopted.toLocaleString('en-US')}
                    </div>
                    <div className="bar">
                      <div style={{ height: (tars.retained / maxCount) * MAX_BAR_HEIGHT }} />
                      Retained · {tars.retained.toLocaleString('en-US')}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, paddingBottom: 8 }}>
                    Adoption <b className="data">{adoptionRate}%</b>, retention{' '}
                    <b className="data">{retentionRate}%</b>.{' '}
                    <span className="note" style={{ fontSize: 12 }}>
                      Targeted is registry-declared, not gateway-observed — the engine tells you so itself.
                    </span>
                  </div>
                </div>
              )}
              <hr />
              <div className="you"><b>you ▸</b> and the north star?</div>
              <div className="tool">
                <b>⚙ get_north_star</b> {'{'} project: &quot;{DEMO_PROJECT_SLUG}&quot; {'}'} →{' '}
                {northStar
                  ? `{ metric: "payable_sellers", value: ${northStar.current}, wow: ${northStar.wow !== null ? northStar.wow.toFixed(3) : 'n/a'} }`
                  : '{ no data yet — run npm run seed:demo }'}
              </div>
              {northStar && (
                <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div className="data" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1 }}>
                      {northStar.current}{' '}
                      {northStar.wow !== null && (
                        <span style={{ fontSize: 16, color: northStar.wow >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {northStar.wow >= 0 ? '+' : ''}
                          {(northStar.wow * 100).toFixed(1)}% {northStar.wow >= 0 ? '↗' : '↘'}
                        </span>
                      )}
                    </div>
                    <div style={{ font: '500 12.5px var(--mono)', color: 'var(--dim)', marginTop: 8 }}>
                      payable_sellers · setup_guide_completions linked · per-feature impact report
                    </div>
                  </div>
                </div>
              )}
              <hr />
              <div className="you"><b>you ▸</b> is quick-upload winning?</div>
              <div className="tool">
                <b>⚙ compare_experiment</b> {'{'} experiment: &quot;{EXPERIMENT_KEY}&quot;, metricEvent: &quot;{CONVERSION_EVENT}&quot; {'}'}
              </div>
              {comparison && comparison.variants.length > 0 && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {comparison.variants.map((v) => {
                    const isBaseline = v.key === comparison.baseline
                    return (
                      <div
                        key={v.key}
                        style={{
                          flex: '1 1 220px',
                          minWidth: 220,
                          background: 'var(--roast)',
                          border: `1px solid ${isBaseline ? 'var(--line)' : 'var(--gold)'}`,
                          borderRadius: 10,
                          padding: 16,
                          font: '500 13px var(--mono)',
                          color: 'var(--dim)',
                        }}
                      >
                        {v.key} {isBaseline ? '(baseline)' : ''}
                        <b
                          style={{
                            display: 'block',
                            fontSize: 26,
                            color: isBaseline ? 'var(--crema)' : 'var(--gold-hot)',
                            margin: '6px 0 2px',
                          }}
                        >
                          {(v.conversionRate * 100).toFixed(1)}%
                        </b>
                        {v.exposures.toLocaleString('en-US')} exposed · {v.conversions.toLocaleString('en-US')} converted
                        {!isBaseline && v.lift !== null && (
                          <>
                            {' '}
                            <span style={{ color: v.lift >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                              {v.lift >= 0 ? '+' : ''}
                              {(v.lift * 100).toFixed(1)}%
                            </span>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="note" style={{ fontSize: 12 }}>
                deterministic client-side bucketing · basic lift only — no significance engine yet, and we won&apos;t pretend otherwise.
              </div>
            </div>
          </div>
          <p className="note" style={{ margin: '18px 0 0' }}>
            * These numbers are independently checkable: /api/v1/public/north-star is public for
            the demo project and returns the same underlying data. Curl it mid-meeting.
          </p>
        </div>
      </section>
    </>
  )
}
