'use server'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { mintAgentWriteKey, revokeAgentWriteKey } from '@/lib/agent-write-keys'
import { isConnectorWritesEnabled } from '@/lib/flags'
import { recordAudit } from '@/lib/audit'

// signals-loop · Sprint 3, Story 3.1 — the agent-write credential lifecycle server actions.
//
// Structurally the same as the share-link and API-key actions next door, and deliberately so. This
// credential is the strongest of the three: it authorizes MUTATION of a tenant's task queue through
// a public MCP surface. So it gets the strictest of the existing gates, not a new one —
// OWNER-only, re-checked server-side on every entry point, with the mutation scoped to the resolved
// project_id so a member of one project cannot touch another's credentials by passing a foreign
// slug or row id (LEARNINGS: a role column is not an access rule; one gate per privilege LEVEL).

// Server Actions are a public HTTP surface and TypeScript types are erased at runtime, so every
// argument is validated as a real string before use.
function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`)
  return value
}

const MAX_LABEL_LENGTH = 64

/**
 * Optional expiries offered in the UI, in days.
 *
 * `null` ("until revoked") is offered but is NOT the default in the UI, unlike share links. An
 * agent credential is typically minted for one agent's working session or one automation, and a
 * write credential that outlives its purpose is the one most worth bounding at mint time — the
 * decision an operator makes once, instead of a revocation they have to remember.
 */
const ALLOWED_EXPIRY_DAYS = [1, 7, 30, 90] as const

export async function mintAgentKeyAction(slug: unknown, label: unknown, expiryDays: unknown) {
  const safeSlug = requireString(slug, 'project')
  const safeLabel = requireString(label ?? '', 'label').slice(0, MAX_LABEL_LENGTH)

  // ── "Not a number" must not mean "never expires" (cross-review, Agy, PR #38) ────────────────
  // This read `typeof expiryDays === 'number' ? expiryDays : null`, and `null` is the encoding for
  // "until revoked". So any non-number — a stringified "7" from a hand-rolled client, a form
  // payload, a typo — silently skipped the ALLOWED_EXPIRY_DAYS check and minted a credential that
  // never expires. A Server Action is a public HTTP surface and TypeScript types are erased at
  // runtime, so "the UI always sends a number" is not a guarantee about callers.
  //
  // Only an explicitly ABSENT value now means "until revoked". Anything present must be a valid
  // number from the allow-list, or the request is refused — the failure direction that matters,
  // because the silent one hands out a longer-lived credential than anyone asked for.
  if (expiryDays !== null && expiryDays !== undefined && typeof expiryDays !== 'number') {
    return { ok: false as const, error: 'Unsupported expiry.' }
  }
  const days = typeof expiryDays === 'number' ? expiryDays : null
  if (days !== null && !ALLOWED_EXPIRY_DAYS.includes(days as (typeof ALLOWED_EXPIRY_DAYS)[number])) {
    return { ok: false as const, error: 'Unsupported expiry.' }
  }

  const { projectId, userId } = await requireProjectOwnership(safeSlug)

  const expiresAt = days === null ? null : new Date(Date.now() + days * 86_400_000)
  const result = await mintAgentWriteKey({ projectId, label: safeLabel, expiresAt })
  if (!result.ok) return result

  // The row id, label and expiry are non-secret and are exactly what an operator needs to answer
  // "which credential is this, and who minted it?" during an incident. The plaintext key never goes
  // anywhere near an audit row — the same rule the API-key and share actions follow.
  await recordAudit({
    action: 'agent_write_key_minted',
    projectId,
    actorUserId: userId,
    metadata: {
      keyId: result.id,
      label: safeLabel || 'untitled',
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  })

  return { ok: true as const, plaintext: result.plaintext, id: result.id }
}

export async function revokeAgentKeyAction(slug: unknown, keyId: unknown) {
  const safeSlug = requireString(slug, 'project')
  const safeKeyId = requireString(keyId, 'key id')

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  // Scope-constrained, for the reason pod-report S3's cross-review established on the share path:
  // the generic `revokeApiKey` would revoke ANY row scoped to the project, so a request carrying an
  // ingest key's id would revoke ingest while the trail recorded `agent_write_key_revoked`. The
  // predicate lives in lib/agent-write-keys.ts so the endpoint and the audit label cannot disagree.
  const ok = await revokeAgentWriteKey(projectId, safeKeyId)
  if (ok) {
    await recordAudit({
      action: 'agent_write_key_revoked',
      projectId,
      actorUserId: userId,
      metadata: { keyId: safeKeyId },
    })
  }
  return { ok }
}

/**
 * Whether the agent WRITE surface is currently serving.
 *
 * Read for DISPLAY only. Minting is deliberately still allowed while the gate is dark: Story 3.4's
 * launch mints a real credential and then flips, and a gate that also blocked preparation would
 * force the flip to come first — exactly the rollout order LEARNINGS says causes outages. The page
 * says so plainly, so "dark by design" and "my credential is broken" stay distinguishable.
 */
export async function agentWritesEnabledAction() {
  return { enabled: isConnectorWritesEnabled() }
}
