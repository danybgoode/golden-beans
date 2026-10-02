import { notFound } from 'next/navigation'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { getHubRoadmap } from '@/lib/hub-query'
import { formatFreshness } from '@/lib/hub-freshness'
import { areasAnswer, buildAreas, HORIZONS, type AreaItem } from '@/lib/hub-areas'
import { EmptyHubState } from '../hub-components'
import { HubFrame } from '../hub-frame'
import { Answer, Empty, ListCard, ListHead, PageHead } from '@/design-system/primitives'
import { hasStages } from '@/lib/hub-board'

export const dynamic = 'force-dynamic'

// board-sinks-and-scrumban · Sprint 4, Story 4.1 — the Roadmap tab: functional areas on a horizon (D10).
//
// The high-level view answers "where is each area heading": each area is a row, Shipped · Now · Next · Later are the
// columns, every cell runs in build order, and it carries seeds AND scaffolded work. It REPLACES the journey track
// (pod-report S1.2): the track's "you are here" lives in the Board's answer line now ("Next to pull: …"), which is
// where the question it answered is asked. The share page (`/s/<token>`) keeps its own journey — a different state.
//
// The approved state is the surface `hub-roadmap-areas` (design-system/surfaces/, D23): head → answer → list → note.
// Every block is a direct child of `<main>`; the area table is a list card whose header row carries the five columns.
// Stages come from the push (D19) — the page groups, it never decides one.
const SHIPPED_SHOWN = 3

function Cell({
  items,
  projectSlug,
  shipped,
}: {
  items: AreaItem[]
  projectSlug: string
  shipped?: boolean
}) {
  if (items.length === 0) return <span className="ds-areas-empty">—</span>
  // Shipped is the long column: its count and the most recent few (highest build order; a row with none, such as a
  // shipped seed, last), never a wall of names.
  const shown = shipped
    ? [...items].sort((a, b) => (b.buildOrder ?? -1) - (a.buildOrder ?? -1)).slice(0, SHIPPED_SHOWN)
    : items
  return (
    <span className="ds-areas-items">
      {shipped ? <b className="ds-areas-count">{items.length} shipped</b> : null}
      {shown.map((item) => (
        <a
          key={item.slug}
          className="ds-areas-item"
          href={`/hub/${encodeURIComponent(projectSlug)}/board?card=${encodeURIComponent(item.slug)}`}
        >
          {item.name}
          {!shipped && item.stage !== 'Ready to build' ? (
            <span className="ds-areas-stage"> · {item.stage}</span>
          ) : null}
        </a>
      ))}
    </span>
  )
}

export default async function HubRoadmapPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  await requireDashboardAccess(projectSlug)

  const result = await getHubRoadmap(projectSlug)
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Roadmap artifact lookup failed')
    if (result.reason === 'project_not_found') notFound()
    return (
      <HubFrame projectSlug={projectSlug} tab="roadmap">
        <PageHead
          title="Roadmap"
          lede="Where each area is heading: what shipped, what is moving now, next and later."
        />
        <EmptyHubState projectSlug={projectSlug} />
      </HubFrame>
    )
  }

  const { artifact } = result
  const items = Array.isArray(artifact.payload?.items) ? artifact.payload.items : []
  // A push from before stages carries none, and the Hub never computes one (D19): the board's empty state, not a guess.
  if (!hasStages(items)) {
    return (
      <HubFrame projectSlug={projectSlug} tab="roadmap">
        <PageHead
          title="Roadmap"
          lede="Where each area is heading: what shipped, what is moving now, next and later."
        />
        <Empty
          title="This roadmap was pushed before stages existed."
          body={
            <>
              Push it again to place each initiative:{' '}
              <code className="ds-mono">npx -y @golden-frijoles/kit roadmap-extract --sink hub</code>
            </>
          }
        />
      </HubFrame>
    )
  }
  const view = buildAreas(items)
  const freshness = formatFreshness(artifact.generatedAt, new Date(), artifact.sourceCommit)

  return (
    <HubFrame projectSlug={projectSlug} tab="roadmap">
      <PageHead
        title="Roadmap"
        lede="Where each area is heading: what shipped, what is moving now, next and later."
      />
      <Answer freshnessTone={freshness.tone}>{areasAnswer(view)}</Answer>

      <ListCard label="Areas">
        <ListHead>
          <span className="ds-areas-col" role="columnheader">
            Area
          </span>
          {HORIZONS.map((h) => (
            <span key={h} className="ds-areas-col" role="columnheader">
              {h}
            </span>
          ))}
        </ListHead>
        {view.areas.map((area) => (
          <div key={area.area} className="ds-areas-row" role="row">
            <span className="ds-areas-name" role="cell">
              {area.area}
            </span>
            {HORIZONS.map((h) => (
              <span key={h} role="cell" data-horizon={h}>
                <Cell items={area.cells[h]} projectSlug={projectSlug} shipped={h === 'Shipped'} />
              </span>
            ))}
          </div>
        ))}
      </ListCard>

      <p className="ds-hint" data-freshness-tone={freshness.tone}>
        Now is Building and QA. Next is Ready to build. Later is To groom and Grooming. Each row runs in build
        order. {freshness.tone === 'stale' ? <strong>Possibly stale — </strong> : null}
        Pushed{' '}
        {freshness.iso ? (
          <time dateTime={freshness.iso} title={freshness.iso}>
            {freshness.age}
          </time>
        ) : (
          freshness.age
        )}
        {freshness.shortCommit ? ` as of ${freshness.shortCommit}` : ''} (push #{artifact.version}).
      </p>
    </HubFrame>
  )
}
