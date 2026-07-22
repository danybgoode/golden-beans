import 'server-only'
import { randomBytes } from 'node:crypto'
import { getSupabaseServiceClient } from './supabase'
import { assertDeliverableUrl } from './webhook-url'

export { assertDeliverableUrl } from './webhook-url'
export type { UrlCheck } from './webhook-url'

// event-destination-router · Sprint 2, Story 2.1 — the destination LIFECYCLE. Story 1.2 created a
// minimal event_destinations table (an outbox fan-out target); the 20260723100000 migration made it
// a real signed webhook (target_url + signing_secret + secret_set_at). This module owns creating,
// listing, rotating, enabling and disabling those destinations.
//
// SECRET DISCIPLINE — the reason this file mirrors lib/api-keys.ts rather than reinventing it:
//   • The signing secret is generated HERE and returned as plaintext EXACTLY ONCE (create + rotate).
//   • No READ path in this module ever selects signing_secret. listDestinations() and the row type it
//     returns deliberately cannot carry it — a column you cannot name is a column you cannot leak.
//   • Exactly ONE function reads the secret back — getDeliverableDestination(), the internal send
//     path (test-send in this story, the dispatcher in Story 2.2). It is not exported to any UI/read
//     surface and returns the secret only alongside the target_url that needs it.
// Unlike an API key (where we store only a HASH and verify inbound), a webhook secret is SHARED: we
// must retain the real value to SIGN outbound with it (see the migration's column comment). That is
// why "shown once, never returned" is enforced by query shape here rather than by hashing.

const SECRET_PREFIX = 'whsec_'

// `whsec_` + 32 random bytes (base64url ≈ 43 chars) ≈ 49 chars — inside the DB's [16,128] bound
// (event_destinations_signing_secret_shape) with margin. The `whsec_` prefix is the same
// self-describing convention as gb_key_ (lib/api-keys.ts) and Stripe's whsec_, so a leaked secret is
// recognisable in a log and a receiver's config.
export function generateSigningSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(32).toString('base64url')}`
}

// The SAFE, read-surface shape of a destination: everything a management UI needs, and NOTHING that
// signs a request. secretSetAt lets the UI show "rotated 3 days ago" without ever exposing the value.
export type DestinationRow = {
  id: string
  name: string
  enabled: boolean
  eventFilter: string | null
  targetUrl: string | null
  secretSetAt: string | null
  createdAt: string
  updatedAt: string
}

// The internal send shape — target + secret together, read ONLY by the outbound path. Kept as a
// separate type from DestinationRow so a refactor can't accidentally hand the secret to a read
// surface: the two shapes are structurally distinct and the secret-bearing one is never returned by
// a list/get-for-display function.
export type DeliverableDestination = {
  id: string
  name: string
  targetUrl: string
  signingSecret: string
}

// ── reads ───────────────────────────────────────────────────────────────────────────────────────
// Throws on a query failure rather than returning [] — the same reasoning as listProjectKeys: an
// empty list renders as "no destinations", which during an outage would invite creating a duplicate
// or assuming a leaked one is gone. A thrown error surfaces the real outage (cross-review pattern,
// Codex 2026-07-20). NOTE the explicit column list: signing_secret is NOT among them.
export async function listDestinations(projectId: string): Promise<DestinationRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('event_destinations')
    .select('id, name, enabled, event_filter, target_url, secret_set_at, created_at, updated_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[destinations] list failed:', error)
    throw new Error('Could not load destinations')
  }
  return (data ?? []).map(toDestinationRow)
}

function toDestinationRow(r: Record<string, unknown>): DestinationRow {
  return {
    id: r.id as string,
    name: r.name as string,
    enabled: Boolean(r.enabled),
    eventFilter: (r.event_filter as string | null) ?? null,
    targetUrl: (r.target_url as string | null) ?? null,
    secretSetAt: (r.secret_set_at as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export type CreateDestinationInput = {
  name: string
  targetUrl: string
  eventFilter?: string | null
}

export type CreateDestinationResult =
  | { ok: true; id: string; signingSecret: string }
  | { ok: false; error: string }

// Creates a destination BORN DISABLED (the table default) with its target and a freshly-minted
// signing secret, and returns the plaintext secret ONCE. Born disabled is deliberate and matches the
// outbox migration's `enabled DEFAULT false`: a destination that started delivering the instant it
// was created is one nobody can safely create. The owner tests it (send-test), THEN enables it.
//
// Callers must have already authorized the acting user as OWNER of `projectId` (the server action
// does, via requireProjectOwnership) — this function trusts the project_id it is handed and scopes
// every write to it.
export async function createDestination(
  projectId: string,
  input: CreateDestinationInput,
): Promise<CreateDestinationResult> {
  // Defensive `?? ''` so the library is safe even if a caller reaches it without the action's string
  // validation (cross-review, Antigravity round 3) — a null/undefined here would otherwise TypeError.
  const name = (input.name ?? '').trim()
  if (!name || name.length > 128) return { ok: false, error: 'Name must be 1–128 characters.' }

  const rawUrl = (input.targetUrl ?? '').trim()
  const urlCheck = assertDeliverableUrl(rawUrl)
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error }

  // NORMALIZE before storing (cross-review, Codex round 4): `new URL()` accepts a case-insensitive
  // scheme (`HTTPS://…`), but the DB CHECK only matches lowercase `https://`, so storing the raw
  // string would pass app validation and then fail generically at insert. `.toString()` lowercases
  // scheme + host, so the stored value always satisfies the constraint.
  const targetUrl = new URL(rawUrl).toString()

  const eventFilter = normalizeFilter(input.eventFilter)
  if (eventFilter && eventFilter.length > 256) return { ok: false, error: 'Event filter is too long.' }

  const supabase = getSupabaseServiceClient()
  const signingSecret = generateSigningSecret()
  const { data, error } = await supabase
    .from('event_destinations')
    .insert({
      project_id: projectId,
      name,
      target_url: targetUrl,
      signing_secret: signingSecret,
      secret_set_at: new Date().toISOString(),
      event_filter: eventFilter,
      // enabled omitted → DB default false. Born dark.
    })
    .select('id')
    .single()

  if (error || !data) {
    // A duplicate name within the project is the one user-correctable failure worth naming
    // (event_destinations_project_name_uniq). Everything else is an opaque server error.
    if (error?.code === '23505') return { ok: false, error: 'A destination with that name already exists.' }
    // The per-project cap (enforce_destination_cap trigger) — also user-correctable: delete one first.
    if (error?.message?.includes('destination cap reached')) {
      return { ok: false, error: 'This project has reached its destination limit (20).' }
    }
    console.error('[destinations] create failed:', error)
    return { ok: false, error: 'Could not create destination.' }
  }
  return { ok: true, id: data.id as string, signingSecret }
}

