// Timezone-stable, fail-safe UTC display for server-sourced timestamps. Keep this import-free so
// malformed-data behavior is directly testable and a bad historical row cannot crash a dashboard.

export const UNKNOWN_UTC_TIME = 'Unknown time'

export function formatUtc(iso: string): string {
  const milliseconds = Date.parse(iso)
  if (!Number.isFinite(milliseconds)) return UNKNOWN_UTC_TIME

  const normalized = new Date(milliseconds).toISOString()
  return `${normalized.slice(0, 16).replace('T', ' ')} UTC`
}
