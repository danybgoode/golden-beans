// event-destination-router · Sprint 1, Story 1.1 — the versioned actor/subject context rules.
//
// DELIBERATELY ZERO-IMPORT (Roadmap/LEARNINGS.md: "a unit-tested pure helper can't live in the same
// file as code that imports a framework/runtime-only module", and the mutation-check rule that
// follows it). Every branch below is reachable from a spec by calling the function directly — an
// HTTP-level spec can only reach the ones a well-formed request happens to traverse, which is
// exactly how multi-tenant-activation S1 shipped four security specs that passed identically
// against a deliberately re-broken build.
//
// The contract this validates is versioned on purpose: `context.version` is a closed literal, so a
// v2 payload sent to a v1 server is REJECTED rather than silently half-stored. Dropping unknown
// fields would be the worse failure — the caller believes it sent a subject, the row has none, and
// every downstream projection reads an honest-looking zero (the failure mode LEARNINGS.md records
// three separate times in this repo).

/** The only context version this build understands. Bump deliberately; never widen to a range. */
export const CURRENT_CONTEXT_VERSION = 1

/** Opaque ids are echoed back and indexed, so they're bounded. Mirrors the CHECK constraint in
 *  20260722100000_event_subject_context.sql — if you change one, change both. */
export const MAX_ID_LENGTH = 128
export const MAX_TYPE_LENGTH = 64

/**
 * How far into the future a client may assert an event happened. Client clocks drift; a few hours
 * of skew is ordinary reality, not an attack. But an UNBOUNDED future timestamp is a real problem:
 * `occurred_at` orders lifecycle projections, so a row dated 2099 pins itself permanently at the
 * head of its subject's timeline and no later real event can ever displace it. Past timestamps are
 * deliberately NOT bounded — backfills and queued offline clients are first-class here, and
 * entity-journeys-projections is explicitly designed so late/out-of-order facts repair naturally.
 */
export const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000

/**
 * Entity types are a controlled VOCABULARY, not free text: downstream reads group and filter by
 * them, so `merchant`, `Merchant` and `merchant ` silently becoming three different cohorts is a
 * data-quality bug that surfaces months later as "the numbers don't add up".
 *
 * We reject rather than normalise. Lowercasing on the caller's behalf would make the write succeed
 * and leave the caller believing `Merchant` is a type they can query by — the mismatch would then
 * only appear at read time, far from its cause. A 400 teaches the integration immediately.
 */
const TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

/**
 * Ids are opaque — we never parse meaning out of them, so almost anything printable is legal. What
 * is NOT legal: control characters (they corrupt logs, CSV exports and terminal output downstream,
 * and are never meaningful in an identifier) and leading/trailing whitespace (` u1` and `u1` must
 * not become two subjects that look identical to a human reading a dashboard).
 */
// `\p{Cc}` is the full Unicode "Control" category — the C0 range (\x00–\x1F), DEL (\x7F) AND the C1
// range (\x80–\x9F), which the old `[\x00-\x1F\x7F]` missed. C1 controls survive a copy-paste out of
// some editors and corrupt terminal/CSV output downstream exactly like C0 does, so an opaque id we
// echo back to a dashboard has no business carrying them (cross-review, Agy 2026-07-22).
const CONTROL_CHARS = /\p{Cc}/u

export type ContextFieldError = { field: string; message: string }

export function isValidEntityType(value: unknown): value is string {
  return typeof value === 'string' && TYPE_PATTERN.test(value)
}

export function isValidOpaqueId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length < 1 || value.length > MAX_ID_LENGTH) return false
  if (CONTROL_CHARS.test(value)) return false
  return value.trim() === value
}

export type OccurredAtResult =
  | { ok: true; iso: string }
  | { ok: false; message: string }

/**
 * Validates a client-asserted timestamp and returns it normalised to a UTC ISO-8601 string.
 *
 * `now` is injected rather than read from the clock so the skew branch is testable without waiting
 * or mocking global time — the branch that rejects a far-future timestamp is the one most likely to
 * rot silently, and an untestable guard is one nobody notices has stopped working.
 */
