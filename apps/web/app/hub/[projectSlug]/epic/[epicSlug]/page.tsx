import { notFound } from 'next/navigation'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { getHubRoadmap } from '@/lib/hub-query'
import { formatFreshness } from '@/lib/hub-freshness'
import { isRoadmapStatusShipped } from '@/lib/roadmap-artifact-schema'
import { EmptyHubState, HubProvenance } from '../../../hub-components'
import { HubFrame } from '../../../hub-frame'
import { Answer, Callout, Crumbs, Crumb, PageHead, Pill, Tag, Tile, Tiles } from '@/design-system/primitives'

export const dynamic = 'force-dynamic'

// pod-report · Sprint 1, Story 1.2 — the epic drill-down: one epic's sprints and their story
// progress, ticks for shipped, and the risk tier. Reads the SAME summarized artifact the journey
// view does (lib/hub-query.ts), so an epic that renders here is exactly the epic the journey view
// linked to.
//
// design-system-rails · Sprint 6, Story 6.3 — reference state `hub-epic`. The `agent-win` device
// gives way to the approved breadcrumb, page head, four tiles and the sprint list; every number
// still comes from the artifact's own frontmatter, which is the only reason this page can be
// trusted about work nobody is watching.
export default async function HubEpicDrilldownPage({
  params,
}: {
  params: Promise<{ projectSlug: string; epicSlug: string }>
}) {
  const { projectSlug, epicSlug } = await params
  await requireDashboardAccess(projectSlug)

  const hubHref = `/hub/${encodeURIComponent(projectSlug)}`

  const result = await getHubRoadmap(projectSlug)
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Roadmap artifact lookup failed')
    if (result.reason === 'project_not_found') notFound()

    // 'no_artifact': an unpushed tenant has no epic to drill into either. The same friendly empty
    // state as the journey view, not a bare 404 — a 404 here would read as "this epic doesn't
    // exist", when the real story is "nothing has been pushed at all".
    return (
      <HubFrame projectSlug={projectSlug} tab="roadmap">
        <Crumbs back={{ href: hubHref, label: 'Roadmap' }}>
          <Crumb mono>{epicSlug}</Crumb>
        </Crumbs>
        <EmptyHubState projectSlug={projectSlug} />
      </HubFrame>
    )
  }

  const { artifact, summary } = result
  const epic = summary.epics.find((e) => e.slug === epicSlug)
  if (!epic) notFound()

  const freshness = formatFreshness(artifact.generatedAt, new Date(), artifact.sourceCommit)
  const risk = epic.risk ? String(epic.risk).trim() : null
  const shippedSprints = epic.sprints.filter((sprint) => isRoadmapStatusShipped(sprint.status)).length

  return (
    <HubFrame projectSlug={projectSlug} tab="roadmap">
      <Crumbs back={{ href: hubHref, label: 'Roadmap' }}>
        <Crumb mono>{epic.slug}</Crumb>
      </Crumbs>

      <PageHead
        title={epic.name}
        lede={epic.area}
        actions={
          epic.shipped ? (
            <Pill state="on">Shipped</Pill>
          ) : (
            <Tag tone="unclassified">In progress</Tag>
          )
        }
      />
      <HubProvenance
        freshness={freshness}
        from={`${epic.sprints.length} sprint${epic.sprints.length === 1 ? '' : 's'}`}
        version={artifact.version}
      />

      <Answer>
        <b>
          {shippedSprints} of {epic.sprints.length} sprints have shipped.
        </b>{' '}
        {epic.shipped
          ? 'The epic is closed, with a retrospective.'
          : epic.sprints.length === 0
            ? 'Nothing has been built yet — the docs exist so the next betting table is a three-line decision rather than a fresh groom.'
            : 'The epic closes when every sprint is merged and its retrospective lands.'}
      </Answer>

      <Tiles>
        <Tile
          label="Build order"
          value={epic.build_order_num === null || epic.build_order_num === undefined ? null : String(epic.build_order_num)}
          // ⚠️ Not `—`. An epic with no build-order number is not at position zero and is not
          // "unknown": it has never been placed in the sequence, and the roadmap page says the same
          // thing about the same epics rather than padding the track to make the arithmetic look
          // right (the prototype's own note on this screen's sibling).
          absent="Never placed in the sequence"
          detail="in the one sequence"
        />
        <Tile label="Area" value={epic.area} detail="macro-section" />
        <Tile
          label="Risk"
          value={risk}
          absent="Not classified"
          detail={risk?.toLowerCase() === 'high' ? 'the product owner merges' : 'builder may merge'}
          tone={risk?.toLowerCase() === 'high' ? 'warn' : undefined}
        />
        <Tile
          label="Sprints"
          value={`${shippedSprints}/${epic.sprints.length}`}
          detail="shipped / planned"
        />
      </Tiles>

      <span className="ds-label">Sprints</span>
      {epic.sprints.length === 0 ? (
        <p className="ds-hint">No sprints recorded for this epic yet.</p>
      ) : (
        <div className="ds-sprints">
          {epic.sprints.map((sprint, index) => {
            const shipped = isRoadmapStatusShipped(sprint.status)
            return (
              <div key={sprint.slug} className="ds-sprintrow">
                <span className="ds-sprintrow-n">S{index + 1}</span>
                <span className="ds-sprintrow-name">{sprint.name}</span>
                {/* The bar is the one thing here that is not read from a number: `sprint_progress`
                    is free text from the generator ("3/3 stories"), so the bar shows SHIPPED-or-not
                    rather than parsing a string into a percentage. A progress bar computed from a
                    string nobody validates is a number the page invented. */}
                <span className="ds-sprintrow-bar" aria-hidden="true">
                  <i data-width={shipped ? 'full' : 'none'} />
                </span>
                <span className="ds-sprintrow-count">{sprint.sprint_progress ?? '—'}</span>
                <span className="ds-epic-state">
                  {shipped ? <Pill state="on">shipped</Pill> : <Pill state="never">{sprint.status}</Pill>}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <Callout>
        Every number here comes from the epic&apos;s own <span className="ds-mono">README.md</span>{' '}
        frontmatter and its sprint files. Nothing on this page is ticked by hand — which is the only
        reason it can be trusted about work nobody is watching.
      </Callout>
    </HubFrame>
  )
}
