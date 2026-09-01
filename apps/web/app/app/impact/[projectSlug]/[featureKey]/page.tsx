import { notFound } from 'next/navigation'
import { getFeatureImpact } from '@/lib/north-star-query'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { ProductShell } from '@/components/product/ProductShell'
import { Answer, Card, Crumb, Crumbs, PageHead } from '@/design-system/primitives'
import { HeroFigure, Plot, seriesAbsence } from '@/design-system/charts'
import { ImpactPane } from '@/app/app/flags/[projectSlug]/[flagKey]/feature-panes'

// Growth Engine v1 · Sprint 3, Story 3.4 — the per-feature input-impact report. Behind per-tenant
// authorization (multi-tenant-activation Story 1.2) — same gate as /app/funnel: demo is anonymous,
// every other slug requires a signed-in member.
//
// ── design-system-rails · Sprint 5, Story 5.3 — reference state `measure-north-star` ──────────
// The manifest maps this route to `measure-north-star`, and the mapping is an ARCHITECT's call
// recorded there: the approved Measure rail opens on "North Star", the product has no
// `/app/north-star` route, and this is the only route that renders the North Star and something
// moving against it. So this page IS that state, feature-scoped.
//
// ⚠️ **THE HERO IS EMPTY, BY CONSTRUCTION, AND THAT IS THE DELIVERABLE** (sprint L1).
//
// The approved state opens on a big number and a fourteen-week plot. This product cannot produce
// either: `readNorthStar` in `lib/pod-report-query.ts` returns `latestValue: null` unconditionally —
// its own comment says "deliberately reports a LEVEL and never a trend" — and the schema has no
// table to read a level from at all (`north_star_metrics`, `leading_inputs`, `input_values`, and
// `input_values` belongs to an INPUT). Drawing a number here would mean inventing one.
//
// So the hero renders the sentence, and the plot renders why there is no plot. An empty state is one
// of the nine and is a deliverable, not a fallback (epic D10). The half of the design that this
// product CAN fill — *What fed it*, the inputs' real series as small multiples — is filled, by the
// same `ImpactPane` the feature page's Impact tab renders (DD5).
//
// ProductShell now reads the session cookie on every render (lib/shell-nav.ts), so this route is
// request-time by nature. Declared rather than inferred: LEARNINGS records a feature gate's required
// 404 turning into a 200 when a parent streamed, and an implicit-dynamic route is the same class of
// surprise — the behaviour should be in the file, not in a rule about generateStaticParams.
export const dynamic = 'force-dynamic'

export default async function ImpactPage({
  params,
}: {
  params: Promise<{ projectSlug: string; featureKey: string }>
}) {
  const { projectSlug, featureKey } = await params
  await requireDashboardAccess(projectSlug)
  const result = await getFeatureImpact(projectSlug, featureKey)
  // A failed read THROWS; an absent feature 404s. Collapsing them would render an outage as a
  // truthful-sounding absence, which is the distinction this whole file is careful about.
  if (!result.ok && result.reason === 'query_failed') throw new Error('Impact lookup failed')
  if (!result.ok) notFound()

  // Every input this feature feeds points at the same North Star metric; the read carries its key on
  // each input rather than as a field of its own, so this reads it off the first one instead of
  // running a second query for a value it already has.
  const metricKey = result.inputs[0]?.metricKey ?? null

  return (
    <ProductShell projectSlug={projectSlug} section="measure" railActive={null}>
      <main>
        <Crumbs back={{ href: `/app/flags/${projectSlug}`, label: 'Features' }}>
          <Crumb mono>{featureKey}</Crumb>
          <Crumb>Impact</Crumb>
        </Crumbs>
        <PageHead
          title="North Star"
          lede="The one number this project is trying to move, and what this feature feeds into it."
        />
        <Answer>
          <strong>
            {metricKey === null
              ? 'This project has no North Star metric registered.'
              : 'This project has a North Star, and the engine holds no reading for it.'}
          </strong>{' '}
          What it CAN show is underneath: every leading input attached to{' '}
          <span className="ds-mono">{featureKey}</span>, with what each one has actually recorded.
        </Answer>

        <Card>
          <HeroFigure
            value={null}
            absent={
              <>
                {metricKey === null ? (
                  'No North Star metric is registered for this project yet.'
                ) : (
                  <>
                    <span className="ds-mono">{metricKey}</span> is registered, and no value has ever
                    been recorded for it — a defined metric with no reading, which is not a reading of
                    zero.
                  </>
                )}{' '}
                The engine records readings for the <em>inputs</em> below; the metric itself is synced
                in from outside the product, and nothing has synced one.
              </>
            }
          />
          {/* The plot the approved state draws, in the state the data supports. `Plot` renders the
              sentence rather than a stroke — there is no series here at all, and an empty axis frame
              would read as "flat" to anyone glancing at it. */}
          <Plot series={[]} label="North Star" unreadable={seriesAbsence([], 'North Star reading')} />
        </Card>

        <p className="ds-label">What fed it</p>
        <ImpactPane flagKey={featureKey} result={result} />
      </main>
    </ProductShell>
  )
}
