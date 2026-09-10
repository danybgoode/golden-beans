import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isJourneyProjectionsEnabled } from '@/lib/flags'
import { parseJourneyCohortRequest } from '@/lib/journey-cohort-request'
import { validateJourneyKey } from '@/lib/journey-definition'
import { getActiveJourneyVersionByProjectId, getJourneyCohortByProjectId } from '@/lib/journey-query'
import { ProductShell } from '@/components/product/ProductShell'
import { formatUtc } from '@/lib/format-utc'
import { listJourneyRegistries } from '@/lib/journeys'
import {
  Answer,
  Callout,
  Crumb,
  Crumbs,
  Empty,
  ListCard,
  PageHead,
  Pill,
  Tag,
  Version,
  Versions,
} from '@/design-system/primitives'
import { StageBars } from '@/design-system/charts'
import { NewThingDialog } from '@/components/product/NewThingDialog'
import { JourneyCohortDetail } from './cohort-detail'

export const dynamic = 'force-dynamic'

type Query = Record<string, string | string[] | undefined>

export default async function JourneyCohortPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; journeyKey: string }>
  searchParams: Promise<Query>
}) {
  if (!isJourneyProjectionsEnabled()) notFound()
  const { projectSlug, journeyKey } = await params
  if (!validateJourneyKey(journeyKey)) notFound()
  const membership = await requireProjectMembership(projectSlug)
  const raw = await searchParams
  const defaults = defaultWindow()

  let rawVersion = scalar(raw.version)
  if (!rawVersion) {
    const active = await getActiveJourneyVersionByProjectId(membership.projectId, journeyKey)
    if (!active.ok) {
      if (active.reason === 'query_failed') throw new Error('Journey version lookup failed')
      notFound()
    }
    rawVersion = String(active.version)
  }

  const parsed = parseJourneyCohortRequest({
    version: rawVersion,
    from: scalar(raw.from) ?? defaults.from,
    to: scalar(raw.to) ?? defaults.to,
    asOf: scalar(raw.asOf) ?? defaults.asOf,
    timezone: scalar(raw.timezone) ?? 'UTC',
    staleAfterHours: scalar(raw.staleAfterHours),
    drilldown: scalar(raw.drilldown),
    cursor: scalar(raw.cursor),
    pageSize: scalar(raw.pageSize),
  })
  if (!parsed.ok) {
    return (
      <ProductShell projectSlug={projectSlug} section="measure" railActive={'journeys'}>
        <main>
          <h1>Journey cohort — {journeyKey}</h1>
          <p role="alert">{parsed.error}</p>
          <p>
            <a href={`/app/journeys/${encodeURIComponent(projectSlug)}/${encodeURIComponent(journeyKey)}`}>
              Reset the cohort window
            </a>
          </p>
        </main>
      </ProductShell>
    )
  }

  const result = await getJourneyCohortByProjectId(
    membership.projectId,
    journeyKey,
    parsed.version,
    parsed.options
  )
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Journey cohort lookup failed')
    if (result.reason === 'invalid_request') {
      return (
        <ProductShell projectSlug={projectSlug} section="measure" railActive={'journeys'}>
          <main>
            <h1>Journey cohort — {journeyKey}</h1>
            <p role="alert">That drilldown is not valid for this journey definition.</p>
          </main>
        </ProductShell>
      )
    }
    if (result.reason === 'resource_limit') {
      return (
        <ProductShell projectSlug={projectSlug} section="measure" railActive={'journeys'}>
          <main>
            <h1>Journey cohort — {journeyKey}</h1>
            <p role="alert">
              This journey exceeds the query-time raw-fact safety limit. Reduce matching history or split the
              definition before retrying.
            </p>
          </main>
        </ProductShell>
      )
    }
    notFound()
  }

  const { journey, cohort } = result
  // The version history the approved state's second half shows. A separate, cheap registry read —
  // the cohort result carries the version it was computed AT, not the journey's whole history.
  // `listJourneyRegistries` is the existing seam and returns every journey with its versions; a
  // dedicated single-key read would be a second query for a fact this one already answers.
  const registries = await listJourneyRegistries(membership.projectId)
  const versions = [...(registries.find((entry) => entry.key === journeyKey)?.versions ?? [])].sort(
    (a, b) => b.version - a.version
  )
  const baseQuery = new URLSearchParams({
    version: String(journey.definitionVersion),
    from: cohort.cohort.from,
    to: cohort.cohort.to,
    asOf: cohort.cohort.asOf,
    timezone: cohort.cohort.timezone,
    staleAfterHours: String(cohort.freshness.staleAfterHours),
    pageSize: String(parsed.options.pageSize),
  })
  const drilldownHref = (key: string, cursor?: string | null) => {
    const query = new URLSearchParams(baseQuery)
    query.set('drilldown', key)
    if (cursor) query.set('cursor', cursor)
    return `?${query.toString()}`
  }

  // ── The stage bars, from the SAME numbers the detail table shows ────────────────────────────
  //
  // `satisfiedCount` is how many reached each stage; `continuationFromPreviousRate` is the share of
  // the previous stage that carried on. The "N did not continue" line under each bar is subtraction
  // over those two, never a second measurement — so the picture and the table one keystroke below it
  // cannot disagree.
  const first = cohort.stages[0] ?? null
  const stages = cohort.stages.map((stage, index) => {
    const previous = index === 0 ? null : cohort.stages[index - 1]
    const droppedCount =
      previous === null ? null : Math.max(0, previous.satisfiedCount - stage.satisfiedCount)
    return {
      label: stage.key,
      value: stage.satisfiedCount,
      sharePercent: stage.cohortConversionRate === null ? null : stage.cohortConversionRate * 100,
      dropped:
        droppedCount === null || droppedCount === 0 || previous === null || previous.satisfiedCount === 0
          ? null
          : { count: droppedCount, percent: (droppedCount / previous.satisfiedCount) * 100 },
    }
  })
  const last = cohort.stages.at(-1) ?? null
  // The biggest drop, named in the answer line. Computed rather than described: the approved copy
  // says "the biggest drop is between X and Y", and a sentence that named a fixed pair would be
  // wrong for every journey but the prototype's.
  const biggestDrop = stages.reduce<{ from: string; to: string; count: number } | null>(
    (worst, stage, index) => {
      if (index === 0 || stage.dropped === null) return worst
      if (worst !== null && worst.count >= stage.dropped.count) return worst
      return { from: stages[index - 1].label, to: stage.label, count: stage.dropped.count }
    },
    null
  )

  return (
    <ProductShell projectSlug={projectSlug} section="measure" railActive={'journeys'}>
      <main>
        <Crumbs back={{ href: `/app/journeys/${projectSlug}`, label: 'Journeys' }}>
          <Crumb mono>{journey.key}</Crumb>
        </Crumbs>
        <PageHead
          title={<span className="ds-mono">{journey.key}</span>}
          lede={`${journey.entityType} · definition v${journey.definitionVersion}`}
          /* ⚠️ **A SECONDARY control, and the head's primary action stays null** — which is what
             `measure-journey` draws (`STATE-CONTRACT.json`: `head` with `action: null`). The
             diagnostic layer below is READ-ONLY evidence, and Daniel's ruling for the identical
             case on Destinations was that evidence gets its own control, separate from authoring.
             Making it the page's primary action would both fail the contract and tell a reader
             that the main thing to do on this screen is inspect its telemetry. */
          actions={
            <NewThingDialog
              variant="secondary"
              label="How this was counted"
              title="How this cohort was counted"
              lede="The window, the drilldowns, the retention rule and the query evidence — the same numbers the bars are drawn from."
            >
              <JourneyCohortDetail result={result} drilldownHref={drilldownHref} />
            </NewThingDialog>
          }
        />

        <Answer>
          {first === null || last === null || first.satisfiedCount === 0 ? (
            // ⚠️ The empty answer is a DELIVERABLE, and it is what a real cohort window with nobody
            // in it renders. `populationStatus` already distinguishes "no qualifying events" from
            // "events exist, nobody entered this window", and the two are different sentences.
            <>
              <strong>Nobody entered this journey in the window being counted.</strong>{' '}
              {cohort.populationStatus === 'no_qualifying_events'
                ? 'No event matches this definition at all yet — the stages name events that have never arrived.'
                : 'Qualifying events exist, but none of them fall inside the entry window below. Widen it, or wait.'}
            </>
          ) : (
            <>
              <strong>
                {last.cohortConversionRate === null
                  ? `${last.satisfiedCount.toLocaleString('en-US')} of the ${first.satisfiedCount.toLocaleString('en-US')} people who started have reached the end.`
                  : `${(last.cohortConversionRate * 100).toFixed(1)}% of the ${first.satisfiedCount.toLocaleString('en-US')} people who started have reached the end.`}
              </strong>{' '}
              {biggestDrop === null
                ? 'Nobody has dropped out between stages.'
                : `The biggest drop is between ${biggestDrop.from} and ${biggestDrop.to}.`}
            </>
          )}
        </Answer>

        {/* ⚠️ A `ListCard plain`, not a `Card`. The approved state's block 4 is `list`, and the
            prototype draws this as `<div class="listcard" style="padding:22px">` — the card SURFACE
            without a header row or a column grid (`console-prototype.html:2561`). */}
        <ListCard plain>
          <p className="ds-label">Where people are</p>
          {stages.length === 0 ? (
            <Empty
              title="This definition has no stages"
              body="A journey is an ordered set of stages, and this version declares none — so there is nothing to count people through."
            />
          ) : (
            <StageBars
              stages={stages}
              note="Counted from events as they arrived. Somebody who skipped a stage is counted where they actually are, not where the definition says they should be."
            />
          )}
        </ListCard>

        {/* The version history — the approved state's second half. A journey version is IMMUTABLE:
            activating a draft does not rewrite history, and the numbers above stay attributable to
            the definition that produced them.

            ⚠️ **`Versions`, not `ListCard`.** The vocabulary pairs the approved `versions` block
            with `.ds-vers` and this page rendered a `.ds-listcard`, so the gate reported *"the
            approved state has `versions`, the page has `list`"* for two sprints. The design draws a
            different thing: hairline rows with no header, no column grid and no action cell,
            because a version is a fact and never a control. */}
        <p className="ds-label">Versions</p>
        <Versions>
          {versions.map((version) => (
            <Version
              key={version.id}
              number={`v${version.version}`}
              state={
                version.state === 'draft' ? (
                  <Tag tone="unclassified">Draft</Tag>
                ) : version.state === 'active' ? (
                  <Pill state="on">Active</Pill>
                ) : (
                  <Tag>Superseded</Tag>
                )
              }
              who={
                version.state === 'active' && version.activatedAt
                  ? formatUtc(version.activatedAt)
                  : version.state === 'draft'
                    ? 'not activated'
                    : formatUtc(version.createdAt)
              }
            >
              {version.state === 'active'
                ? 'Counting everyone above'
                : version.state === 'draft'
                  ? 'Not activated — it changes nothing until you do'
                  : 'Kept, never deleted'}
            </Version>
          ))}
        </Versions>

        <Callout>
          A journey version is <strong>immutable</strong>, exactly like a feature version — activating a draft
          does not rewrite history, and the numbers above stay attributable to the definition that produced
          them.
        </Callout>
      </main>
    </ProductShell>
  )
}

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function defaultWindow(): { from: string; to: string; asOf: string } {
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1_000)
  return { from: from.toISOString(), to: to.toISOString(), asOf: to.toISOString() }
}
