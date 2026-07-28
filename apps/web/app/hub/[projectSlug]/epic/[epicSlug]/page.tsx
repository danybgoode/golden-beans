import { notFound } from 'next/navigation'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { getHubRoadmap } from '@/lib/hub-query'
import { formatFreshness } from '@/lib/hub-freshness'
import { isRoadmapStatusShipped } from '@/lib/roadmap-artifact-schema'
import { FreshnessStamp, EmptyHubState } from '../../../hub-components'
import { Badge } from '@/components/ui/Badge'
import styles from '../../../hub.module.css'

export const dynamic = 'force-dynamic'

// pod-report · Sprint 1, Story 1.2 — the epic drill-down: one epic's sprints and their story
// progress, ✅ ticks for shipped, and the risk tier. Reads the SAME summarized artifact the journey
// view does (lib/hub-query.ts), so an epic that renders here is exactly the epic the journey view
// linked to.
export default async function HubEpicDrilldownPage({
  params,
}: {
  params: Promise<{ projectSlug: string; epicSlug: string }>
}) {
  const { projectSlug, epicSlug } = await params
  await requireDashboardAccess(projectSlug)

  const result = await getHubRoadmap(projectSlug)
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Roadmap artifact lookup failed')
    if (result.reason === 'project_not_found') notFound()

    // 'no_artifact': an unpushed tenant has no epic to drill into either. The same friendly empty
    // state as the journey view, not a bare 404 — a 404 here would read as "this epic doesn't
    // exist", when the real story is "nothing has been pushed at all".
    return (
      <main className={styles.hub}>
        <div className="wrap">
          <p>
            <a href={`/hub/${encodeURIComponent(projectSlug)}`}>← Roadmap hub</a>
          </p>
          <EmptyHubState projectSlug={projectSlug} />
        </div>
      </main>
    )
  }

  const { artifact, summary } = result
  const epic = summary.epics.find((e) => e.slug === epicSlug)
  if (!epic) notFound()

  const freshness = formatFreshness(artifact.generatedAt, new Date(), artifact.sourceCommit)
  const risk = epic.risk ? String(epic.risk).trim() : null

  return (
    <main className={styles.hub}>
      <div className="wrap">
        <p>
          <a href={`/hub/${encodeURIComponent(projectSlug)}`}>← Roadmap hub</a>
        </p>

        <div className="agent-win">
          <div className="agent-bar">
            <span className="agent-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
            <span>growth-engine · epic drill-down</span>
            <span className="agent-chip">{epic.shipped ? '● shipped' : '● in progress'}</span>
          </div>
          <div className="agent-body">
            <p className="you">
              <b>you ▸</b> how&apos;s {epic.name} going?
            </p>
            <h1>{epic.name}</h1>
            <p>
              <Badge status={epic.shipped ? 'live' : 'next'}>
                {epic.shipped ? 'shipped' : 'in progress'}
              </Badge>
              {risk && (
                <span className={styles.riskTag} data-risk={risk.toLowerCase()}>
                  {risk} risk
                </span>
              )}
            </p>
            <FreshnessStamp freshness={freshness} />
          </div>
        </div>

        <h2>Sprints</h2>
        {epic.sprints.length === 0 ? (
          <p className={styles.emptyStateInline}>No sprints recorded for this epic yet.</p>
        ) : (
          <ol className={styles.sprintList}>
            {epic.sprints.map((sprint) => {
              const shipped = isRoadmapStatusShipped(sprint.status)
              return (
                <li key={sprint.slug} className={styles.sprintRow}>
                  <Badge status={shipped ? 'live' : 'next'}>{shipped ? 'shipped' : 'in progress'}</Badge>
                  <span className={styles.sprintName}>{sprint.name}</span>
                  <span className={styles.sprintProgress}>{sprint.sprint_progress ?? '—'}</span>
                  <span className={styles.sprintStatus}>{sprint.status}</span>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </main>
  )
}
