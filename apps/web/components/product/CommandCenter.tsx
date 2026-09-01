import { Fragment } from 'react'
import { getProjectOutcome } from '@/lib/pod-report-query'
import { getFlagRegistryView } from '@/lib/flag-registry'
import { getDeliveryHealth } from '@/lib/deliveries'
import { getTaskLifecycleFacts } from '@/lib/task-lifecycle-facts'
import { listTasksByProjectId, type TaskRow } from '@/lib/tasks'
import { projectFlagRows, summariseFlagList } from '@/lib/flag-list-view'
import { splitTaskBands } from '@/lib/today-bands'
import { northStarFigure } from '@/lib/stat-figures'
import { PageHead } from '@/design-system/primitives'
import { Band, BandEmpty, TaskList } from '@/design-system/bands'
import { TaskLines } from './TaskLines'

// design-system-rails · Sprint 5, Story 5.2 — Today.
//
// ── What this replaces, and why the replacement is the story rather than a follow-up ──────────
// `console-ia-overhaul` A25 left this route pre-contract: mono-italic caveats, a wide dead gap
// between the stat row and the funnel figures, a `<details>` of "what we are not measuring" and a
// bare `<ul>` of links under it. It was covered by no story in that epic, and half-doing it left a
// route that is neither the old page nor the approved one. Sprint contract #8 makes it this story.
//
// ── DD1: Today gains its missing third band ───────────────────────────────────────────────────
// A task's real states are `open | claimed | resolved | dismissed`. Today already asked one question
// in two registers — "waiting on you" and "what changed" — which are the two ENDS of that lifecycle
// with the middle missing: the part where something has picked a task up and is working it. That
// middle is where the agent this product sells is visible at all, and until now there was nowhere
// in the signed-in product it could be seen working (audit §2.5).
//
// `/app/tasks` is the same three bands mounted as its own page (DD5). The band components live in
// `design-system/bands.tsx` so there is one implementation rather than two that currently match.
//
// ── Every read fails SOFT, and each tile says which nothing it is showing ─────────────────────
// Today is the page every signed-in session lands on. A single failing read must degrade to one
// unreadable tile, never to an error page — and, just as importantly, must not degrade to a **zero**,
// which is the honest-looking failure this repo has shipped before and has four LEARNINGS entries
// about. Each `catch` below returns `null`, and `null` renders the sentence naming the absence.

export type CommandCenterProject = {
  id: string
  slug: string
  role: string
}