// NULL filter = every event of the project (the outbox fan-out semantics). An empty/whitespace
// string collapses to NULL rather than being stored as "" — "" would match no event name and
// silently deliver nothing, the miserable under-delivery ticket the migration warns about.
function normalizeFilter(filter: string | null | undefined): string | null {
  if (filter == null) return null
  const trimmed = filter.trim()
  return trimmed.length === 0 ? null : trimmed
}

// Rotates the signing secret, returning the new plaintext ONCE. The write is scoped by BOTH id and
// project_id — the property that stops a member of one project rotating another's secret by guessing
// an id (same control as revokeApiKey). Returns ok:false if no row matched (unknown/foreign id).
//
// Rotation invalidates the old secret the instant this commits: the next signed request uses the new
// secret, and neither value is ever exposed by a read path. A receiver must be updated to the new
// secret out-of-band (it was shown the plaintext here) — deliveries signed with the old secret will
// fail the receiver's verification, which is the intended "old secret no longer trusted" behaviour.
//
// ROTATION WINDOW (cross-review, Codex round 4), stated rather than glossed: between this commit and
// the receiver being updated, deliveries are signed with the NEW secret but verified against the OLD
// one, so an enabled destination returns 401 and those deliveries dead-letter. This is RECOVERABLE —
// the operator updates the receiver, then REPLAYS the dead-lettered deliveries (same logical event
// id, so the receiver dedupes). A zero-window rotation (sign with both the new and a briefly-retained
// previous secret — the multi-signature scheme our header already supports) is a documented
// follow-up; for now, rotate when the receiver can be updated promptly, or disable-rotate-enable.
export async function rotateSecret(
  projectId: string,
  destinationId: string,
): Promise<{ ok: true; signingSecret: string } | { ok: false; error: string }> {
  const supabase = getSupabaseServiceClient()
  const signingSecret = generateSigningSecret()
  const { data, error } = await supabase
    .from('event_destinations')
    .update({
      signing_secret: signingSecret,
      secret_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', destinationId)
    .eq('project_id', projectId)
    .select('id')
  if (error) {
    console.error('[destinations] rotate failed:', error)
    return { ok: false, error: 'Could not rotate secret.' }
  }
  if (!data || data.length === 0) return { ok: false, error: 'Destination not found.' }
  return { ok: true, signingSecret }
}

// Enables or disables a destination — the per-destination kill switch (outbox migration). Scoped by
// project_id like every mutation here. Disabling stops NEW fan-out work being queued (the fan-out in
// ingest_event() consults `enabled`) and stops the dispatcher sending; it PRESERVES delivery history
// (unlike a row delete), which is why disable — not delete — is the operational kill.
export async function setDestinationEnabled(
  projectId: string,
  destinationId: string,
  enabled: boolean,
): Promise<{ ok: boolean }> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('event_destinations')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', destinationId)
    .eq('project_id', projectId)
    .select('id')
  if (error) {
    console.error('[destinations] setEnabled failed:', error)
    return { ok: false }
  }
  return { ok: (data ?? []).length > 0 }
}

// The ONLY function that reads a signing secret back — the internal outbound path (test-send here,
// the dispatcher in Story 2.2). Scoped by project_id AND id: a delivery worker never learns a secret
// for a destination outside the project it is dispatching for.
//
// THREE outcomes, deliberately distinct (cross-review, Codex round 8): a DB read ERROR must not be
// reported as "not configured" — that would tell an owner to (re)add a URL that is already there,
// during what is really an outage. 'ok' → deliverable; 'not_deliverable' → genuinely missing url or
// secret; 'error' → the read itself failed.
export type DeliverableLookup =
  | { status: 'ok'; destination: DeliverableDestination }
  | { status: 'not_deliverable' }
  | { status: 'error' }

export async function getDeliverableDestination(
  projectId: string,
  destinationId: string,
): Promise<DeliverableLookup> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('event_destinations')
    .select('id, name, target_url, signing_secret')
    .eq('id', destinationId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) {
    console.error('[destinations] getDeliverable failed:', error)
    return { status: 'error' }
  }
  if (!data || !data.target_url || !data.signing_secret) return { status: 'not_deliverable' }
  return {
    status: 'ok',
    destination: {
      id: data.id as string,
      name: data.name as string,
      targetUrl: data.target_url as string,
      signingSecret: data.signing_secret as string,
    },
  }
}
