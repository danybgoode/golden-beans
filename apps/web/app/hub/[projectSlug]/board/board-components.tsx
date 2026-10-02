/** @jsxImportSource react */
// Pragma: a no-op under Next, load-bearing for the test rail (Playwright's transform pins its own jsx runtime, which
// react-dom/server refuses to render) — the same line, for the same reason, as `hub-frame.tsx`.
import type { Freshness } from '@/lib/hub-freshness'
import { BOARD_TYPES, boardQuery, type Board, type BoardCard, type BoardFilters } from '@/lib/hub-board'
import { stageCommands } from '@/lib/stage-commands'
import {
  Answer,
  Col,
  Empty,
  ListCard,
  ListHead,
  PageHead,
  Row,
  RowMain,
  Stat,
  Step,
  Steps,
  Summary,
} from '@/design-system/primitives'
import { CopyButton } from '../../copy-button'

// board-sinks-and-scrumban · Sprint 2 — the board's three approved states, as components:
//   hub-board        head → answer → toolbar → tiles (6) → note
//   hub-board-card   head (+ Copy kickoff prompt) → answer → summary (7) → steps → list (Doc | Link) → list (Command | Copy)
//   hub-board-empty  head → empty
// Every block is a DIRECT child of `<main>`, because that is what the visual gate reads (state-contract-core.mjs:
// "direct children only"); a label lives inside its block (`ListCard`'s `label`), never between blocks.

const TYPE_LABEL: Record<(typeof BOARD_TYPES)[number], string> = {
  feature: 'Feature',
  spike: 'Spike',
  bug: 'Bug',
  chore: 'Chore',
}

