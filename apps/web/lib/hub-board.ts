import type { RoadmapRow, RoadmapStage } from './roadmap-artifact-schema'

// board-sinks-and-scrumban · Sprint 2, Story 2.1 — the board is computed, not drawn.
//
// The Hub never decides a stage (lock D19): every row arrives with the `stage` that `scripts/lib/stage.mjs` resolved
// in the pusher's CI, and this module only groups, orders, filters and counts — the same arithmetic the page renders
// and the spec asserts. Pure, with no framework or server import, so `node --test` loads it directly.
//
// Cards are INITIATIVES — an epic or a seed (D7). Sprint rows live inside their epic's card, never on the board.

/**
 * The six stages in board order. ⚠️ A copy, like the schema's: this module stays import-free at runtime so
 * `node --test` loads it with no resolver (the repo's rule for pure logic). `hub-board.test.ts` pins this list AND
 * the schema's to `STAGES` in `scripts/lib/stage.mjs`, so a renamed stage turns a spec red.
 */
export const BOARD_STAGES = [
  'To groom',
  'Grooming',
  'Ready to build',
  'Building',
  'QA',
  'Shipped',
] as const satisfies readonly RoadmapStage[]

export const BOARD_TYPES = ['feature', 'spike', 'bug', 'chore'] as const
export type BoardType = (typeof BOARD_TYPES)[number]

export type BoardFilters = { type: BoardType | null; highRisk: boolean }

/** Shipped shows the last 30 days (the seed's acceptance): older work has left the board, not the record. */
export const SHIPPED_WINDOW_DAYS = 30

export type BoardCard = {
  /** The project a card belongs to — set on the workspace board (S4.2), where slugs from several projects meet. */
  project: string | null
  slug: string
  name: string
  grain: 'Epic' | 'Seed'
  stage: RoadmapStage
  stageSource: string | null
  type: string | null
  risk: string | null
  area: string | null
  buildOrder: number | null
  appetite: string | null
  bet: string | null
  sprintProgress: string | null
  goal: string | null
  sprints: { n: number; title: string | null; done: number; total: number }[]
  links: { readme: string | null; seed: string | null; sprints: string[]; retro: string | null }
  pr: { number: number; url: string; state: string; draft: boolean } | null
  kickoff: string | null
  shippedAt: string | null
}

export type WipState = { limit: number; count: number; over: boolean; at: boolean }

export type BoardColumn = { stage: RoadmapStage; cards: BoardCard[]; wip: WipState | null }

export type Board = {
  columns: BoardColumn[]
  /** Initiatives the filters left visible, across all six columns (WIP is the one count that ignores the filters). */
  total: number
  /** Shipped initiatives older than the window, left off the Shipped column (said in the note, not hidden). */
  shippedOutsideWindow: number
  nextToPull: BoardCard | null
  answer: string
}

/** The board's filters from the URL (`?type=spike&risk=high`), so a filtered board is a shareable link (S2.4). */
export function parseBoardFilters(params: {
  type?: string | string[]
  risk?: string | string[]
}): BoardFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.toLowerCase() ?? null
  const type = one(params.type)
  return {
    type: (BOARD_TYPES as readonly string[]).includes(type ?? '') ? (type as BoardType) : null,
    highRisk: one(params.risk) === 'high',
  }
}

