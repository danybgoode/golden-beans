function weakValue(value: string): string {
  return value.startsWith('W/') ? value.slice(2).trimStart() : value
}

/**
 * If-None-Match on GET uses weak comparison: W/"revision" and "revision" identify the same
 * representation. Multiple validators and the wildcard are accepted; malformed values miss.
 */
export function ifNoneMatchIncludes(header: string | null, etag: string): boolean {
  if (!header) return false
  const expected = weakValue(etag)
  return header
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || weakValue(value) === expected)
}
