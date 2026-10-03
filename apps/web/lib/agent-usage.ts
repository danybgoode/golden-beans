// finops · Sprint 3, Story 3.1 — the `$agent_usage` event: what one agent session spent on one epic.
//
// ZERO-IMPORT on purpose (see lib/signal-events.ts's header): the e2e specs import this module to pin the payload
// contract, and a framework import here would fail the whole suite at collection time.
//
// ── What rides /v1/track, and why nothing else is needed (AGENTS rule #1) ─────────────────────────
// The kit's `epic-actuals.mjs --push` sends ONE event per (session, epic): a CUMULATIVE snapshot of that session's
// usage on that epic, in `metadata`. No new route, table or migration — the event lands in `events` through the
// ordinary ingest path, project resolved from the hashed API key (finops D23), and nothing in the body names a
// project.
//
// ── "A re-push replaces" is a READ rule (finops D22) ─────────────────────────────────────────────
// /track's idempotency never replaces: the same key with the same payload is a 200 dedup, with a different payload a
// 409, and events are append-only. A session keeps growing after its first push, so each push is a new snapshot
// keyed `agent_usage:<session>:<epic>:<last_at>` (an unchanged re-push dedups), and every reader takes the LATEST
// `last_at` per (session, epic) — `latestSnapshots` below. Summing every row would count a session once per push.
//
// ── Metrics only, ever (finops D9) ───────────────────────────────────────────────────────────────
// The payload is a closed shape: exactly AGENT_USAGE_KEYS, every value a count, an id, a model, a skill, a branch or a
// timestamp. An unknown key — say a `prompt` — is refused at ingest (400), so content cannot be stored by accident.

/** Reserved (the `$` namespace is the engine's); listed beside `$error` in lib/signal-events.ts's header. */
export const AGENT_USAGE_EVENT = '$agent_usage'

/** The exact top-level key set of an `$agent_usage` payload (finops 3.1 acceptance; D9). */
export const AGENT_USAGE_KEYS = [
  'session_id',
  'epic',
  'branch',
  'model_breakdown',
  'skill_breakdown',
  'tokens_by_kind',
  'usd_estimate',
  'price_table_date',
  'first_at',
  'last_at',
] as const

/** The token kinds, in the order every surface prints them (the kit's lib/model-prices.mjs TOKEN_KINDS). */
export const TOKEN_KINDS = ['input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h'] as const
export type TokenKind = (typeof TOKEN_KINDS)[number]
export type Tokens = Record<TokenKind, number>

/** One model's or one skill's share: its tokens, and its ≈ API $ — null when it could not be priced (D4). */
export type UsagePart = { tokens: Tokens; usd: number | null }

export type AgentUsage = {
  session_id: string
  epic: string
  branch: string
  model_breakdown: Record<string, UsagePart>
  skill_breakdown: Record<string, UsagePart>
  tokens_by_kind: Tokens
  /** The sum of the priced parts — a LOWER BOUND when any model's `usd` is null (`usdIsLowerBound`). */
  usd_estimate: number
  price_table_date: string
  first_at: string
  last_at: string
}

export const MAX_BREAKDOWN_ENTRIES = 50
const MAX_TOKENS = 1e13 // far above any session; guards against a nonsense number poisoning a sum
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/
const NAME_RE = /^[^\u0000-\u001f\u007f]{1,120}$/
// Exactly milliseconds: every timestamp then has one length, so comparing the strings compares the times (the kit
// copies Claude Code's own `…T10:00:00.000Z`). A mixed precision would sort `…00Z` after `…00.500Z`.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function readTokens(v: unknown, field: string, errors: string[]): Tokens | null {
  if (!isRecord(v)) {
    errors.push(`${field} must be an object of token counts`)
    return null
  }
  const extra = Object.keys(v).filter((k) => !(TOKEN_KINDS as readonly string[]).includes(k))
  if (extra.length) errors.push(`${field} has unknown key(s): ${extra.join(', ')}`)
  const out = {} as Tokens
  for (const k of TOKEN_KINDS) {
    const n = v[k]
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_TOKENS) {
      errors.push(`${field}.${k} must be a whole number >= 0`)
      return null
    }
    out[k] = n
  }
  return out
}

function readUsd(v: unknown, field: string, errors: string[], nullable: boolean): number | null {
  if (v === null && nullable) return null
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e9) {
    errors.push(`${field} must be a number >= 0${nullable ? ' or null' : ''}`)
    return null
  }
  return v
}

