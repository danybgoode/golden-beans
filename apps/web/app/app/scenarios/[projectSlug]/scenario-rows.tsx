import { formatUtc } from '@/lib/format-utc'
import { SCENARIO_OUTCOME_WORDS, scenarioOutcome, type ScenarioListRow } from '@/lib/scenario-list-view'
import {
  Col,
  ListCard,
  ListHead,
  Row,
  RowGroup,
  RowMain,
  RowState,
  Tag,
  TableEmpty,
} from '@/design-system/primitives'
import { SplitBar } from '@/design-system/charts'

// design-system-rails · Sprint 5, Story 5.6 — reference state `measure-scenarios`.
//
// Audit §6.4: *"today this is a read-only log where the PRD describes a tool."* The difference is a
// row that answers a question — what held, what failed, and what has never been run — instead of a
// chronological dump of every run.

export function ScenarioRows({ rows }: { rows: ScenarioListRow[] }) {
  if (rows.length === 0) {
    return (
      <ListCard>
        {/* ⚠️ The state production actually renders: `miyagisanchez` has zero scenarios (epic D10),
            and the two live ones are on `miyagi`. So this is what a real person meets. */}
        <TableEmpty
          title="No drill defined yet"
          body="A drill breaks something on purpose, in a controlled way, and keeps the evidence of what held — a payment provider going away, twenty times the normal read load, another tenant's data asked for with a valid token. Until one has run, every control you rely on is an assumption you have not tested."
        />
      </ListCard>
    )
  }

  return (
    <ListCard>
      <ListHead>
        <Col header>Drill</Col>
        <Col header width="state">
          Kind
        </Col>
        <Col header width="meta">
          Last run
        </Col>
        <Col header width="act">
          <span className="ds-visually-hidden">Actions</span>
        </Col>
      </ListHead>
      {rows.map((row) => (
        <RowGroup key={row.scenarioKey}>
          <Row>
            <RowMain
              title={row.scenarioKey}
              // ⚠️ **The description is BUILT from the definition, never prose.** The approved state's
              // rows carry human sentences ("Take card payments away and watch what the storefront
              // does"), and `ScenarioDefinition` has no description field — so a sentence here would be
              // one this product invented about somebody's own drill. What it has is the target, the
              // cohort and the environment, which is what the row says.
              description={
                <>
                  targets <span className="ds-mono">{row.targetKey}</span> · {row.cohort} cohort ·{' '}
                  {row.environment} · v{row.version}
                </>
              }
            />
            {/* ⚠️ The pill and the bar below BOTH read `scenarioOutcome`, and they used to be
                derived separately — which put a green **Held** beside the sentence "Never run" on a
                drill whose run replayed nothing. Two things that must agree get one implementation
                (CODE-QUALITY #2). */}
            <RowState
              state={SCENARIO_OUTCOME_WORDS[scenarioOutcome(row)].tone}
              label={SCENARIO_OUTCOME_WORDS[scenarioOutcome(row)].label}
              detail={row.kind === 'security' ? 'Security' : 'Resilience'}
            />
            <Col width="meta" title={row.lastRun === null ? undefined : formatUtc(row.lastRun.at)}>
              <span className="ds-mono ds-row-clip">
                {row.lastRun === null ? '—' : formatUtc(row.lastRun.at)}
              </span>
            </Col>
            <Col width="act">
              <Tag tone={row.kind === 'security' ? undefined : 'unclassified'}>
                {row.kind === 'security' ? 'Security' : 'Resilience'}
              </Tag>
            </Col>
          </Row>
          {/* The evidence, under the name it is evidence about. `SplitBar` renders the WORD for a
              drill that has never run, because `splitGeometry` returns `null` for a 0/0 split —
              "everything held" over nothing sent is unrepresentable rather than merely avoided. */}
          <div className="ds-rowgroup-extra">
            <SplitBar
              held={row.lastRun?.held ?? 0}
              failed={row.lastRun?.failed ?? 0}
              unreadable={SCENARIO_OUTCOME_WORDS[scenarioOutcome(row)].unreadable}
            />
          </div>
        </RowGroup>
      ))}
    </ListCard>
  )
}
