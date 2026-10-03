// finops · Story 3.2 — an epic's quote and actual, read off the roadmap artifact. FRAMEWORK-FREE (no imports), so the
// Hub, /app/finops, portfolio-view and a unit spec all read the SAME derivation.
//
// The numbers come from the epic README's frontmatter (finops D6), carried by the ordinary roadmap push — no second
// pipeline. Absent is "not quoted" / "not measured", never zero (D4).

export type EpicFinops = {
  slug: string
  name: string | null
  appetite: string | null
  status: string | null
  shipped: boolean
  quoteLow: number | null
  quoteHigh: number | null
  quoteBasis: string | null
  actualUsd: number | null
  actualMtok: number | null
  actualBasis: string | null
  /** Actual vs the quote's TOP, in whole percent (the band's "over" rule): +29 is 29% over, -31 is 31% under. */
  deltaPct: number | null
  /** Inside the quote, over it, under it — null when either side is missing. */
  verdict: 'inside' | 'over' | 'under' | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** One roadmap row → its FinOps view. A quote counts only when both ends are numbers in order. */
export function epicFinops(row: Record<string, unknown>): EpicFinops {
  let quoteLow = num(row.quote_low_usd)
  let quoteHigh = num(row.quote_high_usd)
  if (quoteLow === null || quoteHigh === null || quoteLow > quoteHigh) quoteLow = quoteHigh = null
  const actualUsd = num(row.actual_usd)
  const status = str(row.status)
  const deltaPct =
    quoteHigh !== null && actualUsd !== null && quoteHigh > 0
      ? Math.round(((actualUsd - quoteHigh) / quoteHigh) * 100)
      : null
  const verdict =
    quoteLow === null || quoteHigh === null || actualUsd === null
      ? null
      : actualUsd > quoteHigh
        ? 'over'
        : actualUsd < quoteLow
          ? 'under'
          : 'inside'
  return {
    slug: String(row.slug ?? ''),
    name: str(row.name),
    appetite: str(row.appetite),
    status,
    shipped: (status ?? '').trim().toLowerCase() === 'shipped',
    quoteLow,
    quoteHigh,
    quoteBasis: quoteLow === null ? null : str(row.quote_basis),
    actualUsd,
    actualMtok: num(row.actual_mtok),
    actualBasis: str(row.actual_basis),
    deltaPct,
    verdict,
  }
}

/**
 * The typed accessor portfolio-view reads (finops 3.2): every EPIC row of a roadmap artifact's payload, as FinOps
 * views. Anything that is not an artifact payload yields [] — a reader never throws on someone else's data.
 */
export function epicFinopsFromArtifact(payload: unknown): EpicFinops[] {
  const items = (payload as { items?: unknown } | null)?.items
  if (!Array.isArray(items)) return []
  return items
    .filter(
      (i): i is Record<string, unknown> =>
        typeof i === 'object' && i !== null && (i as { grain?: unknown }).grain === 'Epic'
    )
    .map(epicFinops)
}

const dollars = (n: number) => `$${n >= 100 || Number.isInteger(n) ? Math.round(n) : n.toFixed(2)}`

/** `Quote $30–55 · Actual ≈$38 (−31%)` — or the half that exists — or null when the epic has neither. */
export function quoteActualLine(f: EpicFinops): string | null {
  const quote =
    f.quoteLow !== null && f.quoteHigh !== null ? `Quote ${dollars(f.quoteLow)}–${f.quoteHigh}` : null
  const delta =
    f.deltaPct === null
      ? ''
      : ` (${f.deltaPct > 0 ? '+' : f.deltaPct < 0 ? '−' : '±'}${Math.abs(f.deltaPct)}%)`
  const actual = f.actualUsd !== null ? `Actual ≈${dollars(f.actualUsd)}${delta}` : null
  if (!quote && !actual) return null
  return [quote ?? 'Not quoted', actual ?? 'not measured yet'].join(' · ')
}
