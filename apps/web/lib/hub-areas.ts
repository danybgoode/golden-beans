import type { RoadmapRow, RoadmapStage } from './roadmap-artifact-schema'

// board-sinks-and-scrumban · Sprint 4, Story 4.1 — the Roadmap tab: functional areas on a horizon (D10).
//
// The high-level view answers "where is each area heading", with seeds AND scaffolded work: each area is a row, and
// the six stages fold into four horizons — Shipped · Now (Building + QA) · Next (Ready to build) · Later (To groom +
// Grooming). Every cell runs in build order. Like the board, the Hub never computes a stage (D19): rows arrive with the
// stage S1's resolver decided, and a row without one is left out. A payload pushed before S1 has no stages at all, and
// the page gives it the board's empty state (push again) rather than inventing stages from the old `status` field.
//
// Pure and import-free at runtime (a type import is erased), so `node --test` loads it directly.

export const HORIZONS = ['Shipped', 'Now', 'Next', 'Later'] as const
export type Horizon = (typeof HORIZONS)[number]

const HORIZON_OF: Record<RoadmapStage, Horizon> = {
  Shipped: 'Shipped',
  QA: 'Now',
  Building: 'Now',
  'Ready to build': 'Next',
  Grooming: 'Later',
  'To groom': 'Later',
}

export type AreaItem = { slug: string; name: string; stage: RoadmapStage; buildOrder: number | null }
export type AreaRow = { area: string; cells: Record<Horizon, AreaItem[]> }
export type AreasView = {
  areas: AreaRow[]
  epics: number
  shippedEpics: number
  now: AreaItem[]
}

const STAGES: readonly string[] = ['To groom', 'Grooming', 'Ready to build', 'Building', 'QA', 'Shipped']

const order = (i: AreaItem) => i.buildOrder ?? Number.MAX_SAFE_INTEGER

export function buildAreas(items: RoadmapRow[]): AreasView {
  const byArea = new Map<string, AreaRow>()
  const all: AreaItem[] = []
  let epics = 0
  let shippedEpics = 0
  for (const row of items) {
    if (row.grain === 'Sprint') continue
    // The Hub never computes a stage (lock D19): a row without one (archived, or a push from before stages) is off the
    // roadmap exactly as it is off the board. The page gives a stage-less push the board's own empty state.
    if (!STAGES.includes(String(row.stage))) continue
    const stage = row.stage as RoadmapStage
    if (row.grain === 'Epic') {
      epics += 1
      if (stage === 'Shipped') shippedEpics += 1
    }
    const area = row.area ?? 'No area'
    if (!byArea.has(area)) byArea.set(area, { area, cells: { Shipped: [], Now: [], Next: [], Later: [] } })
    const item: AreaItem = {
      slug: row.slug,
      name: row.name,
      stage,
      buildOrder: typeof row.build_order_num === 'number' ? row.build_order_num : null,
    }
    byArea.get(area)!.cells[HORIZON_OF[stage]].push(item)
    all.push(item)
  }
  const areas = [...byArea.values()].sort((a, b) => a.area.localeCompare(b.area))
  for (const a of areas)
    for (const h of HORIZONS) a.cells[h].sort((x, y) => order(x) - order(y) || x.name.localeCompare(y.name))
  const now = all
    .filter((i) => HORIZON_OF[i.stage] === 'Now')
    .sort((x, y) => order(x) - order(y) || x.name.localeCompare(y.name))
  return { areas, epics, shippedEpics, now }
}

/** "42 of 46 epics have shipped. Now: One plugin (Building), Public monorepo (QA)." — the approved answer. */
export function areasAnswer(view: AreasView): string {
  const head = `${view.shippedEpics} of ${view.epics} epic${view.epics === 1 ? ' has' : 's have'} shipped.`
  if (view.now.length === 0) return `${head} Nothing is being built or in QA right now.`
  return `${head} Now: ${view.now.map((i) => `${i.name} (${i.stage})`).join(', ')}.`
}
