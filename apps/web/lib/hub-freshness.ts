// pod-report · Sprint 1 — the freshness stamp.
//
// sprint-1.md is specific that this is "a design element, not fine print": the hub renders a
// tenant's LAST PUSH, and a viewer who cannot tell whether that was 20 minutes or 3 weeks ago is
// reading a claim, not evidence. Sprint 3 hands these views to clients and investors through share
// links, where the question "is this current?" is the first one a skeptical reader asks.
//
// No framework/server-only imports, so both hub views share one implementation and one test rather
// than each formatting ages slightly differently.

/** How stale a stamp is, in the terms the UI reacts to. */
export type FreshnessTone = 'fresh' | 'recent' | 'stale' | 'unknown'

export type Freshness = {
  /** Human phrase: "2h ago", "just now", "3 days ago". */
  age: string
  tone: FreshnessTone
  /** Short SHA when provenance was pushed, else null. */
  shortCommit: string | null
  /** Full ISO instant, for a `<time dateTime>` attribute and a hover title. */
  iso: string | null
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Format an artifact's age relative to `now`.
 *
 * `now` is injected rather than read from the clock so the tests are deterministic — a formatter
 * that reads `Date.now()` internally can only be tested by freezing time globally, which makes the
 * whole suite order-dependent.
 *
 * Deliberately coarse. "2h ago" is what a reader needs; "2h 13m 40s ago" is noise that also forces
 * a re-render to stay true.
 */
export function formatFreshness(
  generatedAt: string | null | undefined,
  now: Date = new Date(),
  sourceCommit?: string | null
): Freshness {
  const shortCommit = sourceCommit ? sourceCommit.slice(0, 7) : null
  if (!generatedAt) return { age: 'unknown', tone: 'unknown', shortCommit, iso: null }

  const then = new Date(generatedAt)
  const ms = then.getTime()
  if (Number.isNaN(ms)) return { age: 'unknown', tone: 'unknown', shortCommit, iso: null }

  const delta = now.getTime() - ms
  const iso = then.toISOString()

  // A FUTURE timestamp is not "0 minutes ago" — it means clock skew between the pusher and us, or a
  // generator writing a wrong date. Saying "just now" would launder a real data problem into a
  // confident-looking stamp, so it gets its own visible label.
  if (delta < -MINUTE) return { age: 'clock skew', tone: 'unknown', shortCommit, iso }

  if (delta < MINUTE) return { age: 'just now', tone: 'fresh', shortCommit, iso }
  if (delta < HOUR) {
    const m = Math.floor(delta / MINUTE)
    return { age: `${m}m ago`, tone: 'fresh', shortCommit, iso }
  }
  if (delta < DAY) {
    const h = Math.floor(delta / HOUR)
    return { age: `${h}h ago`, tone: h < 12 ? 'fresh' : 'recent', shortCommit, iso }
  }
  const d = Math.floor(delta / DAY)
  return {
    age: d === 1 ? 'yesterday' : `${d} days ago`,
    // Seven days is the line where "the roadmap moved and nobody pushed" becomes the likely
    // explanation, which is exactly when a viewer should stop trusting the view as current.
    tone: d < 7 ? 'recent' : 'stale',
    shortCommit,
    iso,
  }
}

/**
 * The full stamp line: "as of merge abc1234, 2h ago".
 *
 * Falls back cleanly when a tenant pushed without provenance — their own tooling may have no commit
 * to cite, and the age alone is still the useful half.
 */
export function freshnessLabel(f: Freshness): string {
  if (f.tone === 'unknown' && !f.shortCommit) return `as of an unknown time`
  if (!f.shortCommit) return `as of ${f.age}`
  return `as of merge ${f.shortCommit}, ${f.age}`
}