/** A date a reader recognises, in UTC — the same rule `lib/format-utc.ts` states for timestamps. */
function today(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

export async function CommandCenter({ project }: { project: CommandCenterProject }) {
  // Read in parallel, and independently: one slow or failing layer must not take the others with it.
  const [outcome, flags, tasks, deliveries, agentFacts] = await Promise.all([
    getProjectOutcome(project.id, project.slug).catch(() => null),
    getFlagRegistryView(project.id).catch(() => null),
    listTasksByProjectId(project.id, { limit: 100 }).catch((): TaskRow[] | null => null),
    getDeliveryHealth(project.id).catch(() => null),
    getTaskLifecycleFacts(project.id).catch(() => null),
  ])

  const bands = splitTaskBands(tasks ?? [])
  const northStar = outcome ? northStarFigure(outcome.northStar) : null
  const flagSummary = flags ? summariseFlagList(projectFlagRows(flags.flags, 'production')) : null
  // "Needs attention", not "failed in the last 24 hours" — ⚠️ a deliberate correction to the
  // approved tile's caption. `delivery_health` aggregates over ALL time and has no windowed variant,
  // so a "last 24 hours" label over a cumulative number would be a claim the query does not make.
  // The tile and its figure are the design's; the caption says the window the data actually has.
  const needsAttention = deliveries
    ? deliveries.reduce((total, row) => total + row.awaitingRetry + row.dead, 0)
    : null

  return (
    <>
      <PageHead
        title="Today"
        lede={`${today()}. What changed while you were away, and what is waiting on you.`}
      />

      <div className="ds-tiles">
        {/* ⚠️ The metric's identity is the DETAIL line, not part of the label. The approved tile
            reads "NORTH STAR · SIGNED-UP SELLERS", which is fine for two short words and wraps the
            uppercase caption to two lines on a real key — the fixture's `gb-e2e-impact-metric` does
            exactly that, and the tile then starts its value lower than its three siblings. Same
            fact, one line down, where a long key is ordinary rather than a layout problem. */}
        <Tile
          label="North Star"
          value={northStar?.value ?? null}
          // ⚠️ `stat-figures.ts` already owns the four North Star states, including the one this
          // project is actually in: a metric registered with no reading recorded, which is NOT a
          // reading of zero (sprint L1). Re-deriving the sentence here would be a second answer to
          // a question that already has one.
          absent={
            northStar?.caveat ??
            'The North Star could not be read just now — a failed query, not an absent metric.'
          }
          detail={outcome?.northStar?.metric ?? undefined}
          detailMono
        />
        <Tile
          label="On in Production"
          value={flagSummary === null ? null : String(flagSummary.serving)}
          absent="The feature registry could not be read, so this is not a count of zero."
          detail={flagSummary === null ? undefined : `of ${flagSummary.total} features`}
        />
        <Tile
          label="Needs a decision"
          // Counted from the SAME array the band below renders, so a tile cannot contradict the
          // rows under it (CODE-QUALITY #2).
          value={tasks === null ? null : String(bands.open.length)}
          tone={bands.open.length > 0 ? 'warn' : undefined}
          absent="The queue could not be read, so nothing below should be taken as an empty queue."
          detail="waiting on you"
        />
        <Tile
          label="Deliveries needing attention"
          value={needsAttention === null ? null : String(needsAttention)}
          absent="Delivery health could not be read."
          detail="awaiting retry or dead-lettered"
        />
      </div>

      <Band title="Waiting on you" who="you" sub="Decisions nothing else is allowed to make.">
        <TaskList>
          {bands.open.length === 0 ? (
            <BandEmpty
              head="Nothing is waiting on you"
              body={
                tasks === null
                  ? 'The queue could not be read — this is a failed lookup, not an empty queue.'
                  : 'Errors and friction reach this list once they affect enough people to be worth your time. Nothing has crossed that line.'
              }
            />
          ) : (
            <TaskLines slug={project.slug} tasks={bands.open} />
          )}
        </TaskList>
      </Band>

      <Band
        title="Your agent is working"
        who="agent"
        sub="Tasks something else has picked up and is resolving. You did not have to ask."
      >
        {bands.claimed.length === 0 ? (
          <TaskList>
            <BandEmpty
              head="No agent has claimed anything"
              body={
                agentFacts && agentFacts.agentResolvedTotal > 0
                  ? `Nothing is in hand right now. An agent has resolved ${agentFacts.agentResolvedTotal} task${agentFacts.agentResolvedTotal === 1 ? '' : 's'} through the connector so far.`
                  : 'Nothing has claimed a task through the connector yet. Mint an agent write key in Setup › Keys and an agent can claim, resolve and dismiss these on its own.'
              }
              action={<a href={`/app/setup/keys/${project.slug}`}>Setup › Keys</a>}
            />
          </TaskList>
        ) : (
          <>
            <AgentSummary claimed={bands.claimed.length} facts={agentFacts} />
            <TaskList>
              <TaskLines slug={project.slug} tasks={bands.claimed} />
            </TaskList>
          </>
        )}
      </Band>

      <Band
        title="What changed"
        who="done"
        sub="Everything a person or an agent actually did, in one list — in the same words as the buttons that did it."
      >
        <TaskList>
          {bands.done.length === 0 ? (
            <BandEmpty
              head="Nothing has been closed yet"
              body="Resolved and dismissed tasks land here with what was done and who did it."
            />
          ) : (
            <TaskLines slug={project.slug} tasks={bands.done} />
          )}
        </TaskList>
        <p className="ds-hint">
          <a href={`/app/tasks/${project.slug}`}>See every task, including what is already done →</a>
        </p>
      </Band>

      {/*
        The Medusa-truth boundary — the things this engine deliberately does NOT measure, each with
        the reason and the guardrail.

        ⚠️ **The approved `today` state has no such block, and it is KEPT anyway.** It has no other
        surface in the product, and "where is my revenue number?" is a question a plausible figure
        would answer badly and this answers honestly. Deleting a capability to satisfy a geometry
        assertion is not what "render from the design system" asks for — the same call Sprint 4
        recorded for Destinations' two operational logs (deviation 6).

        Behind a disclosure, and last, so it costs the page nothing until somebody asks.
      */}
      {outcome && outcome.notInstrumented.length > 0 ? (
        <details className="ds-gaps">
          <summary>What this project is not measuring yet ({outcome.notInstrumented.length})</summary>
          <dl>
            {outcome.notInstrumented.map((gap) => (
              <Fragment key={gap.key}>
                <dt>{gap.label}</dt>
                <dd>
                  {gap.reason} <em>{gap.guardrail}</em>
                </dd>
              </Fragment>
            ))}
          </dl>
        </details>
      ) : null}
    </>
  )
}

/**
 * One summary tile.
 *
 * ⚠️ `value: null` ALWAYS carries `absent`, enforced by the type on the caller side through
 * `StatFigure` and restated here in the required prop. A tile that could render neither a number nor
 * a sentence would be a blank box, and a blank box on the page every session lands on reads as a
 * layout bug rather than as the absence it is.
 */
function Tile({
  label,
  value,
  absent,
  detail,
  detailMono,
  tone,
}: {
  label: string
  value: string | null
  absent: string
  detail?: string
  detailMono?: boolean
  tone?: 'up' | 'warn'
}) {
  return (
    <div className="ds-tile">
      <p className="ds-tile-label">{label}</p>
      {value === null ? (
        <p className="ds-tile-absent">{absent}</p>
      ) : (
        <p className="ds-tile-value" data-tone={tone}>
          {value}
        </p>
      )}
      {/* Rendered in BOTH states. It names WHICH metric, which feature set, which window — and that
          is at least as worth saying when there is no number as when there is. The first version hid
          it behind the value, which left the absent tile unable to say what it was absent about. */}
      {detail ? <p className={detailMono ? 'ds-tile-detail ds-mono' : 'ds-tile-detail'}>{detail}</p> : null}
    </div>
  )
}

/**
 * The line above the claimed band.
 *
 * ⚠️ Its "resolved by an agent" figure comes from `getTaskLifecycleFacts`, which counts
 * `metadata.via === 'connector'` — a fact about which credential performed the mutation. That is the
 * only honest agent/human signal this product has, and it is a BAND-level fact: the per-row holder
 * is a caller-supplied label and is rendered as a name, never as a classification (see
 * `lib/today-bands.ts`).
 *
 * `facts === null` is a failed read, and it says so rather than reporting zero agent resolutions —
 * which would read as "your agent has done nothing" on the page whose whole job is to show it
 * working.
 */
function AgentSummary({ claimed, facts }: { claimed: number; facts: { agentResolvedTotal: number } | null }) {
  return (
    <p className="ds-agentline">
      <span className="ds-agentline-pulse" aria-hidden="true" />
      <span>
        <strong>{claimed} in hand</strong>
        {facts === null
          ? ' — the agent-resolution history could not be read just now, so this is not a count of zero.'
          : `, ${facts.agentResolvedTotal} resolved through the connector so far.`}
      </span>
    </p>
  )
}
