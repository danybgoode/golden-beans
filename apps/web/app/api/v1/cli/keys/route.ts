import 'server-only'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isFlagEnvironment } from '@golden-frijoles/sdk'
import { cliError, cliOk, requireCliOwner } from '@/lib/cli-auth'
import { issueApiKey, listProjectKeys, revokeApiKey } from '@/lib/api-keys'
import { listFlagReadKeys, mintFlagReadKey, revokeFlagReadKey } from '@/lib/flag-read-keys'
import { listFlagSyncKeys, mintFlagSyncKey, revokeFlagSyncKey } from '@/lib/flag-sync-keys'
import { FLAG_KEY_EXPIRY_DAYS } from '@/lib/credential-inventory'
import { recordAudit } from '@/lib/audit'

// golden-frijoles-cli · Story 1.4 (`gf init` mints a flag_read key) and Story 2.6 (`gf keys`).
//
// ── OWNER, not member, and it is the same boundary the console draws ──────────────────────────
// `requireCliOwner` resolves the PAT to a user and then asks `project_members` whether that user
// owns this project — the same question `requireProjectOwnership` asks of a browser session. A
// member gets the same flat 404 a non-member gets. The CLI is an authentication shortcut; it is not
// a way around least privilege.
//
// ── The three kinds are NOT flattened ─────────────────────────────────────────────────────────
// `lib/credential-inventory.ts` models three blast radii and the seed says in so many words that
// the CLI must not collapse them: `ingest` sends events, `flag_read` reads one environment's
// snapshot, `flag_sync` writes definitions from an outside catalog. `type` is REQUIRED, and each
// kind's own required argument is required — a `flag_read` key with no environment and a
// `flag_sync` key with no source are both refused rather than defaulted, because a default here
// mints a credential pointed somewhere the caller did not choose.
//
// ── Expiry is not a parameter, deliberately ───────────────────────────────────────────────────
// Both flag credentials get `FLAG_KEY_EXPIRY_DAYS`, the constant the console's own mint action
// applies. That constant exists because a sprint nearly dropped the expiry silently and minted
// credentials that never expire under a comment claiming someone had chosen that. Reading it here
// is what stops the CLI and the console disagreeing about how long a key lives.

export const runtime = 'nodejs'

const FLAG_SYNC_SOURCE = /^[a-z][a-z0-9_-]{0,63}$/
const KEY_TYPES = ['ingest', 'flag_read', 'flag_sync'] as const
type KeyType = (typeof KEY_TYPES)[number]

