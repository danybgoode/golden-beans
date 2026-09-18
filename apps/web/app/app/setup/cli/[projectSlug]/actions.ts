'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { recordAudit } from '@/lib/audit'
import { listCliTokens, mintCliToken, revokeCliToken } from '@/lib/cli-tokens'
import { getSessionUser } from '@/lib/supabase-auth'
import { CLI_TOKEN_EXPIRY_DAYS } from '@/lib/credential-inventory'

// golden-frijoles-cli · Sprint 1, Story 1.2 — mint and revoke the CLI's personal access token.
//
// ── The authorization question here is NOT the usual one ──────────────────────────────────────
// Every other credential action in this console calls `requireProjectOwnership`, because every other
// credential is project-scoped and minting one is an act against a tenant. A CLI token is bound to a
// USER and grants nothing that user's session does not already grant (lib/cli-tokens.ts explains
// why, at length). So the question is simply "are you signed in, and is this your own account?" —
// and the answer comes from the SESSION, never from anything the form submits.
//
// ⚠️ **`userId` is never a parameter.** If you are about to add one, stop: an action that accepts
// the account to mint for is an account-takeover primitive wearing a form field.
//
// ── Why the expiry allow-list, and why `null` is offered ──────────────────────────────────────
// Mirrors `AGENT_KEY_EXPIRY_DAYS`: an operator bounding a credential at mint time is a decision made
// once, instead of a revocation they have to remember. "Until revoked" stays available because CI
// is a real caller and a token that dies mid-release is worse than one that is deliberately long.
//
// ⚠️ The list itself lives in `lib/credential-inventory.ts`, NOT here. A `'use server'` module may
// export only async functions — exporting the array from this file type-checked and linted clean and
// then failed `next build`. Its docstring there records the failure.

async function requireAccount(): Promise<string> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return user.id
}

function revalidate(slug: string) {
  revalidatePath(`/app/setup/cli/${slug}`)
}

export async function mintCliTokenAction(slug: unknown, label: unknown, expiryDays: unknown) {
  if (typeof slug !== 'string') return { ok: false as const, error: 'Invalid request.' }
  const userId = await requireAccount()

  const safeLabel = typeof label === 'string' ? label.trim() : ''
  if (safeLabel.length < 1 || safeLabel.length > 120)
    return { ok: false as const, error: 'Give this token a name of 1–120 characters.' }

  // `null` is "until revoked" and is a real choice; anything outside the allow-list is refused
  // rather than coerced, so the form can never offer a value the action would quietly reinterpret.
  if (expiryDays !== null && expiryDays !== undefined && typeof expiryDays !== 'number')
    return { ok: false as const, error: 'Unsupported expiry.' }
  const days = typeof expiryDays === 'number' ? expiryDays : null
  if (days !== null && !(CLI_TOKEN_EXPIRY_DAYS as readonly number[]).includes(days))
    return { ok: false as const, error: 'Unsupported expiry.' }

  const result = await mintCliToken({
    userId,
    label: safeLabel,
    expiresAt: days === null ? null : new Date(Date.now() + days * 86_400_000),
  })
  if (!result.ok) return result

  // `projectId: null` — this credential belongs to an account, not a project, and filing it under
  // whichever project the operator happened to be looking at would make the project's audit trail
  // claim something about its own access that is not true.
  await recordAudit({
    action: 'cli_token_minted',
    projectId: null,
    actorUserId: userId,
    // The id and the label. NEVER the token: `AuditEntry.metadata` says non-secret context only.
    metadata: { tokenId: result.id, label: safeLabel, expiresInDays: days },
  })
  revalidate(slug)
  return { ok: true as const, plaintext: result.plaintext }
}

export async function revokeCliTokenAction(slug: unknown, tokenId: unknown) {
  if (typeof slug !== 'string' || typeof tokenId !== 'string')
    return { ok: false as const, error: 'Invalid request.' }
  const userId = await requireAccount()

  // Scoped to `userId` inside `revokeCliToken`, which is the property that stops one account
  // revoking another's token by guessing an id — the same shape `revokeApiKey` uses for projects.
  const revoked = await revokeCliToken(userId, tokenId)
  if (!revoked) return { ok: false as const, error: 'That token is not active, or does not belong to you.' }

  await recordAudit({
    action: 'cli_token_revoked',
    projectId: null,
    actorUserId: userId,
    metadata: { tokenId },
  })
  revalidate(slug)
  return { ok: true as const }
}

/** The account's own tokens. Exported for the page; throws on a query failure, never returns []. */
export async function listOwnCliTokens() {
  return listCliTokens(await requireAccount())
}
