'use server'
import { revalidatePath } from 'next/cache'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { issueApiKey, revokeApiKey } from '@/lib/api-keys'

// multi-tenant-activation · Sprint 1, Story 1.3 — the key lifecycle server actions. Each re-checks
// membership server-side (requireProjectMembership) — the client is never trusted to have done so,
// and the mutation is scoped to the resolved project_id, so a member of one project can't touch
// another's keys by passing a foreign slug or key id.

export async function issueKeyAction(slug: string, label: string) {
  const { projectId } = await requireProjectMembership(slug)
  const result = await issueApiKey(projectId, label)
  revalidatePath(`/app/keys/${slug}`)
  return result
}

export async function revokeKeyAction(slug: string, keyId: string) {
  const { projectId } = await requireProjectMembership(slug)
  const ok = await revokeApiKey(projectId, keyId)
  revalidatePath(`/app/keys/${slug}`)
  return { ok }
}
