'use server'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { mintShareLink, revokeShareLink } from '@/lib/report-shares'
import { parseLens } from '@/lib/pod-report-lens'
import { isReportSharesEnabled } from '@/lib/flags'
import { getSiteUrl } from '@/lib/site-url'
import { recordAudit } from '@/lib/audit'

// pod-report · Sprint 3, Story 3.1 — the share-link lifecycle server actions.
//
// Structurally the same as the API-key actions next door, and deliberately so: minting a link that
// shows a tenant's internal delivery data to an outsider is credential administration, not an
// ordinary member action. Every entry point re-checks OWNERSHIP server-side and scopes the mutation
// to the resolved project_id, so a member of one project cannot touch another's links by passing a
// foreign slug or row id (LEARNINGS: a role column is not an access rule — one gate per privilege
// LEVEL, which multi-tenant-activation S1 had to be told twice).

// Server Actions are a public HTTP surface and TypeScript types are erased at runtime, so every
// argument is validated as a real string before use.
function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`)
  return value
}

const MAX_LABEL_LENGTH = 64

/** Optional expiries offered in the UI, in days. `null` means "until revoked". */
const ALLOWED_EXPIRY_DAYS = [7, 30, 90] as const

export async function mintShareAction(slug: unknown, lens: unknown, label: unknown, expiryDays: unknown) {
  const safeSlug = requireString(slug, 'project')
  const safeLabel = requireString(label ?? '', 'label').slice(0, MAX_LABEL_LENGTH)

  // The lens is validated against the closed set BEFORE anything is written. `parseLens` returns
  // null rather than defaulting, so an unrecognised value fails here instead of quietly minting a
  // link with the widest audience — the one failure mode that would matter.
  const safeLens = parseLens(lens)
  if (!safeLens) return { ok: false as const, error: 'Pick an audience for this link.' }

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
  const result = await mintShareLink({ projectId, lens: safeLens, label: safeLabel, expiresAt })
  if (!result.ok) return result

  // The label, the lens and the row id are non-secret and are exactly what an operator needs to
  // answer "which link is this, and who made it?" during an incident. The token itself never goes
  // anywhere near an audit row — same rule as the API-key actions.
  await recordAudit({
    action: 'report_share_minted',
    projectId,
    actorUserId: userId,
    metadata: {
      shareId: result.id,
      lens: safeLens,
      label: safeLabel || 'untitled',
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  })

  // Built through getSiteUrl(), never from a request Host header (AGENTS rule #5).
  return { ok: true as const, url: `${getSiteUrl()}/s/${result.token}`, id: result.id }
}

export async function revokeShareAction(slug: unknown, shareId: unknown) {
  const safeSlug = requireString(slug, 'project')
  const safeShareId = requireString(shareId, 'share id')

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  // Scope-constrained (cross-review, Codex, PR #33). This called the generic `revokeApiKey`, so a
  // forged request carrying an INGEST key's id revoked that key while the audit row said
  // `report_share_revoked` — an incident responder searching `api_key_revoked` would never find it.
  // Still one UPDATE on one table; the predicate just makes the endpoint and the audit label agree.
  const ok = await revokeShareLink(projectId, safeShareId)
  if (ok) {
    await recordAudit({
      action: 'report_share_revoked',
      projectId,
      actorUserId: userId,
      metadata: { shareId: safeShareId },
    })
  }
  return { ok }
}

/**
 * Whether the share surface is currently serving.
 *
 * Read for DISPLAY only — the page tells an owner that links they mint will 404 until the flag is
 * flipped, which is the difference between "dark by design" and "my link is broken". Minting is
 * deliberately still allowed while dark: Story 3.3's launch mints real links and then flips, and a
 * gate that also blocked preparation would force the flip to come first.
 */
export async function sharesEnabledAction() {
  return { enabled: isReportSharesEnabled() }
}
