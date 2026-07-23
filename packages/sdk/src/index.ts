// Golden Beans Growth Engine — TS SDK.
// Story 1.2 (Roadmap/01-growth-engine/growth-engine-v1/sprint-1.md): `track` + `trackAdoption`,
// auto-appending the configured userId, returning an extensible envelope — never a bare boolean —
// so v2 fault injection (delay_ms, force_error_code) can extend TrackResult without a breaking
// change to callers that already just check `.ok`.

import { resolveGovernedVariant, resolveVariant, type BucketVariant } from './bucketing'

export type { BucketVariant } from './bucketing'

/**
 * event-destination-router · Story 1.1 — who caused an event vs. what it's about.
 *
 * `type` is a controlled vocabulary (lower_snake_case: "merchant", "shop", "campaign"); `id` is
 * opaque to Golden Beans — we index and echo it, never parse meaning from it. Keep it a stable
 * identifier from your own system, and DO NOT put personal data in it: it lands in an analytical
 * event store, and the epics downstream (lifecycle projections, experiment attribution) join on it
 * across every read surface including the MCP connector.
 */
export interface EventEntity {
  type: string
  id: string
}

/**
 * The versioned context envelope. Every field is optional EXCEPT `version` — omitting the version
 * is rejected rather than assumed, so a client written against a later contract can never be
 * silently served older semantics.
 */
export interface EventContext {
  /** Must be 1. Present so a v2 payload sent to a v1 server fails loudly instead of half-storing. */
  version: 1
  /** Who caused the event (a staff user, a system job, an integration). */
  actor?: EventEntity
  /** What the event is ABOUT — the join key for lifecycle projections and metric attribution. */
  subject?: EventEntity
  /** Ties several events emitted by one logical workflow together. */
  correlationId?: string
  /**
   * When the fact HAPPENED, ISO-8601 with an explicit offset (`2026-07-22T10:00:00Z`). Distinct
   * from when we received it. Set this for backfills and queued offline clients — past timestamps
   * are unbounded and order correctly; future ones are capped at 24h of clock skew.
   */
  occurredAt?: string
  /**
   * Caller-supplied dedupe token, unique within your project. Retrying a request with the same key
   * returns the ORIGINAL event id and creates nothing — safe to retry a send you never got an
   * answer for. Use a stable id from the source fact (an order id, a webhook delivery id), never a
   * fresh random per attempt, or every retry is a new event.
   */
  idempotencyKey?: string
}

export interface TrackEventProps {
  featureId?: string
  tags?: Record<string, unknown>
  metadata?: Record<string, unknown>
  /** Optional versioned actor/subject context (Story 1.1). Omit it and the legacy contract applies. */
  context?: EventContext
}

export type TrackResult =
  | { ok: true; id: string; /** True when an idempotencyKey matched an existing event — nothing was created. */ deduplicated?: boolean }
  | { ok: false; error: string; code?: string; issues?: unknown }

// Sprint 2, Story 2.1: a feature registry entry pushed from the client's own live
// flag rows (e.g. Miyagi's `platform_flags`). targetEvent/adoptedEvent/retainedEvent
// are optional — see Roadmap/01-growth-engine/growth-engine-v1/sprint-2.md.
export interface FeatureSyncEntry {
  key: string
  enabled: boolean
  targetEvent?: string
  adoptedEvent?: string
  retainedEvent?: string
  retentionDays?: number
  description?: string
}

export type SyncResult =
  | { ok: true; synced: number }
  | { ok: false; error: string; code?: string; issues?: unknown }

// Sprint 4, Story 4.1 (Roadmap/01-growth-engine/growth-engine-v1/sprint-4.md): deterministic
// client-side bucketing — same envelope shape as TrackResult/SyncResult (never a bare string), so
// v2 can extend it (e.g. a `reason` field) without a breaking change to callers.
export type BucketResult =
  | { ok: true; variant: string }
  | { ok: false; error: string; code?: string }

export interface ExperimentGovernanceContext {
  /** Immutable registry version used to interpret this local assignment. */
  definitionVersion: number
  /** Stable opaque subject used for both local hashing and later metric attribution. */
  assignmentEntity: EventEntity
}

export interface GrowthEngineClientConfig {
  /** e.g. "https://growth.example.com" or "http://localhost:3000" for local dev. */
  baseUrl: string
  /** The project's per-project API key (Bearer token) — see Roadmap 01-growth-engine's Story 1.1. */
  apiKey: string
  /** The acting user's id, auto-appended to every event this client sends. */
  userId: string
  /** Override for testing; defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

export interface GrowthEngineClient {
  track(event: string, props?: TrackEventProps): Promise<TrackResult>
  trackAdoption(featureKey: string, props?: Omit<TrackEventProps, 'featureId'>): Promise<TrackResult>
  syncFeatures(features: FeatureSyncEntry[]): Promise<SyncResult>
  /**
   * Deterministically resolves the configured userId into a variant for `experimentKey`, given
   * the caller's own variant list. Synchronous — no network call, no resolve endpoint (Story 4.1).
   */
  bucket(
    experimentKey: string,
    variants: BucketVariant[],
    governance?: ExperimentGovernanceContext,
  ): BucketResult
  /**
   * Fires an exposure event for a bucketed variant — the denominator for variant comparison
   * (Story 4.2). Thin wrapper around track(), same as trackAdoption(): 'experiment_exposed' with
   * `featureId` set to the experiment key and the variant carried in `tags.variant`.
   */
  trackExposure(
    experimentKey: string,
    variant: string,
    props?: Omit<TrackEventProps, 'featureId'>,
    governance?: ExperimentGovernanceContext,
  ): Promise<TrackResult>
}

