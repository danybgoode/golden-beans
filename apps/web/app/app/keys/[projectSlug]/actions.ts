'use server'
import { revalidatePath } from 'next/cache'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { issueApiKey, revokeApiKey } from '@/lib/api-keys'
import { recordAudit } from '@/lib/audit'

// multi-tenant-activation · Sprint 1, Story 1.3 — the key lifecycle server actions.
//
// Each re-checks OWNERSHIP server-side (requireProjectOwnership) — the client is never trusted to
// have done so, and the mutation is scoped to the resolved project_id, so a member of one project
// can't touch another's keys by passing a foreign slug or key id. Credential admin is owner-only
// (cross-review round 2): an ordinary member reads dashboards but can't mint or revoke keys.
//
// Server Actions are a public HTTP surface and TypeScript types are erased at runtime, so every
// argument is validated as a real string before use — a forged request passing an object would
// otherwise throw an unhandled TypeError inside the lib (cross-review round 2, Gemini/Agy).
function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`)
  return value
}

const MAX_LABEL_LENGTH = 64

export async function issueKeyAction(slug: unknown, label: unknown) {
  const safeSlug = requireString(slug, 'project')
  const safeLabel = requireString(label ?? '', 'label').slice(0, MAX_LABEL_LENGTH)

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const result = await issueApiKey(projectId, safeLabel)
  // Story 2.2 — audit the credential lifecycle. Recorded here, in the action, rather than inside
  // lib/api-keys.ts: this is the only layer that knows WHO acted (the lib is also reachable from
  // the signup provisioner, where there is no acting session yet). The label is non-secret and
  // useful for "which key was this?"; the plaintext never goes anywhere near an audit row.
  if (result.ok) {
    await recordAudit({
      action: 'api_key_issued',
      projectId,
      actorUserId: userId,
      metadata: { label: safeLabel || 'untitled' },
    })
  }
  revalidatePath(`/app/keys/${safeSlug}`)
  return result
}

export async function revokeKeyAction(slug: unknown, keyId: unknown) {
  const safeSlug = requireString(slug, 'project')
  const safeKeyId = requireString(keyId, 'key id')

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const ok = await revokeApiKey(projectId, safeKeyId)
  // Only a real revocation is audited. revokeApiKey returns false for an already-revoked or
  // foreign key id, and logging those would fill the trail with rows describing nothing that
  // happened — the opposite of what an operator reading it during an incident needs.
  if (ok) {
    await recordAudit({
      action: 'api_key_revoked',
      projectId,
      actorUserId: userId,
      metadata: { keyId: safeKeyId },
    })
  }
  revalidatePath(`/app/keys/${safeSlug}`)
  return { ok }
}