function parseType(value: unknown): KeyType | null {
  return typeof value === 'string' && (KEY_TYPES as readonly string[]).includes(value)
    ? (value as KeyType)
    : null
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const context = await requireCliOwner(req, url.searchParams.get('project'))
  if (context instanceof NextResponse) return context

  try {
    const [ingest, flagRead, flagSync] = await Promise.all([
      listProjectKeys(context.projectId),
      listFlagReadKeys(context.projectId),
      listFlagSyncKeys(context.projectId),
    ])
    return cliOk({
      project: context.projectSlug,
      // One flat list with a `type` on every row, because that is how a caller asks "what can reach
      // this project?" — the same shape, and the same argument, as the console's merged Keys page.
      keys: [
        ...ingest.map((row) => ({
          id: row.id,
          type: 'ingest' as const,
          label: row.label,
          scope: null,
          createdAt: row.createdAt,
          expiresAt: null,
          revokedAt: row.revokedAt,
        })),
        ...flagRead.map((row) => ({
          id: row.id,
          type: 'flag_read' as const,
          label: row.label,
          scope: row.environment,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
        })),
        ...flagSync.map((row) => ({
          id: row.id,
          type: 'flag_sync' as const,
          label: row.label,
          scope: row.source,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
        })),
      ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    })
  } catch (err) {
    // The list functions THROW on a query failure rather than returning [] — an empty list reads as
    // "no credentials", which during an outage invites minting a duplicate or concluding that a
    // leaked key is already gone. That distinction has to survive all the way to the exit code.
    console.error('[cli/keys] list failed:', err)
    return cliError('server_error', 'Could not read this project’s credentials right now.')
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return cliError('invalid', 'Invalid request body.')
  }
  const input = (body ?? {}) as Record<string, unknown>

  const context = await requireCliOwner(req, typeof input.project === 'string' ? input.project : null)
  if (context instanceof NextResponse) return context

  const type = parseType(input.type)
  if (!type) return cliError('invalid', `--type must be one of: ${KEY_TYPES.join(', ')}.`)

  const label = typeof input.label === 'string' ? input.label.trim() : ''
  if (label.length < 1 || label.length > 120)
    return cliError('invalid', 'A label of 1–120 characters is required.')

  const expiresAt = new Date(Date.now() + FLAG_KEY_EXPIRY_DAYS * 86_400_000)

  if (type === 'ingest') {
    const result = await issueApiKey(context.projectId, label)
    if (!result.ok) return cliError('server_error', result.error)
    await recordAudit({
      action: 'api_key_issued',
      projectId: context.projectId,
      actorUserId: context.userId,
      metadata: { keyId: result.id, label, via: 'cli' },
    })
    return cliOk({ type, id: result.id, label, scope: null, expiresAt: null, key: result.plaintext })
  }

  if (type === 'flag_read') {
    const environment = input.environment
    if (typeof environment !== 'string' || !isFlagEnvironment(environment))
      return cliError('invalid', 'A flag_read key needs --env development|preview|production.')
    // The RPC audits `flag_read_key_minted` itself, inside the same statement that inserts the row,
    // so there is no recordAudit here — a second one would double-count the mint.
    const result = await mintFlagReadKey({
      projectId: context.projectId,
      environment,
      label,
      expiresAt,
      actorUserId: context.userId,
    })
    if (!result.ok) return cliError('server_error', result.error)
    return cliOk({
      type,
      id: result.id,
      label,
      scope: environment,
      expiresAt: expiresAt.toISOString(),
      key: result.plaintext,
    })
  }

  const source = input.source
  if (typeof source !== 'string' || !FLAG_SYNC_SOURCE.test(source))
    return cliError(
      'invalid',
      'A flag_sync key needs --source: 1–64 lowercase letters, numbers, underscores or hyphens.'
    )
  const result = await mintFlagSyncKey({
    projectId: context.projectId,
    label,
    source,
    expiresAt,
    actorUserId: context.userId,
  })
  if (!result.ok) return cliError('server_error', result.error)
  return cliOk({
    type,
    id: result.id,
    label,
    scope: source,
    expiresAt: expiresAt.toISOString(),
    key: result.plaintext,
  })
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url)
  const context = await requireCliOwner(req, url.searchParams.get('project'))
  if (context instanceof NextResponse) return context

  const type = parseType(url.searchParams.get('type'))
  const id = url.searchParams.get('id')
  if (!type || !id) return cliError('invalid', 'Revoking needs --type and the key id.')

  // ⚠️ Each kind goes through ITS OWN revoke, never a generic one. `revokeApiKey` is scoped to
  // `scope = 'ingest'` and the two flag revokes constrain inside their RPCs, precisely so the audit
  // trail cannot be chosen by picking an endpoint — the rule `lib/audit.ts` states by name.
  const revoked =
    type === 'ingest'
      ? await revokeApiKey(context.projectId, id)
      : type === 'flag_read'
        ? await revokeFlagReadKey(context.projectId, id, context.userId)
        : await revokeFlagSyncKey(context.projectId, id, context.userId)

  if (!revoked)
    // Already revoked, never existed, or belongs to another project — one answer, as everywhere.
    return cliError('not_found', 'That credential is not active in this project.')

  if (type === 'ingest')
    await recordAudit({
      action: 'api_key_revoked',
      projectId: context.projectId,
      actorUserId: context.userId,
      metadata: { keyId: id, via: 'cli' },
    })

  return cliOk({ type, id, revoked: true })
}
