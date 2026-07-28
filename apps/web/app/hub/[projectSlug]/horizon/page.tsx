import { notFound } from 'next/navigation'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { getHubRoadmap } from '@/lib/hub-query'
import { formatFreshness } from '@/lib/hub-freshness'
import { deriveHorizon, type DestinationStatus } from '@/lib/horizon-destinations'
import { FreshnessStamp, EmptyHubState } from '../../hub-components'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import styles from '../../hub.module.css'

export const dynamic = 'force-dynamic'

// pod-report · Sprint 1, Story 1.3 — the horizon view: progress read against the DESTINATION.
//
// The failure mode this page exists to avoid is rendering a backlog. A list of epics sorted by
// status answers "what have we done"; a stakeholder is asking "how much of where we're going is
// lit". So destinations lead, and epics appear only underneath as the things that light them —
// never the other way round.
//
// Every badge comes verbatim from `deriveHorizon`, which takes each epic's already-derived
// `shipped` boolean from `summarizeRoadmap`. This page re-derives nothing, so "nothing claims ✅ for
// unshipped work" holds by construction rather than by this file remembering to check.

const STATUS_LABEL: Record<DestinationStatus, string> = {
  lit: 'lit',
  partial: 'partly lit',
  coming: 'on the way',
}

const STATUS_CLASS: Record<DestinationStatus, string> = {
  lit: styles.destLit,
  partial: styles.destPartial,
  coming: styles.destComing,
}

export default async function HubHorizonPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  await requireDashboardAccess(projectSlug)

  const result = await getHubRoadmap(projectSlug)
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Roadmap artifact lookup failed')
    if (result.reason === 'project_not_found') notFound()

    return (
      <main className={styles.hub}>
        <div className="wrap">
          <p className={styles.kicker}>Horizon · {projectSlug}</p>
          <EmptyHubState projectSlug={projectSlug} />
        </div>
      </main>
    )
  }

  const { artifact, summary } = result
  const freshness = formatFreshness(artifact.generatedAt, new Date(), artifact.sourceCommit)
  const destinations = deriveHorizon(
    summary.epics.map((e) => ({ slug: e.slug, name: e.name, shipped: e.shipped }))
  )
  const litCount = destinations.filter((d) => d.status === 'lit').length

  return (
    <main className={styles.hub}>
      <div className="wrap">
        <p className={styles.kicker}>Horizon · {projectSlug}</p>

        <div className="agent-win">
          <div className="agent-bar">
            <span className="agent-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
            <span>growth-engine · horizon</span>
            <span className="agent-chip">{freshness.tone === 'stale' ? '● stale' : '● live'}</span>
          </div>
          <div className="agent-body">
            <p className="you">
              <b>you ▸</b> how much of the destination is lit?
            </p>
            <div className="tool">
              <Icon name="settings" />
              <b>deriveHorizon</b> report_artifacts · kind=roadmap · v{artifact.version}
            </div>
            <p>
              <b className="data">{litCount}</b>/<b className="data">{destinations.length}</b> destinations
              fully lit
            </p>
            <FreshnessStamp freshness={freshness} />
          </div>
        </div>

        <ul className={styles.destGrid} aria-label="End-state destinations">
          {destinations.map((d) => (
            <li key={d.id} className={`${styles.destCard} ${STATUS_CLASS[d.status]}`} data-status={d.status}>
              <div className={styles.destHead}>
                <h2 className={styles.destTitle}>{d.title}</h2>
                <Badge
                  className={styles.destBadge}
                  status={d.status === 'lit' ? 'live' : 'next'}
                  data-testid={`dest-badge-${d.id}`}
                  aria-label={STATUS_LABEL[d.status]}
                >
                  {STATUS_LABEL[d.status]}
                </Badge>
              </div>
              <p className={styles.destDesc}>{d.description}</p>

              {d.litBy.length > 0 ? (
                <ul className={styles.destEpics}>
                  {d.litBy.map((e) => (
                    <li key={e.slug} className={e.shipped ? styles.destEpicShipped : styles.destEpicPending}>
                      <a href={`/hub/${encodeURIComponent(projectSlug)}/epic/${encodeURIComponent(e.slug)}`}>
                        <Badge status={e.shipped ? 'live' : 'next'}>{e.shipped ? 'shipped' : 'next'}</Badge>{' '}
                        {e.name}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                // Not an error state: a destination whose epics have not been pushed yet is simply
                // not on the road, and saying so plainly beats an empty box the reader has to
                // interpret.
                <p className={styles.destEpicsEmpty}>No epic on the road lights this yet.</p>
              )}
            </li>
          ))}
        </ul>

        {summary.seeds.length > 0 && (
          <section className={styles.hazeSection} aria-label="Ideas on the horizon">
            <h2 className={styles.hazeHeading}>Further out — on the horizon</h2>
            <p className={styles.hazeNote}>
              Un-groomed ideas, deliberately hazy. These are <strong>not promised</strong> and carry no date —
              an idea rendered like a commitment is the one dishonesty this view exists to avoid.
            </p>
            <ul className={styles.hazeList} data-testid="horizon-seeds">
              {summary.seeds.map((seed) => (
                <li key={seed.slug} className={styles.hazeItem}>
                  {seed.name}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
