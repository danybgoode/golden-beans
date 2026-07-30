// PostgREST serializes timestamptz values with an explicit +00:00 offset, while the public wire
// contracts intentionally require one canonical UTC representation. Normalize only at this
// database-to-wire boundary; malformed and non-string values remain unchanged so the downstream
// contract parser still rejects them instead of manufacturing a plausible timestamp.
const DATABASE_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/

export function canonicalizeDatabaseInstant(value: unknown): unknown {
  if (typeof value !== 'string' || !DATABASE_INSTANT.test(value)) return value
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : value
}
