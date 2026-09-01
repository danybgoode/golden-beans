import type { JourneyListRow } from '@/lib/journey-list-view'
import { Col, ListCard, ListHead, Row, RowMain, RowState, Tag, TableEmpty } from '@/design-system/primitives'

// design-system-rails · Sprint 5, Story 5.5 — reference state `measure-journeys`.
//
// ⚠️ **Deliberately the SAME row as Ship › Features and Ship › Experiments.** The approved state
// says so in its own callout: *"a registry of definitions with versions, one of which is active" is
// the same job, and learning it twice is a tax.* So this is `ListCard` / `Row` / `RowState`, not a
// list of its own — and the version words ("Active · v4", "Draft v5 waiting") are the same words.

export function JourneyRows({ slug, rows }: { slug: string; rows: JourneyListRow[] }) {
  if (rows.length === 0) {
    return (
      <ListCard>
        {/* ⚠️ **This is the state production actually renders** — `miyagisanchez` has zero journeys
            (epic D10), so it is what a real person meets, not a fallback. It says what a journey IS
            and how one is defined, because an empty list that only says "empty" sends the reader
            looking for a control rather than telling them what it would be for. */}
        <TableEmpty
          title="No journey defined yet"
          body="A journey is the path you want somebody to walk — sign up, list a product, make a first sale — declared as an ordered set of stages. Once one is active, this list counts how far people actually get, and a version is immutable so the numbers stay attributable to the definition that produced them. Define one below."
        />
      </ListCard>
    )
  }

  return (
    <ListCard>
      <ListHead>
        <Col header>Journey</Col>
        <Col header width="state">
          State
        </Col>
        <Col header width="meta">
          People
        </Col>
        <Col header width="act">
          <span className="ds-visually-hidden">Actions</span>
        </Col>
      </ListHead>
      {rows.map((row) => (
        <Row key={row.key}>
          <RowMain
            title={row.key}
            description={row.description}
            href={`/app/journeys/${slug}/${encodeURIComponent(row.key)}`}
          />
          {/* ⚠️ `never` — not `off` — when nothing is active. A journey with only drafts has never
              counted anyone, which is a different state from one that was switched off, and the
              three-state pill is the console's one vocabulary for exactly that distinction. */}
          <RowState
            state={row.activeVersion === null ? 'never' : 'on'}
            label={row.activeVersion === null ? 'Not activated' : `Active · v${row.activeVersion}`}
          />
          <Col width="meta">
            {/* An unread count renders a dash, never a zero: "nobody is in this journey" and "we
                did not read how many are" are different sentences (`lib/journey-list-view.ts`). */}
            <span className="ds-mono">
              {row.subjectCount === null ? '—' : row.subjectCount.toLocaleString('en-US')}
            </span>
            {row.waitingDraftVersion === null ? null : (
              <span className="ds-state-detail">
                <Tag tone="unclassified">Draft v{row.waitingDraftVersion} waiting</Tag>
              </span>
            )}
          </Col>
          <Col width="act">
            <a
              className="ds-btn ds-btn--secondary ds-btn--sm"
              href={`/app/journeys/${slug}/${encodeURIComponent(row.key)}`}
            >
              Open
            </a>
          </Col>
        </Row>
      ))}
    </ListCard>
  )
}
