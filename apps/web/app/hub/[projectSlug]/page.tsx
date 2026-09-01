import { notFound } from 'next/navigation'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { getHubRoadmap } from '@/lib/hub-query'
import { formatFreshness } from '@/lib/hub-freshness'
import { journeyMarkerIndex } from '@/lib/hub-journey'
import { EmptyHubState, HubProvenance } from '../hub-components'
import { HubFrame } from '../hub-frame'
import { Answer, Callout, PageHead, Pill, Tag, Tile, Tiles } from '@/design-system/primitives'

export const dynamic = 'force-dynamic'

// pod-report · Sprint 1, Story 1.2 — the journey view: the build order rendered as a path, shipped
// epics behind, a "you are here" marker, what's next ahead. golden-beans pushes its OWN roadmap as
// tenant #0, so this page is how the team reads "where are we" without a doc dive, and (Sprint 3)
// how a client reads it through a scoped share link.
//
// ── design-system-rails · Sprint 6, Story 6.3 — reference state `hub-roadmap` ──────────────────
//
// What leaves: the `agent-win` frame device, `hub.module.css`'s journey path, and the count pills.
// What arrives: the approved page head, the one-sentence answer, four tiles, the build-order TRACK
// and the epic list. The track is the state's own idea and it earns its place — twenty-six nodes
// side by side would be a barcode, so the track carries the SHAPE and the list carries the names.
//
// ⚠️ **The legend counts are DERIVED from the same array the track draws, not stated separately.**
// The prototype's own comment records why: its first cut stated them independently and they
// disagreed — the picture said 23 shipped while the tile said 24, on the page about killing exactly
// that. One array, two renderings.
export default async function HubJourneyPage({ params }: { params: Promise<{ projectSlug: string }> }) {
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
          lede={`Every epic ${projectSlug} has built, in the one order it was built in.`}
        />
        <EmptyHubState projectSlug={projectSlug} />
      </HubFrame>
    )
  }

  const { artifact, summary } = result
  const freshness = formatFreshness(artifact.generatedAt, new Date(), artifact.sourceCommit)
  const markerIndex = journeyMarkerIndex(summary.epics)
  const { counts, epics } = summary

  // ── The track's nodes and its legend come from ONE array ────────────────────────────────────
  // `building` is the epic the marker sits on — the first unshipped one — and it is computed here
  // from `markerIndex` rather than re-derived from a status string, so the node the track lights and
  // the row the list marks cannot disagree.
  const nodes = epics.map((epic, index) =>
    epic.shipped ? 'shipped' : index === markerIndex ? 'building' : 'queued'
  )
  const nodeCount = (state: string) => nodes.filter((node) => node === state).length
  const building = epics[markerIndex]

  return (
    <HubFrame projectSlug={projectSlug} tab="roadmap">
      <PageHead
        title="Roadmap"
        lede={`Every epic ${projectSlug} has built, in the one order it was built in.`}
      />
      <HubProvenance
        freshness={freshness}
        from={`${counts.epics} epics and ${counts.sprints} sprints`}
        version={artifact.version}
      />

      <Answer>
        <b>
          {counts.shippedEpics} of {counts.epics} epics have shipped.
        </b>{' '}
        {nodeCount('building') === 1
          ? `${building?.name ?? 'One'} is being built now, and ${nodeCount('queued')} are scaffolded and waiting for a bet.`
          : 'Nothing is in flight — every epic on the road has shipped.'}
      </Answer>

      <Tiles>
        <Tile label="Shipped" value={String(counts.shippedEpics)} detail={`of ${counts.epics} epics`} />
        <Tile
          label="Building now"
          value={String(nodeCount('building'))}
          detail={building?.slug ?? 'nothing in flight'}
          tone={nodeCount('building') > 0 ? 'warn' : undefined}
        />
        <Tile label="Sprints tracked" value={String(counts.sprints)} detail="across every epic" />
        <Tile label="Ideas in the funnel" value={String(counts.seeds)} detail="seeds, not all bet on" />
      </Tiles>

      {epics.length === 0 ? (
        <p className="ds-hint">
          The latest push has no epics yet — check back once one is groomed onto the road.
        </p>
      ) : (
        <>
          <div className="ds-card">
            <span className="ds-label">The build order, 1 to {epics.length}</span>
            <div className="ds-track" aria-hidden="true">
              {nodes.map((state, index) => (
                <i key={epics[index].slug} data-state={state} title={`#${index + 1}`} />
              ))}
            </div>
            {/* Announced as words, because the track above is a picture. A reader who cannot see it
                gets the same three numbers rather than nothing at all. */}
            <div className="ds-trackkey">
              <span>
                <i data-state="shipped" aria-hidden="true" />
                Shipped <b>{nodeCount('shipped')}</b>
              </span>
              <span>
                <i data-state="building" aria-hidden="true" />
                Building now <b>{nodeCount('building')}</b>
              </span>
              <span>
                <i data-state="queued" aria-hidden="true" />
                Scaffolded, not bet <b>{nodeCount('queued')}</b>
              </span>
            </div>
            <p className="ds-hint">
              One sequence, not a priority score — shipped epics keep their place, so this reads left to right
              as the order things actually happened.
            </p>
          </div>

          <span className="ds-label">In build order</span>
          <div className="ds-listcard">
            {epics.map((epic, index) => (
              <a
                key={epic.slug}
                className="ds-epic"
                href={`/hub/${encodeURIComponent(projectSlug)}/epic/${encodeURIComponent(epic.slug)}`}
              >
                <span className="ds-epic-ord">{epic.build_order_num ?? '—'}</span>
                <span className="ds-epic-name">
                  <b>{epic.name}</b>
                  <span>
                    {/* "you are here" is the product's own device and it survives the port. It marks
                        the first UNSHIPPED epic — what is being built next — and `hub.spec.ts`
                        asserts the phrase, so it is contract rather than decoration. */}
                    {index === markerIndex && !epic.shipped ? 'you are here — ' : ''}
                    {epic.sprints.length} sprint{epic.sprints.length === 1 ? '' : 's'}
                    {epic.area ? ` · ${epic.area}` : ''}
                  </span>
                </span>
                <span className="ds-epic-state">
                  {epic.shipped ? (
                    <Pill state="on">Shipped</Pill>
                  ) : index === markerIndex ? (
                    <Pill state="never">Building now</Pill>
                  ) : (
                    <Tag tone="unclassified">Scaffolded</Tag>
                  )}
                </span>
              </a>
            ))}
          </div>

          {/* The destination-reached case, said in words rather than by the absence of a marker. */}
          {markerIndex === epics.length && (
            <p className="ds-hint">
              Every epic on the road has shipped — there is no &ldquo;you are here&rdquo; because there is
              nothing ahead of it.
            </p>
          )}
        </>
      )}

      {summary.seeds.length > 0 && (
        <p className="ds-hint">
          +{summary.seeds.length} idea{summary.seeds.length === 1 ? '' : 's'} on the horizon, not yet groomed
          onto the road. They are named on{' '}
          <a href={`/hub/${encodeURIComponent(projectSlug)}/horizon`}>Horizon</a>.
        </p>
      )}

      <Callout>
        This board is generated from each epic&apos;s own frontmatter — it is a view, never a thing anybody
        ticks by hand. That is the only reason it can be trusted about work nobody is watching.
      </Callout>
    </HubFrame>
  )
}