function cardMeta(card: BoardCard): string {
  return [
    card.grain === 'Seed' ? 'seed' : null,
    card.type,
    card.risk ? `risk ${card.risk.toLowerCase()}` : null,
    card.buildOrder !== null ? `#${card.buildOrder}` : null,
    card.stage === 'Building' || card.stage === 'QA' ? card.sprintProgress : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function BoardView({
  board,
  filters,
  base,
  freshness,
  version,
}: {
  board: Board
  filters: BoardFilters
  base: string
  freshness: Freshness
  version: number
}) {
  const chip = (label: string, next: BoardFilters, current: boolean) => (
    <a
      key={label}
      className="ds-chip"
      href={`${base}${boardQuery(next)}`}
      aria-current={current ? 'true' : undefined}
    >
      {label}
    </a>
  )
  return (
    <>
      <PageHead
        title="Board"
        lede="Every initiative on six stages, from an idea to shipped. Open a card for its goal, its docs and the next command."
      />
      <Answer freshnessTone={freshness.tone}>{board.answer}</Answer>

      {/* S2.4 — the filters are links, so they live in the URL and a filtered board is a shareable link. */}
      <nav className="ds-toolbar" aria-label="Filter the board">
        {chip('All types', { ...filters, type: null }, filters.type === null)}
        {BOARD_TYPES.map((type) => chip(TYPE_LABEL[type], { ...filters, type }, filters.type === type))}
        {chip('High risk', { ...filters, highRisk: !filters.highRisk }, filters.highRisk)}
      </nav>

      <div className="ds-tiles ds-tiles--board">
        {board.columns.map((column) => (
          <section
            key={column.stage}
            className="ds-tile ds-board-col"
            aria-label={column.stage}
            data-stage={column.stage}
          >
            <p className="ds-tile-label">{column.stage}</p>
            <p className="ds-tile-value">{column.cards.length}</p>
            {column.wip ? (
              <p className="ds-board-wip" data-over={column.wip.over ? 'true' : 'false'}>
                {column.wip.over
                  ? `over its WIP limit of ${column.wip.limit}`
                  : column.wip.at
                    ? `at its WIP limit of ${column.wip.limit}`
                    : `WIP limit ${column.wip.limit}`}
                {/* The tile's number is what the filters show; WIP is the whole column's (round-2 review, #226). */}
                {column.wip.count !== column.cards.length ? ` (${column.wip.count} in the whole column)` : ''}
              </p>
            ) : null}
            {column.cards.length > 0 ? (
              <ul className="ds-board-cards">
                {column.cards.map((card) => (
                  <li key={card.slug}>
                    <a className="ds-board-card" href={`${base}${boardQuery(filters, { card: card.slug })}`}>
                      {card.name}
                      <span className="ds-board-card-meta">{cardMeta(card)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <p className="ds-hint" data-freshness-tone={freshness.tone}>
        Generated from each initiative&apos;s frontmatter, git and GitHub. A view, never ticked by hand.{' '}
        {freshness.tone === 'stale' ? <strong>Possibly stale — </strong> : null}
        Pushed{' '}
        {freshness.iso ? (
          <time dateTime={freshness.iso} title={freshness.iso}>
            {freshness.age}
          </time>
        ) : (
          freshness.age
        )}
        {freshness.shortCommit ? ` as of ${freshness.shortCommit}` : ''} (push #{version}).
        {board.shippedOutsideWindow > 0
          ? ` Shipped shows the last 30 days; ${board.shippedOutsideWindow} older shipped initiative${
              board.shippedOutsideWindow === 1 ? ' is' : 's are'
            } on the Roadmap tab.`
          : ''}
      </p>
    </>
  )
}

function docRows(card: BoardCard): { label: string; path: string }[] {
  return [
    card.links.readme ? { label: 'Epic README', path: card.links.readme } : null,
    card.links.seed ? { label: 'Seed (the pitch)', path: card.links.seed } : null,
    ...card.links.sprints.map((path, i) => ({ label: `Sprint ${card.sprints[i]?.n ?? i + 1}`, path })),
    card.links.retro ? { label: 'Retrospective', path: card.links.retro } : null,
  ].filter((d): d is { label: string; path: string } => d !== null)
}

export function CardView({ card, back, repo }: { card: BoardCard; back: string; repo: string | null }) {
  const commands = [
    ...(card.kickoff ? [{ label: 'kickoff prompt', text: card.kickoff, kickoff: true }] : []),
    ...stageCommands(card).map((c) => ({ ...c, kickoff: false })),
  ]
  const docs = docRows(card)
  return (
    <>
      <PageHead
        title={card.name}
        lede={
          <>
            {card.stage}
            {card.stageSource ? <> — read from {card.stageSource}</> : null}.{' '}
            <a href={back}>Back to the board</a>
          </>
        }
        actions={
          card.kickoff ? (
            <CopyButton primary value={card.kickoff} label="Copy the kickoff prompt">
              Copy kickoff prompt
            </CopyButton>
          ) : undefined
        }
      />
      <Answer>
        {card.goal ?? 'No goal is written for this initiative yet — its README has no Why paragraph.'}
      </Answer>

      <Summary>
        <Stat label="Stage" value={card.stage} />
        <Stat label="Area" value={card.area ?? '—'} />
        <Stat label="Build order" value={card.buildOrder !== null ? `#${card.buildOrder}` : '—'} />
        <Stat label="Type" value={card.type ?? '—'} />
        <Stat label="Risk" value={card.risk ?? '—'} />
        <Stat label="Appetite" value={card.appetite ?? '—'} />
        <Stat label="Bet" value={card.bet ? `bet: ${card.bet}` : 'not bet'} />
      </Summary>

      <Steps>
        {card.sprints.length > 0 ? (
          card.sprints.map((sprint) => (
            <Step key={sprint.n} note={`${sprint.done} of ${sprint.total} stories`}>
              Sprint {sprint.n}
              {sprint.title ? ` — ${sprint.title}` : ''}
            </Step>
          ))
        ) : (
          <Step note="A seed is sliced into sprints when it is groomed and scaffolded.">No sprints yet</Step>
        )}
      </Steps>

      <ListCard label="Docs">
        <ListHead>
          <Col header>Doc</Col>
          <Col header width="meta">
            Link
          </Col>
        </ListHead>
        {docs.map((doc) => (
          <Row key={doc.path}>
            <RowMain title={doc.label} description={doc.path} mono={false} />
            <Col width="meta">
              {/* The pushed repo base is validated https at ingest; without one the path is shown, never guessed. */}
              {repo ? <a href={`${repo}${doc.path}`}>Open</a> : <span>{doc.path}</span>}
            </Col>
          </Row>
        ))}
      </ListCard>

      <ListCard label="Commands for this stage">
        <ListHead>
          <Col header>Command</Col>
          <Col header width="act">
            Copy
          </Col>
        </ListHead>
        {commands.length === 0 ? (
          <Row>
            <RowMain title="Nothing is owed — it shipped." mono={false} />
            <Col width="act">{null}</Col>
          </Row>
        ) : (
          commands.map((command) => (
            <Row key={command.label}>
              <RowMain
                title={command.kickoff ? 'The kickoff prompt' : command.text}
                description={command.kickoff ? command.text.split('\n')[0] : command.label}
                mono={!command.kickoff}
              />
              <Col width="act">
                <CopyButton
                  value={command.text}
                  label={`Copy: ${command.kickoff ? command.label : command.text}`}
                />
              </Col>
            </Row>
          ))
        )}
      </ListCard>
    </>
  )
}

export function EmptyBoard() {
  return (
    <>
      <PageHead title="Board" lede="Every initiative on six stages, from an idea to shipped." />
      <Empty
        title="Nothing on the board yet."
        body={
          <>
            Push your roadmap with:{' '}
            <code className="ds-mono">npx -y @golden-frijoles/kit roadmap-extract --sink hub</code>
          </>
        }
      />
    </>
  )
}
