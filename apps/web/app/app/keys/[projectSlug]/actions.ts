'use server'
import { revalidatePath } from 'next/cache'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { issueApiKey, revokeApiKey } from '@/lib/api-keys'

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

  const { projectId } = await requireProjectOwnership(safeSlug)
  const result = await issueApiKey(projectId, safeLabel)
  revalidatePath(`/app/keys/${safeSlug}`)
  return result
}

export async function revokeKeyAction(slug: unknown, keyId: unknown) {
  const safeSlug = requireString(slug, 'project')
  const safeKeyId = requireString(keyId, 'key id')

  const { projectId } = await requireProjectOwnership(safeSlug)
  const ok = await revokeApiKey(projectId, safeKeyId)
  revalidatePath(`/app/keys/${safeSlug}`)
  return { ok }
}
