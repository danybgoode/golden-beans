import { notFound } from 'next/navigation'
import { getFeatureImpact } from '@/lib/north-star-query'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { ProductShell } from '@/components/product/ProductShell'
import { StatCard } from '@/components/ui/StatCard'
import { ImpactSeriesTable } from './series-table'

// Growth Engine v1 · Sprint 3, Story 3.4 — the per-feature input-impact report (v1's
// headline case: /impact/miyagisanchez/setup_guide). Behind per-tenant authorization
// (multi-tenant-activation Story 1.2) — same gate as /funnel: demo is anonymous, every other
// slug requires a signed-in member.
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
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Impact lookup failed')
    notFound()
  }

  const { feature, inputs } = result

  return (
    <ProductShell projectSlug={projectSlug}>
      <main>
        <h1>
          Impact — {feature.key} <small>({projectSlug})</small>
        </h1>
        {inputs.map((input) => {
          // Both paths that build `series` emit it sorted ascending by date — `computeDailySeries`
          // sorts explicitly and the pushed-value path uses `.order('occurred_on')` — so the last
          // element is the most recent day. Stated here because "latest" silently becoming
          // "whichever row the database returned first" is the kind of thing that reads fine
          // forever and is wrong once.
          const latest = input.series.at(-1) ?? null
          const total = input.series.reduce((sum, point) => sum + point.value, 0)

          return (
            <section key={input.key}>
              <h2>
                {input.name} <small>({input.valueSource})</small>
              </h2>

              {/*
                StatCards are rendered ONLY when there is a reading. An empty series is not a zero:
                a card reading "0" for a metric nobody has recorded is precisely the honest-looking
                zero this repo has shipped to production before and that StatCard's own null case
                exists to prevent. With no data, the table's empty sentence is the whole message.
              */}
              {input.series.length > 0 && latest ? (
                <div className="command-center__stats">
                  <StatCard
                    label="Latest"
                    value={String(latest.value)}
                    icon="gauge"
                    provenance={`on ${latest.date}`}
                  />
                  <StatCard
                    label="Total in window"
                    value={String(total)}
                    icon="trend-up"
                    provenance={`${input.series.length} ${input.series.length === 1 ? 'day' : 'days'} recorded`}
                  />
                  <StatCard
                    label="Days recorded"
                    value={String(input.series.length)}
                    icon="clock"
                    provenance={`${input.series[0].date} → ${latest.date}`}
                  />
                </div>
              ) : null}

              <ImpactSeriesTable inputName={input.name} series={input.series} />
            </section>
          )
        })}
      </main>
    </ProductShell>
  )
}
