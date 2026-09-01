'use server'
import { revalidatePath } from 'next/cache'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { issueApiKey, revokeApiKey } from '@/lib/api-keys'
import { mintFlagReadKey, revokeFlagReadKey } from '@/lib/flag-read-keys'
import { mintFlagSyncKey, revokeFlagSyncKey } from '@/lib/flag-sync-keys'
import { mintAgentWriteKey, revokeAgentWriteKey } from '@/lib/agent-write-keys'
import { FLAG_ENVIRONMENTS, type FlagEnvironment } from '@/lib/flag-definition'
import { AGENT_KEY_EXPIRY_DAYS, type CredentialKind } from '@/lib/credential-inventory'
import { recordAudit } from '@/lib/audit'

// design-system-rails · Sprint 4, Story 4.5 — the credential lifecycle, on ONE page.
//
// ── Not delegated, and this file is why ───────────────────────────────────────────────────────
// Credentials are the never-delegated row (README → *Routing*). This module mints four kinds of
// bearer credential and revokes four; every one of the eight entry points is a public HTTP surface
// that hands out or destroys access to a tenant's data.
//
// ── What MOVED, and what did not ──────────────────────────────────────────────────────────────
// The eight lifecycle calls below already existed, spread across three routes' `actions.ts` files
// and the flags page's. Their bodies are unchanged in substance: the same `lib/` function, the same
// `requireProjectOwnership` at the top, the same audit row with the same metadata, the same
// scope-constrained revoke. What changed is that they live in ONE module beside the ONE page that
// calls them, so "minting moves onto the page in the same commit that retires the three routes" is a
// property of the file system rather than a promise.
//
// ── The rules every one of these follows, stated once ─────────────────────────────────────────
//   1. **Ownership is re-asserted here, independently** (sprint contract #8). The page's own gate is
//      never the only thing between a member and a mint: a Server Action is a public HTTP endpoint
//      reachable without ever rendering the page, so the page's check protects nothing about it.
//   2. **Every argument is validated as a real string.** TypeScript types are erased at runtime, so
//      a forged request passing an object would otherwise throw an unhandled `TypeError` inside the
//      lib rather than being refused.
//   3. **The mutation is scoped to the RESOLVED `projectId`**, never to a caller-supplied one, so a
//      member of one project cannot touch another's credentials by passing a foreign slug or row id.
//   4. **The plaintext never reaches an audit row.** The row id, the label and the expiry do — they
//      are what answers "which credential is this, and who minted it?" during an incident.
//   5. **A revoke is audited only when something was actually revoked.** The lib functions return
//      false for an already-revoked or foreign id, and logging those would fill the trail with rows
//      describing nothing that happened.

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`)
  return value
}

const MAX_LABEL_LENGTH = 64

/** The path every action revalidates — there is exactly one page now, which is the point. */
const pageOf = (slug: string) => `/app/setup/keys/${slug}`

export type MintResult = { ok: true; plaintext: string } | { ok: false; error: string }

// ── ingest ────────────────────────────────────────────────────────────────────────────────────

export async function mintIngestKeyAction(slug: unknown, label: unknown): Promise<MintResult> {
  const safeSlug = requireString(slug, 'project')
  const safeLabel = requireString(label ?? '', 'label').slice(0, MAX_LABEL_LENGTH)

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const result = await issueApiKey(projectId, safeLabel)
  if (result.ok) {
    await recordAudit({
      action: 'api_key_issued',
      projectId,
      actorUserId: userId,
      metadata: { keyId: result.id, label: safeLabel || 'untitled' },
    })
  }
  revalidatePath(pageOf(safeSlug))
  return result.ok ? { ok: true, plaintext: result.plaintext } : { ok: false, error: result.error }
}

// ── flag_read — needs an ENVIRONMENT ──────────────────────────────────────────────────────────

export async function mintFlagReadKeyAction(
  slug: unknown,
  environment: unknown,
  label: unknown
): Promise<MintResult> {
  const safeSlug = requireString(slug, 'project')
  const safeLabel = requireString(label ?? '', 'label').slice(0, MAX_LABEL_LENGTH)
  const safeEnvironment = requireString(environment, 'environment')
  // ⚠️ An ALLOW-LIST, not a cast. A snapshot key is bound to exactly one environment, and a value
  // the database's own CHECK would reject must be refused here rather than surfacing as a raw
  // Postgres error — and a value it would ACCEPT but that is not one of the three would mint a
  // credential scoped to an environment nothing serves.
  if (!FLAG_ENVIRONMENTS.includes(safeEnvironment as FlagEnvironment)) {
    return { ok: false, error: 'Unsupported environment.' }
  }

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const result = await mintFlagReadKey({
    projectId,
    environment: safeEnvironment as FlagEnvironment,
    label: safeLabel,
    actorUserId: userId,
  })
  // ⚠️ **NO `recordAudit` here, and that is not an omission.** `create_flag_read_key` is a
  // `SECURITY DEFINER` RPC that writes its own `flag_read_key_minted` row inside the same
  // transaction as the insert — verified in `20260807110000_flag_read_credentials.sql`. Adding one
  // here would double-log, and an audit trail that records a single mint twice is read as two
  // credentials during an incident. The same holds for `flag_sync` below and for both revokes.
  revalidatePath(pageOf(safeSlug))
  return result.ok ? { ok: true, plaintext: result.plaintext } : { ok: false, error: result.error }
}

// ── flag_sync — needs a SOURCE ────────────────────────────────────────────────────────────────

/**
 * The publisher source, as the database accepts it.
 *
 * Mirrors the `pattern` the old form put on its input — and it is enforced HERE because an
 * HTML `pattern` attribute is a hint to a browser, not a check. A Server Action is reachable
 * without a browser at all.
 */
const SOURCE_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/

export async function mintFlagSyncKeyAction(
  slug: unknown,
  source: unknown,
  label: unknown
): Promise<MintResult> {
  const safeSlug = requireString(slug, 'project')
  const safeLabel = requireString(label ?? '', 'label').slice(0, MAX_LABEL_LENGTH)
  const safeSource = requireString(source, 'source')
  if (!SOURCE_PATTERN.test(safeSource)) {
    return {
      ok: false,
      error: 'A source is lower-case letters, numbers, hyphens or underscores, starting with a letter.',
    }
  }

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const result = await mintFlagSyncKey({
    projectId,
    label: safeLabel,
    source: safeSource,
    actorUserId: userId,
  })
  // No `recordAudit` — `create_flag_sync_key` writes `flag_sync_key_minted` itself. See the note on
  // the snapshot key above.
  revalidatePath(pageOf(safeSlug))
  return result.ok ? { ok: true, plaintext: result.plaintext } : { ok: false, error: result.error }
}

// ── agent_write — needs an EXPIRY from an allow-list ──────────────────────────────────────────

export async function mintAgentWriteKeyAction(
  slug: unknown,
  expiryDays: unknown,
  label: unknown
): Promise<MintResult> {
  const safeSlug = requireString(slug, 'project')
  const safeLabel = requireString(label ?? '', 'label').slice(0, MAX_LABEL_LENGTH)

  // ── "Not a number" must not mean "never expires" ─────────────────────────────────────────
  // The original read `typeof expiryDays === 'number' ? expiryDays : null`, and `null` is the
  // encoding for "until revoked". So any non-number — a stringified "7" from a hand-rolled client, a
  // form payload, a typo — silently skipped the allow-list check and minted a credential that never
  // expires (cross-review, agy, PR #38). Only an explicitly ABSENT value means "until revoked".
  // Carried across from `/app/agent-keys/actions.ts` verbatim in substance, because it is the
  // reasoning as much as the code: the failure direction that matters is the silent one, which hands
  // out a longer-lived credential than anyone asked for.
  if (expiryDays !== null && expiryDays !== undefined && typeof expiryDays !== 'number') {
    return { ok: false, error: 'Unsupported expiry.' }
  }
  const days = typeof expiryDays === 'number' ? expiryDays : null
  if (days !== null && !AGENT_KEY_EXPIRY_DAYS.includes(days as (typeof AGENT_KEY_EXPIRY_DAYS)[number])) {
    return { ok: false, error: 'Unsupported expiry.' }
  }

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const expiresAt = days === null ? null : new Date(Date.now() + days * 86_400_000)
  const result = await mintAgentWriteKey({ projectId, label: safeLabel, expiresAt })
  if (result.ok) {
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
  }
  revalidatePath(pageOf(safeSlug))
  return result.ok ? { ok: true, plaintext: result.plaintext } : { ok: false, error: result.error }
}

// ── Revoking, one entry point, dispatched on the kind ─────────────────────────────────────────

/**
 * ⚠️ **ONE action, FOUR scope-constrained lib calls — never a generic revoke-by-id.**
 *
 * `revokeApiKey` revokes ANY row scoped to the project, so a request carrying a snapshot key's id
 * would revoke it while the trail recorded `api_key_revoked`. The per-kind functions each constrain
 * the UPDATE to their own scope, which is what keeps the endpoint and the audit label from
 * disagreeing (the property `pod-report` S3's cross-review established on the share path).
 *
 * The `kind` is validated against the closed union before it is used, so an unknown value is a
 * refusal rather than a fallthrough to whichever branch is last.
 */
/**
 * Which kinds this action audits ITSELF, and which the database already audits.
 *
 * ⚠️ **`flag_read` and `flag_sync` are `null` on purpose.** Their revoke RPCs are `SECURITY DEFINER`
 * functions that write `flag_read_key_revoked` / `flag_sync_key_revoked` inside the same transaction
 * as the UPDATE. Writing a second row here would make one revocation look like two — and during an
 * incident, "how many credentials were killed" is exactly the question this trail is read for. The
 * other two go through plain table writes with no trigger behind them, so the action is the only
 * place their event can be recorded.
 *
 * A `Record` over the CLOSED union rather than an `if` chain: a fifth kind is a compile error here,
 * which is what stops one being added with no decision about its trail.
 */
const REVOKE_AUDIT: Record<CredentialKind, string | null> = {
  ingest: 'api_key_revoked',
  flag_read: null,
  flag_sync: null,
  agent_write: 'agent_write_key_revoked',
}

export async function revokeCredentialAction(
  slug: unknown,
  kind: unknown,
  keyId: unknown
): Promise<{ ok: boolean; error?: string }> {
  const safeSlug = requireString(slug, 'project')
  const safeKeyId = requireString(keyId, 'key id')
  const safeKind = requireString(kind, 'kind')
  if (!(safeKind in REVOKE_AUDIT)) return { ok: false, error: 'Unknown credential kind.' }
  const credentialKind = safeKind as CredentialKind

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const revoked =
    credentialKind === 'ingest'
      ? await revokeApiKey(projectId, safeKeyId)
      : credentialKind === 'flag_read'
        ? await revokeFlagReadKey(projectId, safeKeyId, userId)
        : credentialKind === 'flag_sync'
          ? await revokeFlagSyncKey(projectId, safeKeyId, userId)
          : await revokeAgentWriteKey(projectId, safeKeyId)

  const auditAction = REVOKE_AUDIT[credentialKind]
  if (revoked && auditAction !== null) {
    await recordAudit({
      action: auditAction as Parameters<typeof recordAudit>[0]['action'],
      projectId,
      actorUserId: userId,
      metadata: { keyId: safeKeyId },
    })
  }
  revalidatePath(pageOf(safeSlug))
  // `false` is not an error — it is "that credential was already revoked, or is not yours". The
  // caller says so in those words rather than reporting a failure that did not happen.
  return { ok: revoked }
}