export function normalizeOccurredAt(value: unknown, now: number = Date.now()): OccurredAtResult {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, message: 'occurredAt must be an ISO-8601 timestamp string' }
  }

  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return { ok: false, message: `occurredAt is not a parseable timestamp: ${truncate(value)}` }
  }

  // Date.parse accepts bare dates ("2026-07-22") and other loose forms, resolving them against UTC
  // or local time depending on shape. Requiring an explicit time component AND an explicit zone
  // removes that ambiguity — "2026-07-22" could mean any of 24+ instants depending on who parses
  // it, and a lifecycle projection that orders by it deserves better than a coin flip.
  const shape = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?([Zz]|[+-]\d{2}:?\d{2})$/.exec(value)
  if (!shape) {
    return {
      ok: false,
      message: 'occurredAt must include a time and an explicit UTC offset (e.g. 2026-07-22T10:00:00Z)',
    }
  }

  // Date.parse SILENTLY ROLLS OVER an out-of-range calendar date: "2026-02-30T…" becomes March 2,
  // storing a different instant than the caller supplied (cross-review, Codex round 2). Validate the
  // calendar fields against reality — the day-of-month bound depends on the month and leap year, and
  // this check is offset-independent because "is 2026-02-30 a real date" doesn't depend on the zone.
  const [, y, mo, d, h, mi, s] = shape
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (
    month < 1 || month > 12 ||
    day < 1 || day > daysInMonth[month - 1] ||
    Number(h) > 23 || Number(mi) > 59 || (s !== undefined && Number(s) > 59)
  ) {
    return { ok: false, message: `occurredAt is not a real calendar date/time: ${truncate(value)}` }
  }

  if (parsed > now + MAX_FUTURE_SKEW_MS) {
    return { ok: false, message: 'occurredAt is too far in the future (max 24h of clock skew)' }
  }

  return { ok: true, iso: new Date(parsed).toISOString() }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export type EventContextInput = {
  version?: unknown
  actor?: unknown
  subject?: unknown
  correlationId?: unknown
  occurredAt?: unknown
  idempotencyKey?: unknown
}

/** The complete set of keys a v1 context may carry. Anything else is a caller mistake we REFUSE —
 *  see the unknown-key check in normalizeEventContext for why silence would be the worse failure. */
const KNOWN_CONTEXT_KEYS = new Set([
  'version',
  'actor',
  'subject',
  'correlationId',
  'occurredAt',
  'idempotencyKey',
])

/** The persisted shape — exactly the columns the migration added, snake_cased at the boundary. */
export type NormalizedEventContext = {
  context_version: number
  actor_type: string | null
  actor_id: string | null
  subject_type: string | null
  subject_id: string | null
  correlation_id: string | null
  occurred_at: string | null
  idempotency_key: string | null
}

export type ContextResult =
  | { ok: true; context: NormalizedEventContext }
  | { ok: false; errors: ContextFieldError[] }

/** A legacy payload's persisted context: all NULL, version NULL. Absence stays a fact. */
export const LEGACY_EVENT_CONTEXT = {
  context_version: null,
  actor_type: null,
  actor_id: null,
  subject_type: null,
  subject_id: null,
  correlation_id: null,
  occurred_at: null,
  idempotency_key: null,
} as const

/**
 * Validates and normalises a `context` object into persistable columns.
 *
 * Collects ALL field errors rather than failing on the first one: an integration wiring this up for
 * the first time typically gets two or three fields wrong at once, and a validator that reveals one
 * per round-trip turns a five-minute fix into a five-deploy afternoon.
 */
