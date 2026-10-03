// finops · Story 3.3 — what /app/finops shows, computed from its two sources and nothing else. ZERO-IMPORT (types are
// structural), so a `node --test` spec reaches every number on the page without rendering it.
//
//   Epics (quote, actual, Δ)   ← the latest roadmap artifact (finops 3.2): each epic README's own frontmatter
//   Sessions, skills, models   ← this project's `$agent_usage` events, latest snapshot per (session, epic) (D22)
//
// Each section says where its numbers came from, on the page. Absent is said in words, never drawn as 0 (D4).

type Finops = {
  slug: string
  name: string | null
  appetite: string | null
  shipped: boolean
  quoteLow: number | null
  quoteHigh: number | null
  actualUsd: number | null
  deltaPct: number | null
  verdict: 'inside' | 'over' | 'under' | null
  storiesDone: number | null
}
type Total = { usd: number; usdLowerBound: boolean; tokens: number; sessions: number }
type Snapshot = {
  epic: string
  usd_estimate: number
  last_at: string
  session_id: string
  model_breakdown?: Record<string, { usd: number | null }>
}

export type FinopsTile = { label: string; value: string | null; absent: string; detail: string }
export type FinopsEpicRow = {
  slug: string
  name: string
  appetite: string
  quote: string
  actual: string
  actualSource: 'stamped' | 'live' | 'none'
  delta: string
  tone: 'over' | 'inside' | 'under' | null
  sessions: string
}
export type FinopsShareRow = { name: string; usd: string; tokens: string; share: string }

export type FinopsView =
  | { state: 'empty' }
  | {
      state: 'populated'
      tiles: FinopsTile[]
      epics: FinopsEpicRow[]
      bySkill: FinopsShareRow[]
      byModel: FinopsShareRow[]
      lastUsageAt: string | null
    }

const money = (n: number, lowerBound = false) =>
  `${lowerBound ? '≥' : '≈'}$${n > 0 && n < 1 ? n.toFixed(2) : Math.round(n).toLocaleString('en-US')}`
const mtok = (n: number) => `${(n / 1e6).toFixed(1)}M`

/** `"13/13 stories"` → 13 done; anything else → null (a count we cannot read is not a zero). */
export function storiesDoneOf(sprintProgress: unknown): number | null {
  const m = /^(\d+)\/(\d+) stories$/.exec(String(sprintProgress ?? '').trim())
  return m ? Number(m[1]) : null
}

function shareRows(map: Record<string, Total>): FinopsShareRow[] {
  const entries = Object.entries(map).sort((a, b) => b[1].usd - a[1].usd || b[1].tokens - a[1].tokens)
  const all = entries.reduce((a, [, t]) => a + t.usd, 0)
  return entries.map(([name, t]) => ({
    name,
    usd: money(t.usd, t.usdLowerBound),
    tokens: mtok(t.tokens),
    share: all > 0 ? `${Math.round((t.usd / all) * 100)}%` : '—',
  }))
}

/**
 * The page. `now` decides "this month" (UTC). Empty means there is nothing to show from EITHER source — no usage
 * pushed and no epic carrying a quote or an actual — which is when the page says how to turn the push on.
 */
export function buildFinopsView(input: {
  epics: readonly Finops[]
  snapshots: readonly Snapshot[]
  byEpic: Record<string, Total>
  bySkill: Record<string, Total>
  byModel: Record<string, Total>
  lastAt: string | null
  now: Date
}): FinopsView {
  const relevant = input.epics.filter(
    (e) => e.quoteHigh !== null || e.actualUsd !== null || input.byEpic[e.slug] !== undefined
  )
  if (!relevant.length && !input.snapshots.length) return { state: 'empty' }

  const month = input.now.toISOString().slice(0, 7)
  const thisMonth = input.snapshots.filter((s) => s.last_at.slice(0, 7) === month)
  const monthUsd = thisMonth.reduce((a, s) => a + s.usd_estimate, 0)

  const judged = input.epics.filter((e) => e.shipped && e.verdict !== null)
  const inside = judged.filter((e) => e.verdict === 'inside').length

  const costed = input.epics.filter((e) => e.shipped && e.actualUsd !== null && (e.storiesDone ?? 0) > 0)
  const costedUsd = costed.reduce((a, e) => a + (e.actualUsd as number), 0)
  const costedStories = costed.reduce((a, e) => a + (e.storiesDone as number), 0)

  const tiles: FinopsTile[] = [
    {
      label: 'Spend this month',
      // D4: any unpriced model this month makes the figure a lower bound, said as ≥ (fresh review, #232).
      value: thisMonth.length
        ? money(
            monthUsd,
            thisMonth.some((x) => Object.values(x.model_breakdown ?? {}).some((p) => p.usd === null))
          )
        : null,
      absent: 'No usage pushed this month',
      detail: `API $ list-price equivalent · ${thisMonth.length} session${thisMonth.length === 1 ? '' : 's'} · from the usage push`,
    },
    {
      label: 'Quote hit rate',
      value: judged.length ? `${inside} of ${judged.length}` : null,
      absent: 'No quoted epic has shipped yet',
      detail: 'shipped epics whose actual landed inside the quote',
    },
    {
      label: 'Cost per shipped story',
      value: costedStories ? money(costedUsd / costedStories) : null,
      absent: 'No shipped epic carries an actual yet',
      detail: costed.length
        ? `${costed.length} shipped epic${costed.length === 1 ? '' : 's'} with a stamped actual`
        : 'stamped at close',
    },
  ]

  const epics: FinopsEpicRow[] = relevant.map((e) => {
    const live = input.byEpic[e.slug]
    const actualSource = e.actualUsd !== null ? 'stamped' : live ? 'live' : 'none'
    return {
      slug: e.slug,
      name: e.name ?? e.slug,
      appetite: e.appetite ?? '—',
      quote: e.quoteLow !== null && e.quoteHigh !== null ? `$${e.quoteLow}–${e.quoteHigh}` : 'not quoted',
      actual:
        actualSource === 'stamped'
          ? money(e.actualUsd as number)
          : actualSource === 'live'
            ? `${money(live.usd, live.usdLowerBound)} so far`
            : 'not measured',
      actualSource,
      delta:
        e.deltaPct === null
          ? '—'
          : `${e.deltaPct > 0 ? '+' : e.deltaPct < 0 ? '−' : '±'}${Math.abs(e.deltaPct)}%`,
      tone: e.verdict,
      sessions: live ? String(live.sessions) : '—',
    }
  })

  return {
    state: 'populated',
    tiles,
    epics,
    bySkill: shareRows(input.bySkill),
    byModel: shareRows(input.byModel),
    lastUsageAt: input.lastAt,
  }
}

/** The Epics table as CSV (the page's "Export CSV"). Every cell quoted; a formula-looking cell is defused. */
export function epicsCsv(rows: readonly FinopsEpicRow[]): string {
  const cell = (v: string) => {
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
    return `"${s.replace(/"/g, '""')}"`
  }
  const head = ['Epic', 'Slug', 'Appetite', 'Quote', 'Actual', 'Actual source', 'Δ', 'Sessions']
  return [
    head,
    ...rows.map((r) => [r.name, r.slug, r.appetite, r.quote, r.actual, r.actualSource, r.delta, r.sessions]),
  ]
    .map((line) => line.map(cell).join(','))
    .join('\n')
}
