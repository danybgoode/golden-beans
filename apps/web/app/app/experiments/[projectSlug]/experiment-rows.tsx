import type { ExperimentListRow, ExperimentRowState } from '@/lib/experiment-list-view'
import { Col, ListCard, ListHead, Row, RowMain, RowState, Tag, TableEmpty } from '@/design-system/primitives'

// design-system-rails · Sprint 5, Story 5.4 — the Experiments list, reference state
// `ship-experiments`.
//
// ⚠️ **Deliberately the SAME row as Ship › Features**, which is what the approved design asks for
// and what the `measure-journeys` callout states in the prototype's own words: *"a registry of
// definitions with versions, one of which is active" is the same job, and learning it twice is a
// tax.* So this uses `ListCard` / `Row` / `RowMain` / `RowState` rather than a list of its own.

/**
 * The word and the pill tone for each row state.
 *
 * ⚠️ **A total map, so a new state is a COMPILE error rather than a blank pill.** Sprint contract #9
 * states this for blockers and the same reasoning applies here: `Record<ExperimentRowState, …>`
 * means adding a state to the union without deciding what it says on screen cannot build.
 *
 * `unresolved` is NOT `gathering`. "We did not check this one" and "this one is still gathering" are
 * different sentences, and only the second is a measurement — the whole reason
 * `lib/experiment-list-view.ts` keeps them apart.
 */
const STATE_WORDS: Record<ExperimentRowState, { word: string; tone: 'on' | 'off' | 'never' }> = {
  ready: { word: 'Ready to decide', tone: 'on' },
  gathering: { word: 'Still gathering', tone: 'never' },
  decided: { word: 'Decided', tone: 'on' },
  unresolved: { word: 'Not checked here', tone: 'never' },
  draft: { word: 'Draft', tone: 'never' },
  stopped: { word: 'Stopped', tone: 'off' },
  invalid: { word: 'Invalidated', tone: 'off' },
}

export function ExperimentRows({ slug, rows }: { slug: string; rows: ExperimentListRow[] }) {
  if (rows.length === 0) {
    return (
      <ListCard>
        <TableEmpty
          title="No experiment yet"
          body="An experiment is a change shown to some people and not others, declared before it runs — the hypothesis, the variants, the metric that decides it, and the sample it needs. Declare one below and this list fills in."
        />
      </ListCard>
    )
  }

  return (
    <ListCard>
      <ListHead>
        <Col header>Experiment</Col>
        <Col header width="state">
          State
        </Col>
        <Col header width="meta">
          Primary metric
        </Col>
        <Col header width="act">
          <span className="ds-visually-hidden">Actions</span>
        </Col>
      </ListHead>
      {rows.map((row) => {
        const state = STATE_WORDS[row.state]
        return (
          <Row key={row.key}>
            <RowMain
              title={row.key}
              description={row.hypothesis}
              href={`/app/experiments/${slug}/${encodeURIComponent(row.key)}${
                row.version === null ? '' : `?version=${row.version}`
              }`}
            />
            {/* The word, always — never the pill's colour alone (DD4). `dayCount` is `null` for
                anything that never started, and the row then says nothing rather than "day 0",
                which would read as "it started today". */}
            <RowState
              state={state.tone}
              label={state.word}
              detail={
                row.dayCount === null
                  ? row.version === null
                    ? undefined
                    : `v${row.version}`
                  : `day ${row.dayCount}${row.version === null ? '' : ` · v${row.version}`}`
              }
            />
            {/* The metric the immutable PLAN declares, which the registry knows without an
                analysis. The lift it produced is on the detail page, where the interval that
                brackets it is computed — a number and its uncertainty belong on one screen.

                ⚠️ CLIPPED to one line with the full value on `title`, the same rule `RowState`'s
                detail follows. An event name is an identifier and can be long: unclipped, it ran
                under the Open button, which is the kind of thing only opening the page shows. */}
            <Col width="meta" title={row.primaryMetricEvent || undefined}>
              <span className="ds-mono ds-row-clip">{row.primaryMetricEvent || '—'}</span>
              {/* ⚠️ A newer draft is flagged BESIDE the described version, never instead of it — the
                  same treatment `journey-rows.tsx` gives "Draft v3 waiting", which is what the
                  approved design means by "same row, same state pill, same version words". Showing
                  the draft as the row's state would hide a running experiment behind an unstarted
                  plan, which is exactly what it did before this. */}
              {row.waitingDraftVersion === null ? null : (
                <span className="ds-state-detail">
                  <Tag tone="unclassified">Draft v{row.waitingDraftVersion} waiting</Tag>
                </span>
              )}
            </Col>
            <Col width="act">
              <a
                className="ds-btn ds-btn--secondary ds-btn--sm"
                href={`/app/experiments/${slug}/${encodeURIComponent(row.key)}${
                  row.version === null ? '' : `?version=${row.version}`
                }`}
              >
                Open
              </a>
            </Col>
          </Row>
        )
      })}
    </ListCard>
  )
}