/** The query string for a filter set — the chips link to it. Empty filters are the bare board. */
export function boardQuery(filters: BoardFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams()
  // `project` first when given (the workspace board's filter, S4.2), so a shared URL reads project → type → risk.
  if (extra.project) q.set('project', extra.project)
  if (filters.type) q.set('type', filters.type)
  if (filters.highRisk) q.set('risk', 'high')
  for (const [k, v] of Object.entries(extra)) if (k !== 'project') q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

const isStage = (v: unknown): v is RoadmapStage => (BOARD_STAGES as readonly unknown[]).includes(v)

/** One row → a card, or null when the row is not an initiative on the board (a sprint, or no stage: archived). */
/** `project` is the CALLER's (the workspace board's server-side slug) — never read from the pushed row. */
export function toCard(row: RoadmapRow, project: string | null = null): BoardCard | null {
  if (row.grain === 'Sprint' || !isStage(row.stage)) return null
  const r = row as RoadmapRow & Record<string, unknown>
  const links = (r.links ?? {}) as Partial<BoardCard['links']>
  return {
    project,
    slug: row.slug,
    name: row.name,
    grain: row.grain,
    stage: row.stage,
    stageSource: (r.stage_source as string | null | undefined) ?? null,
    type: row.type ?? null,
    risk: row.risk ?? null,
    area: row.area ?? null,
    buildOrder: typeof row.build_order_num === 'number' ? row.build_order_num : null,
    appetite: (r.appetite as string | null | undefined) ?? null,
    bet: (r.underwritten_by as string | null | undefined) ?? null,
    sprintProgress: row.sprint_progress ?? null,
    goal: (r.goal as string | null | undefined) ?? null,
    sprints: Array.isArray(r.sprints) ? (r.sprints as BoardCard['sprints']) : [],
    links: {
      readme: links.readme ?? null,
      seed: links.seed ?? null,
      sprints: Array.isArray(links.sprints) ? links.sprints : [],
      retro: links.retro ?? null,
    },
    pr: (r.pr as BoardCard['pr'] | null | undefined) ?? null,
    kickoff: (r.kickoff as string | null | undefined) ?? null,
    shippedAt: (r.shipped_at as string | null | undefined) ?? null,
  }
}

/** Whether a row set carries stages at all — a payload pushed before this epic does not, and gets the empty state. */
export function hasStages(items: RoadmapRow[]): boolean {
  return items.some((row) => row.grain !== 'Sprint' && isStage(row.stage))
}

export function matchesFilters(card: BoardCard, filters: BoardFilters): boolean {
  if (filters.type && (card.type ?? '').toLowerCase() !== filters.type) return false
  if (filters.highRisk && (card.risk ?? '').toLowerCase() !== 'high') return false
  return true
}

const order = (c: BoardCard) => c.buildOrder ?? Number.MAX_SAFE_INTEGER

function wipFor(count: number, limit: unknown): WipState | null {
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) return null
  return { limit, count, over: count > limit, at: count === limit }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * The board: six columns in board order, Ready to build in build order (pull from the top), Shipped newest first
 * within the last 30 days, every other column in build order then name. WIP counts the whole column (never only what
 * the filters left visible), against the limits the push carried (`board.wip`, D21) — advice, never a gate (D9).
 */
export function buildBoard(
  items: RoadmapRow[],
  {
    filters = { type: null, highRisk: false },
    wip = null,
    now = new Date(),
    projectOf = () => null,
  }: {
    filters?: BoardFilters
    wip?: { Building?: number | null; QA?: number | null } | null
    /** The workspace board's project for a row (by identity, set server-side); null on a project's own board. */
    projectOf?: (row: RoadmapRow) => string | null
    now?: Date
  } = {}
): Board {
  const cutoff = new Date(now.getTime() - SHIPPED_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const all = items.map((row) => toCard(row, projectOf(row))).filter((c): c is BoardCard => c !== null)
  const cards = all.filter((c) => matchesFilters(c, filters))
  let shippedOutsideWindow = 0
  const columns = BOARD_STAGES.map((stage): BoardColumn => {
    let list = cards.filter((c) => c.stage === stage)
    if (stage === 'Shipped') {
      const inWindow = list.filter((c) => (c.shippedAt ?? '') >= cutoff)
      shippedOutsideWindow = list.length - inWindow.length
      list = inWindow.sort(
        (a, b) => (b.shippedAt ?? '').localeCompare(a.shippedAt ?? '') || order(a) - order(b)
      )
    } else {
      list = list.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
    }
    const limit = stage === 'Building' ? wip?.Building : stage === 'QA' ? wip?.QA : null
    // WIP is the TEAM's limit, so it counts the whole column, not what a filter left visible (fresh review, #226): a
    // spike-only view must not say Building is under its limit while the team is over it.
    const teamCount = all.filter((c) => c.stage === stage).length
    return { stage, cards: list, wip: wipFor(teamCount, limit) }
  })
  const col = (stage: RoadmapStage) => columns.find((c) => c.stage === stage)!
  const nextToPull = col('Ready to build').cards[0] ?? null
  return {
    columns,
    total: columns.reduce((n, c) => n + c.cards.length, 0),
    shippedOutsideWindow,
    nextToPull,
    answer: answerLine(col('QA'), col('Building'), nextToPull, filters.type !== null || filters.highRisk),
  }
}

/**
 * The one sentence over the board: "2 initiatives in QA and 1 building. Next to pull: CMS integration (build order
 * 18)." — the approved `hub-board` answer, plus the WIP advice when a column is past its limit (D9: the board says
 * it, nothing blocks).
 */
export function answerLine(
  qa: BoardColumn,
  building: BoardColumn,
  next: BoardCard | null,
  filtered = false
): string {
  const q = qa.cards.length
  const b = building.cards.length
  const flow =
    q === 0 && b === 0
      ? 'Nothing is in QA or building.'
      : `${plural(q, 'initiative', 'initiatives')} in QA and ${b} building.`
  const pull = next
    ? ` Next to pull: ${next.name}${next.buildOrder !== null ? ` (build order ${next.buildOrder})` : ''}.`
    : ' Nothing is ready to pull.'
  // The flow counts what the filters show; WIP counts the TEAM's whole column. Under a filter the two can differ, so
  // the over-limit clause says whose count it is rather than contradict the sentence before it (round-2 review, #226).
  const over = [building, qa]
    .filter((c) => c.wip?.over)
    .map(
      (c) =>
        ` ${c.stage} is over its WIP limit (${c.wip!.count} of ${c.wip!.limit}${filtered ? ', the whole column' : ''}).`
    )
    .join('')
  return `${flow}${pull}${over}`
}

/** The card a `?card=<slug>` link opens, after filters are ignored — a shared card link must open whatever is set. */
export function findCard(items: RoadmapRow[], slug: string): BoardCard | null {
  for (const row of items) {
    if (row.slug !== slug) continue
    const card = toCard(row)
    if (card) return card
  }
  return null
}
