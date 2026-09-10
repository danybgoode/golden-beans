import { notFound } from 'next/navigation'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { getHubRoadmap } from '@/lib/hub-query'
import { formatFreshness } from '@/lib/hub-freshness'
import { journeyMarkerIndex } from '@/lib/hub-journey'
import { EmptyHubState } from '../hub-components'
import { HubFrame } from '../hub-frame'
import { Answer, ListCard, PageHead, Pill, Tag, Tile, Tiles } from '@/design-system/primitives'

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
      {/* ⚠️ **NO PROVENANCE LINE HERE — mockups-as-built Story 4.4.** The approved `hub-roadmap`
          state is `head → answer → tiles → list → sectionlabel → list → note`; the stamp belongs to
          `hub-report`, which draws one, and this board does not. It is not lost: the closing note
          below carries the same three facts in words, which is where the approved design puts them
          ("This board is generated from each epic's own frontmatter — it is a view, never a thing
          anybody ticks by hand"). A report that cannot tell you how stale it is, is a screenshot —
          so the sentence says when. */}
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
          {/* `ListCard plain`, not `Card`: the prototype draws the track as
              `<div class="listcard" style="padding:22px">` — block 4 of the approved state. */}
          <ListCard plain>
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
          </ListCard>

          {/* Block 5. The approved state's words are "Most recent first"; this list is in BUILD
              order, oldest first, and says so — the label names what the reader is looking at, and
              renaming it to match a picture would make it wrong. */}
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
        </>
      )}

      {/* ── Block 7: ONE closing note, which is what the approved state draws ──────────────────
          Three sentences used to be three blocks — a seeds line, a destination-reached line and a
          `Callout`. The approved `hub-roadmap` state ends in a single `note` and carries NO
          annotation at all (`STATE-CONTRACT.json`: `annotations: 0`), so the callout was a fourth
          block wearing an annotation's clothes and the other two were extras.

          Every sentence survives; they are one paragraph now. The freshness stamp is here too,
          because this is where the approved design puts the provenance of the board — in words,
          under it, rather than as a line above the answer. */}
      <p className="ds-hint" data-freshness-tone={freshness.tone}>
        Showing {epics.length} of {counts.epics} epic{counts.epics === 1 ? '' : 's'},{' '}
        {/* ⚠️ The STALE warning travels with the stamp. `FreshnessStamp` renders it as
            "possibly stale — " and dropping the stamp for the approved block sequence must not drop
            the one word on it that changes what a reader does. The tone is on the paragraph too, so
            the cue reaches a stylesheet and a screen reader the same way it did. */}
        {freshness.tone === 'stale' ? <strong>possibly stale — </strong> : null}
        generated{' '}
        {freshness.iso ? (
          <time dateTime={freshness.iso} title={freshness.iso}>
            {freshness.age}
          </time>
        ) : (
          freshness.age
        )}
        {freshness.shortCommit ? ` as of merge ${freshness.shortCommit}` : ''} (push #{artifact.version}) from
        each epic&apos;s own frontmatter — a view, never a thing anybody ticks by hand. That is the only
        reason it can be trusted about work nobody is watching.
        {markerIndex === epics.length && epics.length > 0
          ? ' Every epic on the road has shipped, so there is no “you are here” — there is nothing ahead of it.'
          : ''}
        {summary.seeds.length > 0 ? (
          <>
            {' '}
            +{summary.seeds.length} idea{summary.seeds.length === 1 ? '' : 's'} on the horizon are not yet
            groomed onto the road; they are named on{' '}
            <a href={`/hub/${encodeURIComponent(projectSlug)}/horizon`}>Horizon</a>.
          </>
        ) : null}
      </p>
    </HubFrame>
  )
}