function readBreakdown(v: unknown, field: string, errors: string[]): Record<string, UsagePart> | null {
  if (!isRecord(v)) {
    errors.push(`${field} must be an object`)
    return null
  }
  const entries = Object.entries(v)
  if (entries.length > MAX_BREAKDOWN_ENTRIES) {
    errors.push(`${field} has more than ${MAX_BREAKDOWN_ENTRIES} entries`)
    return null
  }
  const out: Record<string, UsagePart> = Object.create(null)
  for (const [name, part] of entries) {
    // `__proto__` would set the PROTOTYPE of `out` rather than an entry; the other two shadow Object machinery a reader
    // may touch. No model, skill or branch is ever called any of them, so they are refused rather than escaped.
    if (!NAME_RE.test(name) || name === '__proto__' || name === 'constructor' || name === 'prototype') {
      errors.push(`${field} has an invalid name`)
      return null
    }
    if (!isRecord(part)) {
      errors.push(`${field}["${name}"] must be { tokens, usd }`)
      return null
    }
    const extra = Object.keys(part).filter((k) => k !== 'tokens' && k !== 'usd')
    if (extra.length) errors.push(`${field}["${name}"] has unknown key(s): ${extra.join(', ')}`)
    const tokens = readTokens(part.tokens, `${field}["${name}"].tokens`, errors)
    const usd = readUsd(part.usd, `${field}["${name}"].usd`, errors, true)
    if (!tokens) return null
    out[name] = { tokens, usd }
  }
  return out
}

/**
 * The ingest scrub (finops 3.1): an `$agent_usage` event's metadata must be EXACTLY this shape. Anything else is a
 * 400, so no content field can be stored by accident, and a reader can trust every row it reads back.
 */
export function parseAgentUsage(
  metadata: unknown
): { ok: true; value: AgentUsage } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(metadata)) return { ok: false, errors: ['metadata must be an object'] }
  const unknown = Object.keys(metadata).filter((k) => !(AGENT_USAGE_KEYS as readonly string[]).includes(k))
  if (unknown.length) errors.push(`unknown key(s) — $agent_usage carries metrics only: ${unknown.join(', ')}`)
  const missing = AGENT_USAGE_KEYS.filter((k) => !(k in metadata))
  if (missing.length) errors.push(`missing key(s): ${missing.join(', ')}`)
  if (errors.length) return { ok: false, errors }

  const m = metadata as Record<string, unknown>
  const str = (k: string, re: RegExp, what: string) => {
    const v = m[k]
    if (typeof v !== 'string' || !re.test(v)) errors.push(`${k} must be ${what}`)
    return v as string
  }
  const session_id = str('session_id', /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/, 'an opaque id (<= 128 chars)')
  const epic = str('epic', SLUG_RE, 'an epic slug')
  const branch = str('branch', NAME_RE, 'a branch name (<= 120 chars)')
  const price_table_date = str('price_table_date', DATE_RE, 'a YYYY-MM-DD date')
  const first_at = str('first_at', ISO_RE, 'an ISO-8601 UTC timestamp with milliseconds')
  const last_at = str('last_at', ISO_RE, 'an ISO-8601 UTC timestamp with milliseconds')
  const model_breakdown = readBreakdown(m.model_breakdown, 'model_breakdown', errors)
  const skill_breakdown = readBreakdown(m.skill_breakdown, 'skill_breakdown', errors)
  const tokens_by_kind = readTokens(m.tokens_by_kind, 'tokens_by_kind', errors)
  const usd_estimate = readUsd(m.usd_estimate, 'usd_estimate', errors, false)
  if (!errors.length && first_at > last_at) errors.push('first_at is after last_at')
  if (errors.length || !model_breakdown || !skill_breakdown || !tokens_by_kind || usd_estimate === null)
    return { ok: false, errors }
  return {
    ok: true,
    value: {
      session_id,
      epic,
      branch,
      model_breakdown,
      skill_breakdown,
      tokens_by_kind,
      usd_estimate,
      price_table_date,
      first_at,
      last_at,
    },
  }
}

/**
 * The REST of the envelope (fresh review, #232 — D9 means nothing but metrics is stored, not only in `metadata`):
 * `userId` names the agent (`agent:<name>`), no `featureId`, no tags, and `context` carries only `version`,
 * `idempotencyKey` and `occurredAt` — no actor, subject or correlation id. Returns the problems, [] when clean.
 */
