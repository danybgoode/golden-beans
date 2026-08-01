'use server'
import { revalidatePath } from 'next/cache'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { isFlagServingEnabled } from '@/lib/flags'
import { parseFlagDefinition, validateFlagKey, type FlagEnvironment } from '@/lib/flag-definition'
import { createFlagDefinitionVersion, deactivateFlag, setFlagActivation } from '@/lib/flag-registry'
import { mintFlagReadKey, revokeFlagReadKey } from '@/lib/flag-read-keys'
import { mintFlagSyncKey, revokeFlagSyncKey } from '@/lib/flag-sync-keys'

const FLAG_SYNC_SOURCE = /^[a-z][a-z0-9_-]{0,63}$/

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`)
  return value
}
function parseReason(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const reason = value.trim()
  return reason.length >= 1 && reason.length <= 500 ? reason : null
}
function parseRevision(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}
function parseEnvironment(value: unknown): FlagEnvironment | null {
  return value === 'development' || value === 'preview' || value === 'production' ? value : null
}
function revalidate(slug: string) {
  revalidatePath(`/app/flags/${slug}`)
}

export async function createFlagDefinitionVersionAction(
  slug: unknown,
  flagKey: unknown,
  definitionJson: unknown,
  reason: unknown
) {
  const safeSlug = requireString(slug, 'project')
  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const safeFlagKey = typeof flagKey === 'string' && validateFlagKey(flagKey) ? flagKey : null
  if (!safeFlagKey) return { ok: false as const, error: 'Invalid flag key.' }
  const safeReason = parseReason(reason)
  if (!safeReason) return { ok: false as const, error: 'A 1–500 character reason is required.' }
  let rawDefinition: unknown
  try {
    rawDefinition = typeof definitionJson === 'string' ? JSON.parse(definitionJson) : definitionJson
  } catch {
    return { ok: false as const, error: 'Definition must be valid JSON.' }
  }
  const parsed = parseFlagDefinition(rawDefinition)
  if (!parsed.ok) return { ok: false as const, error: parsed.errors[0] ?? 'Invalid flag definition.' }
  const result = await createFlagDefinitionVersion({
    projectId,
    flagKey: safeFlagKey,
    definition: parsed.definition,
    reason: safeReason,
    actorUserId: userId,
  })
  if (result.ok) revalidate(safeSlug)
  return result
}

export async function activateFlagAction(
  slug: unknown,
  environment: unknown,
  flagId: unknown,
  versionId: unknown,
  expectedSnapshotVersion: unknown,
  reason: unknown
) {
  // The operational gate is checked first so an OFF deployment cannot perform an activation.
  // Inspection and draft creation deliberately remain available while serving is dark.
  if (!isFlagServingEnabled())
    return { ok: false as const, error: 'Flag serving is unavailable in this deployment.' }
  const safeSlug = requireString(slug, 'project')
  // Resolve ownership before lifecycle payload validation to avoid a foreign-project management oracle.
  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const safeEnvironment = parseEnvironment(environment)
  if (!safeEnvironment || typeof flagId !== 'string' || typeof versionId !== 'string')
    return { ok: false as const, error: 'Invalid flag activation command.' }
  const revision = parseRevision(expectedSnapshotVersion)
  const safeReason = parseReason(reason)
  if (revision === null || !safeReason)
    return { ok: false as const, error: 'Invalid flag activation command.' }
  const result = await setFlagActivation({
    projectId,
    environment: safeEnvironment,
    flagId,
    versionId,
    expectedSnapshotVersion: revision,
    reason: safeReason,
    actorUserId: userId,
  })
  if (result.ok) revalidate(safeSlug)
  return result
}

export async function deactivateFlagAction(
  slug: unknown,
  environment: unknown,
  flagId: unknown,
  expectedSnapshotVersion: unknown,
  reason: unknown
) {
  if (!isFlagServingEnabled())
    return { ok: false as const, error: 'Flag serving is unavailable in this deployment.' }
  const safeSlug = requireString(slug, 'project')
  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const safeEnvironment = parseEnvironment(environment)
  if (!safeEnvironment || typeof flagId !== 'string')
    return { ok: false as const, error: 'Invalid flag deactivation command.' }
  const revision = parseRevision(expectedSnapshotVersion)
  const safeReason = parseReason(reason)
  if (revision === null || !safeReason)
    return { ok: false as const, error: 'Invalid flag deactivation command.' }
  const result = await deactivateFlag({
    projectId,
    environment: safeEnvironment,
    flagId,
    expectedSnapshotVersion: revision,
    reason: safeReason,
    actorUserId: userId,
  })
  if (result.ok) revalidate(safeSlug)
  return result
}

export async function mintFlagReadKeyAction(
  slug: unknown,
  environment: unknown,
  label: unknown,
  expiryDays: unknown
) {
  const safeSlug = requireString(slug, 'project')
  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const safeEnvironment = parseEnvironment(environment)
  if (!safeEnvironment || typeof label !== 'string' || label.length > 120)
    return { ok: false as const, error: 'Invalid flag read key command.' }
  if (expiryDays !== null && expiryDays !== undefined && typeof expiryDays !== 'number')
    return { ok: false as const, error: 'Unsupported expiry.' }
  const days = typeof expiryDays === 'number' ? expiryDays : null
  if (days !== null && ![1, 7, 30, 90].includes(days))
    return { ok: false as const, error: 'Unsupported expiry.' }
  const result = await mintFlagReadKey({
    projectId,
    environment: safeEnvironment,
    label: label.trim(),
    expiresAt: days === null ? null : new Date(Date.now() + days * 86_400_000),
    actorUserId: userId,
  })
  if (result.ok) revalidate(safeSlug)
  return result
}

export async function revokeFlagReadKeyAction(slug: unknown, keyId: unknown) {
  const safeSlug = requireString(slug, 'project')
  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  if (typeof keyId !== 'string') return { ok: false as const, error: 'Invalid key id.' }
  const ok = await revokeFlagReadKey(projectId, keyId, userId)
  if (ok) revalidate(safeSlug)
  return ok ? { ok: true as const } : { ok: false as const, error: 'Could not revoke that key.' }
}

export async function mintFlagSyncKeyAction(
  slug: unknown,
  label: unknown,
  source: unknown,
  expiryDays: unknown
) {
  const safeSlug = requireString(slug, 'project')
  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  if (
    typeof label !== 'string' ||
    label.length > 120 ||
    typeof source !== 'string' ||
    !FLAG_SYNC_SOURCE.test(source)
  )
    return { ok: false as const, error: 'Source must use 1–64 lowercase letters, numbers, underscores or hyphens.' }
  if (expiryDays !== null && expiryDays !== undefined && typeof expiryDays !== 'number')
    return { ok: false as const, error: 'Unsupported expiry.' }
  const days = typeof expiryDays === 'number' ? expiryDays : null
  if (days !== null && ![1, 7, 30, 90].includes(days))
    return { ok: false as const, error: 'Unsupported expiry.' }
  const result = await mintFlagSyncKey({
    projectId,
    label: label.trim(),
    source,
    expiresAt: days === null ? null : new Date(Date.now() + days * 86_400_000),
    actorUserId: userId,
  })
  if (result.ok) revalidate(safeSlug)
  return result
}

export async function revokeFlagSyncKeyAction(slug: unknown, keyId: unknown) {
  const safeSlug = requireString(slug, 'project')
  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  if (typeof keyId !== 'string') return { ok: false as const, error: 'Invalid key id.' }
  const ok = await revokeFlagSyncKey(projectId, keyId, userId)
  if (ok) revalidate(safeSlug)
  return ok ? { ok: true as const } : { ok: false as const, error: 'Could not revoke that key.' }
}
