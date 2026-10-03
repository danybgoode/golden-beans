import type { Cell, PortfolioRow, SpendValue } from './portfolio-model'

// portfolio-view · Sprint 2, Story 2.1 (Roadmap/02-commercial/portfolio-view — the Architecture lock, D2, D4, C5).
//
// What each cell of a portfolio row SAYS, and where it links. Framework-free so `portfolio-view.test.ts` asserts the
// words directly; the page only lays these out. The three shapes of a cell stay three on screen: a value, the reason
// nothing is there, or "couldn't load" — never one of them dressed as another (CODE-QUALITY #8). Type-only imports, so
// the module stays runnable under plain `node --test`.

export type CellTone = 'value' | 'absent' | 'error'
export type CellView = { text: string; detail?: string; href?: string; tone: CellTone }

/**
 * Where a row's figures came from. A surface whose gate is off for this viewer is absent, and its cell is not a link —
 * nor is any cell that holds no value.
 */
export type RowLinks = {
  today: string
  northStar?: string
  report: string
  experiments?: string
  flags?: string
  finops?: string
}

export const COULDNT_LOAD = 'couldn’t load'

const FUNNEL_LABELS = { targeted: 'Targeted', adopted: 'Adopted', retained: 'Retained' } as const

/** `2026-09-30` — the day a pushed figure was pushed, in UTC (D4). */
export function asOfLabel(iso: string): string {
  return `as of ${iso.slice(0, 10)}`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function view<T>(
  cell: Cell<T>,
  href: string | undefined,
  present: (value: T, asOf: string | undefined) => { text: string; detail?: string }
): CellView {
  // Only a VALUE is a link. A reason or a failure is not a figure to trace, and in link ink it read as one — the first
  // screenshot showed "no North Star set" in the same gold as a real metric (the cell's own ink is the dim one).
  if ('error' in cell) return { text: COULDNT_LOAD, tone: 'error' }
  if ('reason' in cell) return { text: cell.reason, tone: 'absent' }
  return { ...present(cell.value, cell.as_of), tone: 'value', href }
}

/** `≈$410 · +18% (5 quoted epics)` — the cell's one line. */
export function spendLabel(spend: SpendValue): string {
  const usd = spend.usd >= 100 ? Math.round(spend.usd).toString() : spend.usd.toFixed(2)
  const delta =
    spend.deltaPct === null
      ? ''
      : ` · ${spend.deltaPct > 0 ? '+' : spend.deltaPct < 0 ? '−' : '±'}${Math.abs(spend.deltaPct)}%`
  return `≈$${usd}${delta} (${spend.epics} quoted epic${spend.epics === 1 ? '' : 's'})`
}

export type PortfolioRowView = {
  northStar: CellView
  funnel: CellView
  running: CellView
  killSwitches: CellView
  leadTime: CellView
  spend: CellView
}

export function buildPortfolioRowView(row: PortfolioRow, links: RowLinks): PortfolioRowView {
  return {
    // C1: the metric's name and its inputs — the metric itself has no stored level to show.
    northStar: view(row.north_star, links.northStar, (ns) => ({
      text: ns.metric,
      detail: ns.inputs === null ? 'inputs not counted' : plural(ns.inputs, 'input', 'inputs'),
    })),
    // C6: the furthest stage any feature reached; the outcome lives on the project's pod report.
    funnel: view(row.funnel_stage, links.report, (stage) => ({
      text: FUNNEL_LABELS[stage],
      detail: 'furthest stage reached',
    })),
    running: view(row.experiments_running, links.experiments, (n) => ({
      text: plural(n, 'experiment', 'experiments'),
    })),
    // C5: the Running cell's second line — the approved sketch has no kill-switch column.
    killSwitches: view(row.kill_switches_off, links.flags, (n) => ({
      text: plural(n, 'kill switch off', 'kill switches off'),
    })),
    leadTime: view(row.epic_lead_time_days, links.report, (days, asOf) => ({
      text: `${days} d`,
      detail: asOf ? asOfLabel(asOf) : undefined,
    })),
    spend: view(row.spend_vs_quote, links.finops, (spend, asOf) => ({
      text: spendLabel(spend),
      detail: asOf ? asOfLabel(asOf) : undefined,
    })),
  }
}
