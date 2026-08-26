'use server'
import { revalidatePath } from 'next/cache'
import { requireProjectMembership, requireProjectOwnership } from '@/lib/dashboard-auth'
import { isFlagRuleBuilderEnabled, isFlagServingEnabled } from '@/lib/flags'
import {
  FLAG_CONTEXT_FIELDS,
  explainFlagEvaluation,
  parseFlagDefinition,
  validateFlagKey,
  type FlagEnvironment,
  type FlagEvaluationContext,
} from '@/lib/flag-definition'
import {
  createFlagDefinitionVersion,
  deactivateFlag,
  getFlagRegistryView,
  setFlagActivation,
} from '@/lib/flag-registry'
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
    return { ok: false as const, error: 'Invalid request to turn this feature on.' }
  const revision = parseRevision(expectedSnapshotVersion)
  const safeReason = parseReason(reason)
  if (revision === null || !safeReason)
    return { ok: false as const, error: 'Invalid request to turn this feature on.' }
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
    return { ok: false as const, error: 'Invalid request to turn this feature off.' }
  const revision = parseRevision(expectedSnapshotVersion)
  const safeReason = parseReason(reason)
  if (revision === null || !safeReason)
    return { ok: false as const, error: 'Invalid request to turn this feature off.' }
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
  const safeLabel = typeof label === 'string' ? label.trim() : ''
  if (safeLabel.length < 1 || safeLabel.length > 120)
    return { ok: false as const, error: 'Label must use 1–120 characters.' }
  if (typeof source !== 'string' || !FLAG_SYNC_SOURCE.test(source))
    return {
      ok: false as const,
      error: 'Source must use 1–64 lowercase letters, numbers, underscores or hyphens.',
    }
  if (expiryDays !== null && expiryDays !== undefined && typeof expiryDays !== 'number')
    return { ok: false as const, error: 'Unsupported expiry.' }
  const days = typeof expiryDays === 'number' ? expiryDays : null
  if (days !== null && ![1, 7, 30, 90].includes(days))
    return { ok: false as const, error: 'Unsupported expiry.' }
  const result = await mintFlagSyncKey({
    projectId,
    label: safeLabel,
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

// ── flags-visual-rule-builder · Sprint 3, Stories 3.1 and 3.2 — preview as a user ──────────────

/**
 * The six-field context, taken from the SDK's own enum and nothing else.
 *
 * Blank is ABSENT, not empty-string. That distinction is the whole of A5 on this screen: a rollout
 * with no `targetingKey` in context excludes its rule outright, so submitting `targetingKey: ''`
 * instead of omitting it would produce a different — and wrong — explanation of why nothing matched.
 *
 * Values are strings because the form holds strings. The evaluator's `sameScalar` compares `typeof`
 * too, so a clause storing the NUMBER 5 will not match `"5"` from this form; the screen says so
 * rather than silently disagreeing with production.
 */
function parseEvaluationContext(value: unknown): FlagEvaluationContext | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = value as Record<string, unknown>
  if (Object.keys(entries).some((key) => !(FLAG_CONTEXT_FIELDS as readonly string[]).includes(key)))
    return null
  const context: Record<string, string> = {}
  for (const field of FLAG_CONTEXT_FIELDS) {
    const raw = entries[field]
    if (raw === undefined || raw === null || raw === '') continue
    if (typeof raw !== 'string' || raw.length > 256) return null
    context[field] = raw
  }
  return context as FlagEvaluationContext
}

/**
 * What this context would see — answered by the SDK's evaluator, server-side, against the version
 * actually activated in that environment (D4).
 *
 * **Read-only.** It creates no version, touches no activation, and writes no audit row; there is no
 * `revalidate` call below for the same reason. Story 3.1's last acceptance criterion is that using
 * the preview leaves the control plane exactly as it found it, and the absence of a write here is
 * the whole of that claim.
 *
 * Membership, not ownership: the flags page already shows definitions and audit to any member, and
 * this answers a question about data they can already read. Owner-only credential enumeration stays
 * where it is.
 */
export async function previewFlagEvaluationAction(
  slug: unknown,
  flagId: unknown,
  environment: unknown,
  context: unknown
) {
  // The gate first, and server-side: with FLAG_RULE_BUILDER_ENABLED unset the surface is not
  // rendered AND the action refuses, so an unreachable button is not the only thing holding it shut.
  if (!isFlagRuleBuilderEnabled())
    return { ok: false as const, error: 'The rule builder is unavailable in this deployment.' }
  const safeSlug = requireString(slug, 'project')
  const { projectId } = await requireProjectMembership(safeSlug)
  const safeEnvironment = parseEnvironment(environment)
  if (!safeEnvironment || typeof flagId !== 'string')
    return { ok: false as const, error: 'Invalid preview command.' }
  const safeContext = parseEvaluationContext(context)
  if (!safeContext)
    return { ok: false as const, error: 'A preview context accepts only the six targeting fields.' }

  const registry = await getFlagRegistryView(projectId)
  const flag = registry.flags.find((row) => row.id === flagId)
  if (!flag) return { ok: false as const, error: 'That flag is not in this project.' }

  const versionId = flag.activations.find((row) => row.environment === safeEnvironment)?.versionId ?? null
  const version = versionId ? flag.versions.find((row) => row.id === versionId) : undefined
  if (!version)
    return {
      ok: false as const,
      error: `${safeEnvironment} is not serving this feature, so there is nothing to preview there yet.`,
    }

  return {
    ok: true as const,
    version: version.version,
    // The SDK's answer, handed through unchanged. No matching logic exists in this file — grep the
    // diff for a clause comparison and there is none to find (D4).
    explanation: explainFlagEvaluation({
      flag: { key: flag.key, definitionVersion: version.version, definition: version.definition },
      context: safeContext,
    }),
  }
}
