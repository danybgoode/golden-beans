const FLAG_KEY = /^[a-z][a-z0-9_.-]{0,127}$/

export type FlagAdminOperation = {
  key: string
  enabled: boolean
  expectedSnapshotVersion: number
  reason: string
}

/** Clerk user ids are carried in a header by Miyagi's server-only, Clerk-admin-gated seam. */
export function isVerifiedMiyagiActor(value: unknown): value is string {
  return typeof value === 'string' && /^user_[A-Za-z0-9]{1,128}$/.test(value)
}

/** PostgreSQL command errors that are safe to surface as an actionable client response. */
export function flagAdminMutationErrorStatus(code: string | undefined): 400 | 409 | 500 {
  if (code === 'P0001') return 409 // stale optimistic snapshot version
  if (code === '22023') return 400 // malformed or non-operable flag command
  return 500
}

/** Reject rather than coerce every field on this operational control-plane mutation. */
export function parseFlagAdminOperation(value: unknown): FlagAdminOperation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (
    typeof input.key !== 'string' ||
    !FLAG_KEY.test(input.key) ||
    typeof input.enabled !== 'boolean' ||
    !Number.isSafeInteger(input.expectedSnapshotVersion) ||
    (input.expectedSnapshotVersion as number) < 0 ||
    reason.length < 1 ||
    reason.length > 500
  ) {
    return null
  }
  return {
    key: input.key,
    enabled: input.enabled,
    expectedSnapshotVersion: input.expectedSnapshotVersion as number,
    reason,
  }
}
