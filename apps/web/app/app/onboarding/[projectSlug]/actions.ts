'use server'
import { revalidatePath } from 'next/cache'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { consumeOnboardingKeyCookie } from '@/lib/onboarding-key'

// multi-tenant-activation · Sprint 2, Story 2.3 — the "I've saved it" control's server action.
//
// A Server Component render cannot delete a cookie, so the onboarding page physically cannot make
// its own key reveal single-read (cross-review, Codex 2026-07-20: the first version only peeked,
// so a refresh re-displayed the credential for the entire hand-off window). A Server Action can,
// which is what this is for.
//
// Membership is re-checked here even though the action only touches the caller's OWN cookie:
// Server Actions are a public HTTP surface, and the habit of gating every one of them is cheaper
// to keep than to reason about case by case.
export async function dismissOnboardingKeyAction(slug: unknown) {
  if (typeof slug !== 'string') throw new Error('Invalid project')
  await requireProjectMembership(slug)
  await consumeOnboardingKeyCookie()
  revalidatePath(`/app/onboarding/${slug}`)
  return { ok: true }
}