/**
 * const growth = createGrowthEngineClient({ baseUrl, apiKey, userId })
 * await growth.track('signup')
 */
export function createGrowthEngineClient(config: GrowthEngineClientConfig): GrowthEngineClient {
  const fetchFn = config.fetchImpl ?? fetch

  async function track(event: string, props: TrackEventProps = {}): Promise<TrackResult> {
    let res: Response
    try {
      res = await fetchFn(`${config.baseUrl}/api/v1/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ userId: config.userId, event, ...props }),
      })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown network error', code: 'NETWORK_ERROR' }
    }

    const body = await res.json().catch(() => null) as {
      ok?: boolean
      error?: string
      issues?: unknown
      deduplicated?: boolean
      id: string
    } | null
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `HTTP ${res.status}`, code: String(res.status), issues: body?.issues }
    }
    // `deduplicated` rides along only when the server actually set it, so a caller that never uses
    // idempotency keys sees the exact same result object it saw before Story 1.1.
    return body.deduplicated ? { ok: true, id: body.id, deduplicated: true } : { ok: true, id: body.id }
  }

  async function syncFeatures(features: FeatureSyncEntry[]): Promise<SyncResult> {
    let res: Response
    try {
      res = await fetchFn(`${config.baseUrl}/api/v1/features/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ features }),
      })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown network error', code: 'NETWORK_ERROR' }
    }

    const body = await res.json().catch(() => null) as {
      ok?: boolean
      error?: string
      issues?: unknown
      synced: number
    } | null
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `HTTP ${res.status}`, code: String(res.status), issues: body?.issues }
    }
    return { ok: true, synced: body.synced }
  }

  function bucket(
    experimentKey: string,
    variants: BucketVariant[],
    governance?: ExperimentGovernanceContext,
  ): BucketResult {
    const governed = governance !== undefined
    if (governed && !validGovernance(governance)) return invalidGovernanceResult()
    const variant = governed
      ? resolveGovernedVariant(
          governance.assignmentEntity.type,
          governance.assignmentEntity.id,
          experimentKey,
          governance.definitionVersion,
          variants,
        )
      : resolveVariant(config.userId, experimentKey, variants)
    if (variant === null) {
      return { ok: false, error: 'No valid variants provided', code: 'INVALID_VARIANTS' }
    }
    return { ok: true, variant }
  }

  async function trackExposure(
    experimentKey: string,
    variant: string,
    props?: Omit<TrackEventProps, 'featureId'>,
    governance?: ExperimentGovernanceContext,
  ): Promise<TrackResult> {
    if (governance === undefined) {
      // Preserve the legacy request shape byte-for-byte: variant overrides a same-named caller tag,
      // no context is invented, and the path is the same thin track() wrapper as before governance.
      return track('experiment_exposed', {
        ...props,
        featureId: experimentKey,
        tags: { ...props?.tags, variant },
      })
    }
    if (!validGovernance(governance)) return invalidGovernanceResult()

    const suppliedVariant = props?.tags?.variant
    const suppliedVersion = props?.tags?.experiment_definition_version
    const suppliedSubject = props?.context?.subject
    if (
      (suppliedVariant !== undefined && suppliedVariant !== variant) ||
      (suppliedVersion !== undefined && suppliedVersion !== governance.definitionVersion) ||
      (props?.context !== undefined && props.context.version !== 1) ||
      (suppliedSubject !== undefined && !sameEntity(suppliedSubject, governance.assignmentEntity))
    ) {
      return {
        ok: false,
        error: 'Caller context conflicts with governed experiment assignment',
        code: 'GOVERNANCE_CONTEXT_CONFLICT',
      }
    }

    return track('experiment_exposed', {
      ...props,
      featureId: experimentKey,
      tags: {
        ...props?.tags,
        variant,
        experiment_definition_version: governance.definitionVersion,
      },
      context: {
        ...props?.context,
        version: 1,
        subject: governance.assignmentEntity,
      },
    })
  }

  return {
    track,
    trackAdoption: (featureKey, props) => track('feature_adopted', { ...props, featureId: featureKey }),
    syncFeatures,
    bucket,
    trackExposure,
  }
}

const ENTITY_TYPE = /^[a-z][a-z0-9_]{0,63}$/
const CONTROL_CHARS = /\p{Cc}/u

function validGovernance(value: unknown): value is ExperimentGovernanceContext {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<ExperimentGovernanceContext>
  const entity = candidate.assignmentEntity
  return (
    typeof candidate.definitionVersion === 'number' &&
    Number.isInteger(candidate.definitionVersion) &&
    candidate.definitionVersion >= 1 &&
    candidate.definitionVersion <= 2_147_483_647 &&
    entity !== undefined &&
    typeof entity.type === 'string' &&
    ENTITY_TYPE.test(entity.type) &&
    typeof entity.id === 'string' &&
    entity.id.length >= 1 &&
    entity.id.length <= 128 &&
    entity.id.trim() === entity.id &&
    !CONTROL_CHARS.test(entity.id)
  )
}

function invalidGovernanceResult(): { ok: false; error: string; code: string } {
  return {
    ok: false,
    error: 'Invalid experiment governance context',
    code: 'INVALID_GOVERNANCE_CONTEXT',
  }
}

function sameEntity(a: unknown, b: EventEntity): boolean {
  return (
    a !== null &&
    typeof a === 'object' &&
    (a as Partial<EventEntity>).type === b.type &&
    (a as Partial<EventEntity>).id === b.id
  )
}
