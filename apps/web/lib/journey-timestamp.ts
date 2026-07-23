// PostgreSQL `timestamptz` retains microseconds, while JavaScript Date retains only milliseconds.
// Journey ordering and first-entry evidence must not silently collapse distinct database facts, so
// this tiny parser carries the fractional microsecond separately and uses Date only to normalize
// the whole second (including an explicit offset) to UTC.

export type JourneyTimestamp = {
  canonical: string
  epochSecond: number
  microsecond: number
}

const TIMESTAMPTZ =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/

export function parseJourneyTimestamp(value: string): JourneyTimestamp {
  const match = TIMESTAMPTZ.exec(value)
  if (!match) throw new Error('invalid journey source timestamp')

  const [, date, hourMinute, second, fraction = '', offset] = match
  const epochMs = Date.parse(`${date}T${hourMinute}:${second}${offset}`)
  if (!Number.isFinite(epochMs)) throw new Error('invalid journey source timestamp')

  const epochSecond = Math.floor(epochMs / 1_000)
  const microsecond = Number(fraction.padEnd(6, '0'))
  const utcWholeSecond = new Date(epochSecond * 1_000).toISOString().slice(0, 19)
  const paddedFraction = String(microsecond).padStart(6, '0')
  // Keep the existing millisecond-shaped API for exact millisecond values, but never discard a
  // significant PostgreSQL microsecond. This is one stable UTC spelling for equivalent inputs.
  const canonicalFraction = paddedFraction.replace(/0+$/, '').padEnd(3, '0')

  return {
    canonical: `${utcWholeSecond}.${canonicalFraction}Z`,
    epochSecond,
    microsecond,
  }
}

export function compareJourneyTimestamps(a: JourneyTimestamp, b: JourneyTimestamp): number {
  return a.epochSecond - b.epochSecond || a.microsecond - b.microsecond
}
