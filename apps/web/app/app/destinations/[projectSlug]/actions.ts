'use server'
import { revalidatePath } from 'next/cache'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import {
  createDestination,
  rotateSecret,
  setDestinationEnabled,
  getDeliverableDestination,
} from '@/lib/destinations'
import { deliverWebhook } from '@/lib/webhook-delivery'
import { serializeEnvelope, buildTestEnvelope } from '@/lib/delivery-payload'
import { replayDelivery } from '@/lib/deliveries'
import { checkRateLimit } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'

// event-destination-router · Sprint 2, Story 2.1 — destination lifecycle server actions.
//
// Every action re-checks OWNERSHIP server-side (requireProjectOwnership) — destination admin is
// credential-class (it mints a signing secret and points our servers at an outbound URL), so it is
// owner-only exactly like API-key admin, and an ordinary member gets a 404. The client is never
// trusted to have authorized; the mutation is scoped to the resolved project_id, so a member of one
// project cannot touch another's destinations by passing a foreign slug or destination id.
//
// Server Actions are a public HTTP surface and TS types are erased at runtime, so every argument is
// validated as a real string/bool before use (the same guard app/app/keys used — a forged request
// passing an object would otherwise throw an unhandled TypeError inside the lib).
function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`)
  return value
}

export async function createDestinationAction(
  slug: unknown,
  name: unknown,
  targetUrl: unknown,
  eventFilter: unknown,
) {
  const safeSlug = requireString(slug, 'project')
  const safeName = requireString(name ?? '', 'name')
  const safeUrl = requireString(targetUrl ?? '', 'url')
  const safeFilter = eventFilter == null ? null : requireString(eventFilter, 'event filter')

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const result = await createDestination(projectId, {
    name: safeName,
    targetUrl: safeUrl,
    eventFilter: safeFilter,
  })
  if (result.ok) {
    // The destination id + name are non-secret; the signing secret NEVER goes near an audit row.
    await recordAudit({
      action: 'destination_created',
      projectId,
      actorUserId: userId,
      metadata: { destinationId: result.id, name: safeName.trim() },
    })
  }
  revalidatePath(`/app/destinations/${safeSlug}`)
  return result
}

export async function rotateSecretAction(slug: unknown, destinationId: unknown) {
  const safeSlug = requireString(slug, 'project')
  const safeId = requireString(destinationId, 'destination id')

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const result = await rotateSecret(projectId, safeId)
  if (result.ok) {
    await recordAudit({
      action: 'destination_secret_rotated',
      projectId,
      actorUserId: userId,
      metadata: { destinationId: safeId },
    })
  }
  revalidatePath(`/app/destinations/${safeSlug}`)
  return result
}

export async function setEnabledAction(slug: unknown, destinationId: unknown, enabled: unknown) {
  const safeSlug = requireString(slug, 'project')
  const safeId = requireString(destinationId, 'destination id')
  if (typeof enabled !== 'boolean') throw new Error('Invalid enabled flag')

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const { ok } = await setDestinationEnabled(projectId, safeId, enabled)
  if (ok) {
    await recordAudit({
      action: enabled ? 'destination_enabled' : 'destination_disabled',
      projectId,
      actorUserId: userId,
      metadata: { destinationId: safeId },
    })
  }
  revalidatePath(`/app/destinations/${safeSlug}`)
  return { ok }
}

// "Send test" — an owner-initiated, single-shot signed delivery to a configured destination.
//
// DELIBERATELY NOT gated by DESTINATION_DELIVERY_ENABLED (the automatic-dispatcher kill switch).
// That flag exists to stop the AUTOMATIC fan-out of the tenant's real event stream; this is the
// opposite — the manual, one-at-a-time diagnostic an owner runs to gain confidence in their receiver
// BEFORE anyone flips the global flag. Gating it behind the flag would make the safe-rollout order in
// the epic's Deploy section impossible ("test against a disposable receiver … before enabling
// production delivery"): you could never test the receiver until you'd already turned real delivery
// on. The blast radius is bounded elsewhere — owner-only, rate-limited below, an SSRF-guarded
// public-https-only URL, and a synthetic `test:true` body that is not the tenant's data.
const TEST_SEND_MAX_PER_WINDOW = 10
const TEST_SEND_WINDOW_MS = 10 * 60 * 1000

export async function sendTestAction(slug: unknown, destinationId: unknown) {
  const safeSlug = requireString(slug, 'project')
  const safeId = requireString(destinationId, 'destination id')

  const { projectId, userId } = await requireProjectOwnership(safeSlug)

  // Rate-limit so send-test can't be used as an outbound-request amplifier. Scoped to the PROJECT
  // (not the destination) so adding destinations doesn't multiply the budget.
  const limited = await checkRateLimit(`destination-test:${projectId}`, {
    max: TEST_SEND_MAX_PER_WINDOW,
    windowMs: TEST_SEND_WINDOW_MS,
  })
  if (!limited.ok) return { ok: false as const, error: limited.error }

  const destination = await getDeliverableDestination(projectId, safeId)
  if (!destination) {
    return { ok: false as const, error: 'This destination has no webhook URL and secret yet.' }
  }

  const envelope = buildTestEnvelope()
  const body = serializeEnvelope(envelope)
  const result = await deliverWebhook(destination, body, { eventId: envelope.id })

  await recordAudit({
    action: 'destination_test_sent',
    projectId,
    actorUserId: userId,
    // The OUTCOME is the useful audit fact; no secret, no full body.
    metadata: { destinationId: safeId, disposition: result.disposition, status: result.status },
  })

  return {
    ok: result.disposition === 'delivered',
    disposition: result.disposition,
    status: result.status,
    latencyMs: result.latencyMs,
    error: result.error,
  }
}

// Story 2.2 — operator REPLAY of a settled delivery. Owner-only + project-scoped like the rest;
// replayDelivery() only re-queues a delivered/failed/dead row, so a double-click can't disturb a row
// that is already pending/in_flight. The dispatcher picks the re-queued row up on its next pass.
export async function replayDeliveryAction(slug: unknown, deliveryId: unknown) {
  const safeSlug = requireString(slug, 'project')
  const safeId = requireString(deliveryId, 'delivery id')

  const { projectId, userId } = await requireProjectOwnership(safeSlug)
  const result = await replayDelivery(projectId, safeId)
  if (result.ok) {
    await recordAudit({
      action: 'delivery_replayed',
      projectId,
      actorUserId: userId,
      metadata: { deliveryId: safeId, eventId: result.eventId },
    })
  }
  revalidatePath(`/app/destinations/${safeSlug}`)
  return result
}
