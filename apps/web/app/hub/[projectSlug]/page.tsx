import { notFound } from 'next/navigation'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { getHubRoadmap } from '@/lib/hub-query'
import { formatFreshness } from '@/lib/hub-freshness'
import { journeyMarkerIndex } from '@/lib/hub-journey'
import { FreshnessStamp, EmptyHubState } from '../hub-components'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import styles from '../hub.module.css'

export const dynamic = 'force-dynamic'

// pod-report · Sprint 1, Story 1.2 — the journey view: the build order rendered as a path, shipped
// epics behind, a "you are here" marker, what's next ahead. golden-beans pushes its OWN roadmap as
// tenant #0 (Story 1.1's CI rail — same client-pushes rail a customer uses), so this page is how
// the team reads "where are we" without a doc dive, and later (Sprint 3) how a client/investor
// reads it through a scoped share link.
export default async function HubJourneyPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  await requireDashboardAccess(projectSlug)

  const result = await getHubRoadmap(projectSlug)
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Roadmap artifact lookup failed')
    if (result.reason === 'project_not_found') notFound()

    return (
      <main className={styles.hub}>
        <div className="wrap">
          <p className={styles.kicker}>Roadmap Hub · {projectSlug}</p>
          <EmptyHubState projectSlug={projectSlug} />
        </div>
      </main>
    )
  }

  const { artifact, summary } = result
  const freshness = formatFreshness(artifact.generatedAt, new Date(), artifact.sourceCommit)
  const markerIndex = journeyMarkerIndex(summary.epics)
  const destinationReached = summary.epics.length > 0 && markerIndex === summary.epics.length

  return (
    <main className={styles.hub}>
      <div className="wrap">
        <p className={styles.kicker}>Roadmap Hub · {projectSlug}</p>

        {/* The agent-window frame device (references/design-direction.md): the page performs the
            same mechanic as the landing's live-proof section — an agent asking the engine a
            question and getting the real, current answer back. */}
        <div className="agent-win">
          <div className="agent-bar">
            <span className="agent-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
            <span>growth-engine · roadmap hub</span>
            <span className="agent-chip">{freshness.tone === 'stale' ? '● stale' : '● live'}</span>
          </div>
          <div className="agent-body">
            <p className="you">
              <b>you ▸</b> where are we on the road, {projectSlug}?
            </p>
            <div className="tool">
              <Icon name="settings" />
              <b>getLatestArtifact</b> report_artifacts · kind=roadmap · v{artifact.version}
            </div>
            <p>
              <b className="data">{summary.counts.shippedEpics}</b>/
              <b className="data">{summary.counts.epics}</b> epics shipped ·{' '}
              <b className="data">{summary.counts.sprints}</b> sprints tracked
            </p>
            <FreshnessStamp freshness={freshness} />
          </div>
        </div>

        <div className={styles.counts}>
          <div className={styles.countPill}>
            <b className="data">{summary.counts.shippedEpics}</b>
            <span>shipped</span>
          </div>
          <div className={styles.countPill}>
            <b className="data">{summary.counts.epics}</b>
            <span>epics on the road</span>
          </div>
          <div className={styles.countPill}>
            <b className="data">{summary.counts.sprints}</b>
            <span>sprints</span>
          </div>
          <div className={styles.countPill}>
            <b className="data">{summary.counts.seeds}</b>
            <span>seeds on the horizon</span>
          </div>
        </div>

        {summary.epics.length === 0 ? (
          <p className={styles.emptyStateInline}>
            The latest push has no epics yet — check back once one is groomed onto the road.
          </p>
        ) : (
          <nav className={styles.journey} aria-label="Build-order journey">
            <ol className={styles.journeyTrack}>
              {summary.epics.map((epic, i) => (
                <li
                  key={epic.slug}
                  className={`${styles.epicNode} ${epic.shipped ? styles.epicNodeShipped : styles.epicNodeUpcoming}`}
                >
                  {i === markerIndex && (
                    <span className={styles.marker}>
                      <Icon name="map-pin" /> you are here
                    </span>
                  )}
                  <a
                    href={`/hub/${encodeURIComponent(projectSlug)}/epic/${encodeURIComponent(epic.slug)}`}
                    className={styles.epicLink}
                  >
                    <span className={styles.epicDot} aria-hidden="true" />
                    <span className={styles.epicLabel}>{epic.name}</span>
                    <Badge status={epic.shipped ? 'live' : 'next'}>
                      {epic.shipped ? 'shipped' : i === markerIndex ? 'building' : 'next'}
                    </Badge>
                  </a>
                </li>
              ))}
              {destinationReached && (
                <li className={styles.markerFlag}>
                  <Icon name="map-pin" /> you are here — <Icon name="flag" /> destination reached
                </li>
              )}
            </ol>
          </nav>
        )}

        {summary.seeds.length > 0 && (
          <p className={styles.seedNote}>
            +{summary.seeds.length} idea{summary.seeds.length === 1 ? '' : 's'} on the horizon, not yet
            groomed onto the road.
          </p>
        )}
      </div>
    </main>
  )
}
