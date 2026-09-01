import { notFound } from 'next/navigation'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { getHubRoadmap } from '@/lib/hub-query'
import { formatFreshness } from '@/lib/hub-freshness'
import { deriveHorizon, type DestinationStatus } from '@/lib/horizon-destinations'
import { Icon } from '@/components/ui/Icon'
import { EmptyHubState, HubProvenance } from '../../hub-components'
import { HubFrame } from '../../hub-frame'
import { Answer, Callout, PageHead } from '@/design-system/primitives'

export const dynamic = 'force-dynamic'

// pod-report · Sprint 1, Story 1.3 — the horizon view: progress read against the DESTINATION.
//
// The failure mode this page exists to avoid is rendering a backlog. A list of epics sorted by
// status answers "what have we done"; a stakeholder is asking "how much of where we're going is
// lit". So destinations lead, and epics appear only underneath as the things that light them —
// never the other way round.
//
// Every status comes verbatim from `deriveHorizon`, which takes each epic's already-derived
// `shipped` boolean from `summarizeRoadmap`. This page re-derives nothing, so "nothing claims ✅ for
// unshipped work" holds by construction rather than by this file remembering to check.
//
// ── design-system-rails · Sprint 6, Story 6.3 — reference state `hub-horizon` ──────────────────
//
// ⚠️ **THREE STRENGTHS OF ONE COLOUR, NOT THREE COLOURS** (DD4). Lit / partly lit / on the way is a
// SEQUENCE — how far along — and a sequence is magnitude, so it is `--gold` from filled to dashed.
// Three hues would say these are three different kinds of thing. The lamp never carries the meaning
// alone: every card states its status as a WORD, which is also what `hub.spec.ts` reads.
const STATUS_LABEL: Record<DestinationStatus, string> = {
  lit: 'lit',
  partial: 'partly lit',
  coming: 'on the way',
}

/**
 * The lamp's mark — a SHAPE as well as a strength.
 *
 * `coming` deliberately has none: its lamp is a dashed empty ring, which is the third shape. An
 * icon set with no neutral "empty circle" in it (`icon-names.ts` is a closed union) would otherwise
 * have been widened to draw a mark that says nothing.
 */
const STATUS_GLYPH: Record<DestinationStatus, 'check' | 'clock' | null> = {
  lit: 'check',
  partial: 'clock',
  coming: null,
}

export default async function HubHorizonPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  await requireDashboardAccess(projectSlug)

  const result = await getHubRoadmap(projectSlug)
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Roadmap artifact lookup failed')
    if (result.reason === 'project_not_found') notFound()

    return (
      <HubFrame projectSlug={projectSlug} tab="horizon">
        <PageHead
          title="Horizon"
          lede="The end states this product is walking toward, and which epics light each one."
        />
        <EmptyHubState projectSlug={projectSlug} />
      </HubFrame>
    )
  }

  const { artifact, summary } = result
  const freshness = formatFreshness(artifact.generatedAt, new Date(), artifact.sourceCommit)
  const destinations = deriveHorizon(
    summary.epics.map((e) => ({ slug: e.slug, name: e.name, shipped: e.shipped }))
  )
  const litCount = destinations.filter((d) => d.status === 'lit').length

  return (
    <HubFrame projectSlug={projectSlug} tab="horizon">
      <PageHead
        title="Horizon"
        lede="The end states this product is walking toward, and which epics light each one."
      />
      <HubProvenance
        freshness={freshness}
        from={`${summary.counts.epics} epics on the road`}
        version={artifact.version}
      />

      <Answer>
        <b>
          {litCount} of {destinations.length} destinations are lit.
        </b>{' '}
        A destination goes lit only when every epic under it has actually shipped — nothing here marks one lit
        on the strength of work that has not.
      </Answer>

      <ul className="ds-dests" aria-label="End-state destinations">
        {destinations.map((d) => (
          <li key={d.id} className="ds-dest" data-status={d.status}>
            <div className="ds-dest-head">
              <span className="ds-dest-lamp" aria-hidden="true">
                {STATUS_GLYPH[d.status] === null ? null : <Icon name={STATUS_GLYPH[d.status]!} size={12} />}
              </span>
              <h3>{d.title}</h3>
            </div>
            <p className="ds-dest-why">{d.description}</p>

            {d.litBy.length > 0 ? (
              <ul className="ds-dest-lights">
                {d.litBy.map((e) => (
                  <li key={e.slug} data-shipped={e.shipped ? 'true' : 'false'}>
                    <span className="ds-dest-tick" aria-hidden="true">
                      <Icon name={e.shipped ? 'check' : 'clock'} size={12} />
                    </span>
                    <a href={`/hub/${encodeURIComponent(projectSlug)}/epic/${encodeURIComponent(e.slug)}`}>
                      {e.name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              // Not an error state: a destination whose epics have not been pushed yet is simply not
              // on the road, and saying so plainly beats an empty box the reader has to interpret.
              <p className="ds-dest-why">No epic on the road lights this yet.</p>
            )}

            {/* ⚠️ The WORD, and the element `hub.spec.ts` reads by name. It sits beside the lamp's
                strength rather than instead of it — DD4's rule is that status is never colour
                alone, and this is the half a colour-blind reader relies on. */}
            <p className="ds-dest-status" data-testid={`dest-badge-${d.id}`}>
              {STATUS_LABEL[d.status]}
            </p>
          </li>
        ))}
      </ul>

      {summary.seeds.length > 0 && (
        <section className="ds-haze" aria-label="Ideas on the horizon">
          <h2>Further out — on the horizon</h2>
          <p>
            Un-groomed ideas, deliberately hazy. These are <strong>not promised</strong> and carry no date —
            an idea rendered like a commitment is the one dishonesty this view exists to avoid.
          </p>
          <ul className="ds-hazelist" data-testid="horizon-seeds">
            {summary.seeds.map((seed) => (
              <li key={seed.slug} className="ds-hazeitem">
                {seed.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Callout>
        Three strengths of one colour, not three colours. Lit, partly lit and on the way is a sequence — how
        far along — and a sequence is magnitude. Giving it three hues would say these are three different
        kinds of thing.
      </Callout>
    </HubFrame>
  )
}
