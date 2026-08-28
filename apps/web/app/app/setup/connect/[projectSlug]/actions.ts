'use server'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { isConnectorEnabled, isConsoleShellEnabled } from '@/lib/flags'
import { mintConnectorToken, revokeConnectorToken } from '@/lib/connector-tokens'
import { recordAudit } from '@/lib/audit'

// console-ia-overhaul · Sprint 2, Story 2.1 (epic README, A10) — the connector credential's
// lifecycle. Daniel authorized this surface on 2026-08-27; before that, `lib/connector-tokens.ts`
// said in its own comment that "v1 has no self-serve token minting".
//
// Structurally identical to the agent-write, share-link and API-key actions next door, deliberately:
// OWNER-only, re-checked server-side on every entry point, with the mutation scoped to the resolved
// `project_id` so a foreign slug or row id matches nothing.

// Server Actions are a public HTTP surface and TypeScript types are erased at runtime, so every
// argument is validated as a real string before use.
function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`)
  return value
}

/**
 * Both gates, checked before the write — AGENTS rule #3, stated as code rather than as a promise.
 *
 * The connector has TWO independent kill switches: `CONNECTOR_ENABLED` and the revocable per-project
 * token. Minting creates the second one. If it did not also require the first, then flipping
 * `CONNECTOR_ENABLED` off would stop the connector serving while still letting an owner mint
 * credentials for it — a switch you can route around is not a switch.
 *
 * `CONSOLE_SHELL_ENABLED` is checked too, because this action only exists to serve a page that
 * 404s without it. A server action is reachable by POST regardless of whether its page rendered.
 */
function gatesOpen(): boolean {
  return isConnectorEnabled() && isConsoleShellEnabled()
}

export async function mintConnectorAction(slug: unknown) {
  const safeSlug = requireString(slug, 'project')
  if (!gatesOpen()) return { ok: false as const, error: 'The connector is not enabled.' }

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const result = await mintConnectorToken(projectId)

  if (!result.ok) {
    // "Already active" is a distinct, honest answer rather than a generic failure: it means someone
    // else minted one (or you have two tabs open), and the right next step is to reload and use it —
    // not to try again. Rotation is revoke-then-mint, two deliberate acts.
    return {
      ok: false as const,
      error:
        result.reason === 'already-active'
          ? 'This project already has an active connector URL. Reload to see it, or revoke it first to rotate.'
          : result.reason === 'unreadable'
            ? // Refusing on a failed READ is deliberate. "I could not check" is not "there is none",
              // and minting on an unanswered question is exactly how a second live credential
              // appears — the compounding half of the race cross-review found.
              'Could not check this project’s existing connector URLs, so nothing was created. Reload and try again.'
            : 'Could not create a connector URL. Try again.',
    }
  }

  // The token id, never the token. The plaintext IS the credential — it authorizes reads of this
  // tenant's data — so it goes to the screen once and nowhere else, the same rule every other mint
  // in this product follows.
  //
  // This closes a real gap rather than merely following a pattern: `audit_log` has thirteen distinct
  // actions in production and NOT ONE of them is connector-related, so until now a connector
  // credential could come into existence leaving no trace at all.
  await recordAudit({
    action: 'connector_token_minted',
    projectId,
    actorUserId: userId,
    metadata: { tokenId: result.tokenId },
  })

  return { ok: true as const, url: result.url }
}

export async function revokeConnectorAction(slug: unknown, tokenId: unknown) {
  const safeSlug = requireString(slug, 'project')
  const safeTokenId = requireString(tokenId, 'token id')

  // Deliberately NOT gated on `gatesOpen()`. Revoking is the safe direction, and a kill switch that
  // stops working when a feature is disabled is backwards — if `CONNECTOR_ENABLED` were flipped off
  // mid-incident, an owner must still be able to permanently kill the credential rather than wait
  // for the flag to come back. Same reasoning as the scenario-stop path (LEARNINGS: separate
  // eligibility to BEGIN from authority to END).
  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const revoked = await revokeConnectorToken(projectId, safeTokenId)
  if (revoked) {
    await recordAudit({
      action: 'connector_token_revoked',
      projectId,
      actorUserId: userId,
      metadata: { tokenId: safeTokenId },
    })
  }
  return { ok: revoked }
}