export function normalizeEventContext(
  input: EventContextInput,
  now: number = Date.now(),
): ContextResult {
  const errors: ContextFieldError[] = []

  // The route only calls this when zod already proved `context` is an object, but this function is
  // exported and unit-tested directly — a caller handing it `null`, an array or a primitive must get
  // a clean rejection, not a `TypeError` from Object.keys(null) (cross-review, Agy round 2).
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: [{ field: 'context', message: 'context must be an object' }] }
  }

  // Unknown top-level keys are REFUSED, not ignored. This module's whole reason for existing is that
  // silently dropping a field the caller believes it sent is the worst failure mode — the caller
  // gets a 201, the column is NULL, and every downstream projection reads an honest-looking zero.
  // The most likely mistake is a snake_case spelling of a real field (`idempotency_key`,
  // `subject_id`, `occurred_at`): accepting the request while storing none of it would strand a
  // real integration for exactly as long as it takes someone to notice the numbers are wrong
  // (cross-review, Agy 2026-07-22). A 400 naming the stray key teaches it immediately.
  for (const key of Object.keys(input)) {
    if (!KNOWN_CONTEXT_KEYS.has(key)) {
      errors.push({
        field: `context.${key}`,
        message: `unknown context field "${key}" — did you mean a camelCase form (correlationId, occurredAt, idempotencyKey)?`,
      })
    }
  }

  // Version first and strictly. An absent version is NOT "assume v1" — a caller that omits it has
  // not agreed to any contract, and guessing on their behalf is how a v2 client silently gets
  // v1 semantics.
  if (input.version !== CURRENT_CONTEXT_VERSION) {
    errors.push({
      field: 'context.version',
      message:
        input.version === undefined
          ? `context.version is required and must be ${CURRENT_CONTEXT_VERSION}`
          : `unsupported context.version ${JSON.stringify(input.version)} — this build understands ${CURRENT_CONTEXT_VERSION}`,
    })
    // Return immediately: with an unknown version we cannot know what the other fields MEAN, so
    // validating them against v1 rules would produce confidently wrong error messages.
    return { ok: false, errors }
  }

  const actor = readEntity(input.actor, 'context.actor', errors)
  const subject = readEntity(input.subject, 'context.subject', errors)

  let correlationId: string | null = null
  if (input.correlationId !== undefined && input.correlationId !== null) {
    if (isValidOpaqueId(input.correlationId)) {
      correlationId = input.correlationId
    } else {
      errors.push({
        field: 'context.correlationId',
        message: `must be a 1-${MAX_ID_LENGTH} character opaque id with no control characters or surrounding whitespace`,
      })
    }
  }

  let idempotencyKey: string | null = null
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
    if (isValidOpaqueId(input.idempotencyKey)) {
      idempotencyKey = input.idempotencyKey
    } else {
      errors.push({
        field: 'context.idempotencyKey',
        message: `must be a 1-${MAX_ID_LENGTH} character opaque id with no control characters or surrounding whitespace`,
      })
    }
  }

  let occurredAt: string | null = null
  if (input.occurredAt !== undefined && input.occurredAt !== null) {
    const result = normalizeOccurredAt(input.occurredAt, now)
    if (result.ok) {
      occurredAt = result.iso
    } else {
      errors.push({ field: 'context.occurredAt', message: result.message })
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    context: {
      context_version: CURRENT_CONTEXT_VERSION,
      actor_type: actor?.type ?? null,
      actor_id: actor?.id ?? null,
      subject_type: subject?.type ?? null,
      subject_id: subject?.id ?? null,
      correlation_id: correlationId,
      occurred_at: occurredAt,
      idempotency_key: idempotencyKey,
    },
  }
}

type Entity = { type: string; id: string }

/**
 * Reads an `{ type, id }` pair. Both-or-neither is enforced here AND by a CHECK constraint in the
 * migration — a half-populated entity (`subject_type` set, `subject_id` null) is unqueryable by
 * construction, so it's better refused than stored.
 */
function readEntity(value: unknown, field: string, errors: ContextFieldError[]): Entity | null {
  if (value === undefined || value === null) return null

  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push({ field, message: 'must be an object with a `type` and an `id`' })
    return null
  }

  const { type, id } = value as { type?: unknown; id?: unknown }

  // The same strict-key policy the top-level context applies (cross-review, Agy round 3): an actor or
  // subject carrying an unexpected property (`{ type, id, name: '…' }`) is a caller mistake — they
  // believe they attached `name` and it silently vanishes. Refuse it here too, so the whole context
  // enforces one rule rather than being strict at the top and lax one level down.
  let valid = true
  for (const key of Object.keys(value)) {
    if (key !== 'type' && key !== 'id') {
      errors.push({ field: `${field}.${key}`, message: `unknown field "${key}" — an entity has only \`type\` and \`id\`` })
      valid = false
    }
  }

  if (!isValidEntityType(type)) {
    errors.push({
      field: `${field}.type`,
      message: `must be lower_snake_case, 1-${MAX_TYPE_LENGTH} characters, starting with a letter (e.g. "merchant")`,
    })
    valid = false
  }
  if (!isValidOpaqueId(id)) {
    errors.push({
      field: `${field}.id`,
      message: `must be a 1-${MAX_ID_LENGTH} character opaque id with no control characters or surrounding whitespace`,
    })
    valid = false
  }

  return valid ? { type: type as string, id: id as string } : null
}

function truncate(value: string): string {
  return value.length > 40 ? `${value.slice(0, 40)}…` : value
}