export const AGENT_USAGE_USER_RE = /^agent:[a-z0-9][a-z0-9-]{0,39}$/
const ALLOWED_CONTEXT_KEYS = ['version', 'idempotencyKey', 'occurredAt']
export function agentUsageEnvelopeErrors(e: {
  userId: unknown
  featureId?: unknown
  tags?: Record<string, unknown>
  context?: Record<string, unknown>
}): string[] {
  const errors: string[] = []
  if (typeof e.userId !== 'string' || !AGENT_USAGE_USER_RE.test(e.userId))
    errors.push('userId must name the agent, like agent:claude-code')
  if (e.featureId !== undefined) errors.push('featureId is not part of $agent_usage')
  if (e.tags && Object.keys(e.tags).length) errors.push('tags must be empty — usage rides metadata')
  const extra = Object.keys(e.context ?? {}).filter((k) => !ALLOWED_CONTEXT_KEYS.includes(k))
  if (extra.length)
    errors.push(`context may carry only ${ALLOWED_CONTEXT_KEYS.join(', ')} (got ${extra.join(', ')})`)
  return errors
}

/** The idempotency key the kit sends: an unchanged snapshot re-pushes as a dedup, a grown one is a new event. */
export function agentUsageIdempotencyKey(u: Pick<AgentUsage, 'session_id' | 'epic' | 'last_at'>): string {
  return `agent_usage:${u.session_id}:${u.epic}:${u.last_at}`
}

/** True when some model could not be priced — the $ is then a lower bound, said as `≥`, never a zero (D4). */
export function usdIsLowerBound(u: Pick<AgentUsage, 'model_breakdown'>): boolean {
  return Object.values(u.model_breakdown).some((p) => p.usd === null)
}

/**
 * finops D22 — the latest snapshot per (session, epic). Rows that fail the schema are dropped (they could only exist
 * from before the scrub, and a reader must never trust them); ties on `last_at` keep the first seen.
 */
export function latestSnapshots(metadatas: readonly unknown[]): AgentUsage[] {
  const latest = new Map<string, AgentUsage>()
  for (const raw of metadatas) {
    const p = parseAgentUsage(raw)
    if (!p.ok) continue
    const key = `${p.value.session_id}\u0000${p.value.epic}`
    const prev = latest.get(key)
    if (!prev || p.value.last_at > prev.last_at) latest.set(key, p.value)
  }
  return [...latest.values()]
}

export type UsageTotal = { usd: number; usdLowerBound: boolean; tokens: number; sessions: number }
export type UsageRollup = {
  total: UsageTotal
  byEpic: Record<string, UsageTotal>
  bySkill: Record<string, UsageTotal>
  byModel: Record<string, UsageTotal>
  lastAt: string | null
}

const sumTokens = (t: Tokens) => TOKEN_KINDS.reduce((a, k) => a + t[k], 0)
const emptyTotal = (): UsageTotal & { _s: Set<string> } => ({
  usd: 0,
  usdLowerBound: false,
  tokens: 0,
  sessions: 0,
  _s: new Set(),
})

/** The page's numbers: totals per epic, skill and model over the latest snapshots. Sessions are distinct per bucket. */
export function rollUp(snapshots: readonly AgentUsage[]): UsageRollup {
  type Acc = ReturnType<typeof emptyTotal>
  const total = emptyTotal()
  const byEpic = new Map<string, Acc>()
  const bySkill = new Map<string, Acc>()
  const byModel = new Map<string, Acc>()
  const into = (map: Map<string, Acc>, k: string) => {
    if (!map.has(k)) map.set(k, emptyTotal())
    return map.get(k) as Acc
  }
  const add = (acc: Acc, usd: number | null, tokens: number, session: string) => {
    if (usd === null) acc.usdLowerBound = true
    else acc.usd += usd
    acc.tokens += tokens
    acc._s.add(session)
  }
  let lastAt: string | null = null
  for (const s of snapshots) {
    const lower = usdIsLowerBound(s)
    add(total, s.usd_estimate, sumTokens(s.tokens_by_kind), s.session_id)
    if (lower) total.usdLowerBound = true
    const e = into(byEpic, s.epic)
    add(e, s.usd_estimate, sumTokens(s.tokens_by_kind), s.session_id)
    if (lower) e.usdLowerBound = true
    for (const [skill, part] of Object.entries(s.skill_breakdown))
      add(into(bySkill, skill), part.usd, sumTokens(part.tokens), s.session_id)
    for (const [model, part] of Object.entries(s.model_breakdown))
      add(into(byModel, model), part.usd, sumTokens(part.tokens), s.session_id)
    if (!lastAt || s.last_at > lastAt) lastAt = s.last_at
  }
  const done = ({ _s, ...t }: Acc): UsageTotal => ({
    ...t,
    usd: Math.round(t.usd * 100) / 100,
    sessions: _s.size,
  })
  const obj = (m: Map<string, Acc>) => Object.fromEntries([...m].map(([k, v]) => [k, done(v)]))
  return { total: done(total), byEpic: obj(byEpic), bySkill: obj(bySkill), byModel: obj(byModel), lastAt }
}
