import { notFound } from 'next/navigation'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { getHubRoadmap } from '@/lib/hub-query'
import { formatFreshness } from '@/lib/hub-freshness'
import {
  boardQuery,
  buildBoard,
  findCard,
  hasStages,
  parseBoardFilters,
  type BoardCard,
} from '@/lib/hub-board'
import { HubFrame } from '../../hub-frame'
import { BoardView, CardView, EmptyBoard } from './board-components'

export const dynamic = 'force-dynamic'

// board-sinks-and-scrumban · Sprint 2 — `/hub/<slug>/board`: every initiative on the six stages (S2.2), a card's own
// view at `?card=<slug>` (S2.3) and the type/risk filters in the URL (S2.4).
//
// The Hub never computes a stage (lock D19): `lib/hub-board.ts` groups the rows the push already resolved, and this
// page renders what it returns. Gating is the other hub pages' (`requireDashboardAccess`): a member reads it, and the
// demo project — this repo's own self-tenant, `golden-beans-demo` — is public by design (AGENTS rule #2, lock C2).
// A share link does not reach it in v1 (lock C10).
//
// ⚠️ The card view is a PAGE state, not an overlay. The approved `hub-board-card` surface is a full block sequence
// (head → answer → summary → steps → list → list), and the visual gate refuses to measure `<main>` under an overlay —
// so `?card=` renders the card in place of the board, with the way back in its lede. Corrected out loud at the lock.
export default async function HubBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<{ card?: string | string[]; type?: string | string[]; risk?: string | string[] }>
}) {
  const { projectSlug } = await params
  const query = await searchParams
  await requireDashboardAccess(projectSlug)

  const result = await getHubRoadmap(projectSlug)
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Roadmap artifact lookup failed')
    if (result.reason === 'project_not_found') notFound()
    return (
      <HubFrame projectSlug={projectSlug} tab="board">
        <EmptyBoard />
      </HubFrame>
    )
  }

  const { artifact } = result
  const items = Array.isArray(artifact.payload?.items) ? artifact.payload.items : []
  // A roadmap pushed before this epic carries no stages: that is "nothing on the board yet", said with the command
  // that fixes it — never a board of six empty columns pretending to be a reading.
  if (!hasStages(items)) {
    return (
      <HubFrame projectSlug={projectSlug} tab="board">
        <EmptyBoard />
      </HubFrame>
    )
  }

  const filters = parseBoardFilters(query)
  const boardBlock = (
    artifact.payload as { board?: { wip?: { Building?: number; QA?: number }; repo?: string } }
  ).board
  const freshness = formatFreshness(artifact.generatedAt, new Date(), artifact.sourceCommit)
  const base = `/hub/${encodeURIComponent(projectSlug)}/board`

  const cardSlug = Array.isArray(query.card) ? query.card[0] : query.card
  if (cardSlug) {
    // Filters do not hide an opened card: a shared `?card=` link opens whatever is set.
    const card: BoardCard | null = findCard(items, cardSlug)
    if (!card) notFound()
    return (
      <HubFrame projectSlug={projectSlug} tab="board">
        <CardView card={card} back={`${base}${boardQuery(filters)}`} repo={boardBlock?.repo ?? null} />
      </HubFrame>
    )
  }

  const board = buildBoard(items, { filters, wip: boardBlock?.wip ?? null })
  return (
    <HubFrame projectSlug={projectSlug} tab="board">
      <BoardView
        board={board}
        filters={filters}
        base={base}
        freshness={freshness}
        version={artifact.version}
      />
    </HubFrame>
  )
}
