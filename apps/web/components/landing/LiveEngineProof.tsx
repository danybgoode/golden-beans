import { DEMO_PROJECT_SLUG } from '@/lib/public-demo'
import { getFeatureFunnel } from '@/lib/tars-query'
import { getFeatureImpact } from '@/lib/north-star-query'
import { getExperimentComparison } from '@/lib/ab-query'
// Extracted from this file during PR #92's review: it prints a percentage beside a claim that the
// numbers are checkable, and as a private helper here nothing could test it. See the module for
// the negative-slice bug that made a flat series read as +133%.
import { weekOverWeek } from '@/lib/week-over-week'
import { ActivityFeedItem } from '@/components/ui/ActivityFeedItem'
import { AgentWindow } from '@/components/ui/AgentWindow'
import { Icon } from '@/components/ui/Icon'
import { SurfaceNote } from './SurfaceNote'

const FEATURE_KEY = 'setup_guide'
const INPUT_KEY = 'setup_guide_completions'
const EXPERIMENT_KEY = 'quick-upload-ui'
const CONVERSION_EVENT = 'upload_completed'

// Section 2 — Live proof. Reads the synthetic golden-beans-demo project ONLY, in-process (no
// self-fetch) — the same slug-based getters the unauthed /app/{funnel,impact,experiments} pages
// already call, with DEMO_PROJECT_SLUG as a hardcoded constant rather than request input (so the
// allow-list check in lib/public-demo.ts isn't needed here — it guards the HTTP boundary where a
// slug IS attacker-controlled; see app/api/v1/public/*). Data is seeded by
// scripts/seed-demo-project.mjs through the real, Bearer-authed API — see that script for the
// exact events (same wire contract @golden-frijoles/sdk's track()/trackExposure() send).
export async function LiveEngineProof() {
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
    <div className="proof-block">
      <div>
        <p className="kicker">The engine, live</p>
        <h3 className="card-title">Not screenshots. The actual engine, right now.</h3>
        {/* The ONE surface note on this page that says "real" rather than "example" (epic D4).
            Every other framed window on the landing is an illustration; this one is a read of the
            demo tenant performed while the page was rendering. That distinction is the entire
            reason the live proof survived the redesign — see the epic README's D2. */}
        <SurfaceNote
          label="A real read, performed just now"
          detail="Not an illustration — the same queries your agent would run"
        />
        <p className="live-proof__intro">
          Everything below is rendered from the synthetic <b>{DEMO_PROJECT_SLUG}</b> project by the same
          queries your agent would run.* No client data appears on this page, ever.
        </p>
        {/* No bar text. It read "claude — connected: golden-frijoles · golden-beans-demo" with a
            green "revocable" chip, which is a second answer to "is this real" beside the
            `SurfaceNote` above — and the note is the one the page's honesty spec actually checks. */}
        <AgentWindow className="live-proof__window">
          <ActivityFeedItem actor="human">how&apos;s the setup-guide funnel?</ActivityFeedItem>
          <ActivityFeedItem actor="agent" name="get_tars_funnel">
            {'{'} project: &quot;{DEMO_PROJECT_SLUG}&quot;, feature: &quot;
            {FEATURE_KEY}&quot; {'}'} →{' '}
            {tars
              ? `{ targeted: ${tars.targeted}, adopted: ${tars.adopted}, retained: ${tars.retained} }`
              : '{ no data yet — run npm run seed:demo }'}
          </ActivityFeedItem>
          {tars && (
            <div className="row2 funnel-layout">
              <div className="funnel">
                {[
                  ['Targeted', tars.targeted],
                  ['Adopted', tars.adopted],
                  ['Retained', tars.retained],
                ].map(([label, value]) => {
                  const height = Math.max(0, Math.min(100, (Number(value) / maxCount) * 100))
                  const gradientId = `funnel-${String(label).toLowerCase()}`
                  return (
                    <div className="bar" key={label}>
                      <svg
                        className="funnel-fill"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <defs>
                          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="var(--gold-hot)" />
                            <stop offset="1" stopColor="var(--gold-deep)" />
                          </linearGradient>
                        </defs>
                        <rect
                          x="0"
                          y={100 - height}
                          width="100"
                          height={height}
                          rx="5"
                          fill={`url(#${gradientId})`}
                        />
                      </svg>
                      {label} · {Number(value).toLocaleString('en-US')}
                    </div>
                  )
                })}
              </div>
              <div className="funnel-summary">
                Adoption <b className="data">{adoptionRate}%</b>, retention{' '}
                <b className="data">{retentionRate}%</b>.{' '}
                <span className="note">
                  Targeted is registry-declared, not gateway-observed — the engine tells you so itself.
                </span>
              </div>
            </div>
          )}

          <hr />
          <ActivityFeedItem actor="human">and the north star?</ActivityFeedItem>
          <ActivityFeedItem actor="agent" name="get_north_star">
            {'{'} project: &quot;{DEMO_PROJECT_SLUG}&quot; {'}'} →{' '}
            {northStar
              ? `{ metric: "payable_sellers", value: ${northStar.current}, wow: ${northStar.wow !== null ? northStar.wow.toFixed(3) : 'n/a'} }`
              : '{ no data yet — run npm run seed:demo }'}
          </ActivityFeedItem>
          {northStar && (
            <div className="north-star">
              <div>
                <div className="north-star__value">
                  {northStar.current}{' '}
                  {northStar.wow !== null && (
                    <span className={`trend trend--${northStar.wow >= 0 ? 'up' : 'down'}`}>
                      {northStar.wow >= 0 ? '+' : ''}
                      {(northStar.wow * 100).toFixed(1)}%
                      <Icon name={northStar.wow >= 0 ? 'trend-up' : 'trend-down'} />
                    </span>
                  )}
                </div>
                <div className="north-star__meta">
                  payable_sellers · setup_guide_completions linked · per-feature impact report
                </div>
              </div>
            </div>
          )}

          <hr />
          <ActivityFeedItem actor="human">is quick-upload winning?</ActivityFeedItem>
          <ActivityFeedItem actor="agent" name="compare_experiment">
            {'{'} experiment: &quot;{EXPERIMENT_KEY}&quot;, metricEvent: &quot;
            {CONVERSION_EVENT}&quot; {'}'}
          </ActivityFeedItem>
          {comparison && comparison.variants.length > 0 && (
            <div className="experiment-grid">
              {comparison.variants.map((variant) => {
                const isBaseline = variant.key === comparison.baseline
                return (
                  <div
                    className={`experiment-variant${isBaseline ? ' experiment-variant--baseline' : ''}`}
                    key={variant.key}
                  >
                    {variant.key} {isBaseline ? '(baseline)' : ''}
                    <b>{(variant.conversionRate * 100).toFixed(1)}%</b>
                    {variant.exposures.toLocaleString('en-US')} exposed ·{' '}
                    {variant.conversions.toLocaleString('en-US')} converted
                    {!isBaseline && variant.lift !== null && (
                      <span className={`experiment-variant__lift lift--${variant.lift >= 0 ? 'up' : 'down'}`}>
                        {' '}
                        {variant.lift >= 0 ? '+' : ''}
                        {(variant.lift * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div className="note">
            deterministic client-side bucketing · basic lift only — no significance engine yet, and we
            won&apos;t pretend otherwise.
          </div>
        </AgentWindow>
        <p className="note live-proof__footnote">
          * These numbers are independently checkable: /api/v1/public/north-star is public for the demo
          project and returns the same underlying data. Curl it mid-meeting.
        </p>
      </div>
    </div>
  )
}
