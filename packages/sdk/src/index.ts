// Golden Beans Growth Engine — TS SDK.
// Story 1.2 (Roadmap/01-growth-engine/growth-engine-v1/sprint-1.md): `track` + `trackAdoption`,
// auto-appending the configured userId, returning an extensible envelope — never a bare boolean —
// so v2 fault injection (delay_ms, force_error_code) can extend TrackResult without a breaking
// change to callers that already just check `.ok`.

// Relative imports here stay EXTENSIONLESS, matching the rest of the source tree. .github/
// workflows/ci.yml records why: enabling `allowImportingTsExtensions` so source could use `.ts`
// would also let app code do it, "trading a caught type error for an uncaught build break". Only
// *.test.ts opts into the looser rule.
//
// That means this file cannot be loaded by `npm run test:unit` (Node's native TS loader demands
// extensions), so the pure, directly-testable half of error capture lives in ./capture instead —
// see that module's header. This file keeps only the parts that genuinely need the client's config
// and `fetch`, which the e2e suite covers end to end.
import { resolveGovernedVariant, resolveVariant, type BucketVariant } from './bucketing'
import { normalizeError, normalizeSampleRate, ERROR_EVENT } from './capture'
import {
  FLAG_EVALUATED_EVENT,
  flagEvaluationFingerprint,
  normalizeFlagEvaluationSampleRate,
  shouldSampleFlagEvaluation,
  validateFlagEvaluationTelemetry,
  type FlagEvaluationTelemetryInput,
} from './flag-telemetry'
import { scrubClientText, SDK_MAX_MESSAGE, SDK_MAX_STACK } from './scrub'

export type { BucketVariant } from './bucketing'
export { ERROR_EVENT } from './capture'
export { FLAG_EVALUATED_EVENT } from './flag-telemetry'
export type { FlagEvaluationTelemetryInput } from './flag-telemetry'
export {
  FLAG_CONTRACT_VERSION,
  FLAG_CONTEXT_FIELDS,
  FLAG_ENVIRONMENTS,
  MAX_FLAG_DEFINITION_BYTES,
  evaluateFlag,
  isFlagEnvironment,
  parseFlagDefinition,
  parseFlagSnapshot,
  validateFlagKey,
} from './flags'
export type {
  FlagClause,
  FlagContextField,
  FlagDefinition,
  FlagDefinitionResult,
  FlagEnvironment,
  FlagEvaluationContext,
  FlagMetadataValue,
  FlagResolutionDetails,
  FlagResolutionReason,
  FlagRule,
  FlagSnapshot,
  FlagSnapshotFlag,
  FlagValueType,
  FlagVariant,
  JsonValue,
} from './flags'
export { createFlagProvider } from './flag-provider'
export type {
  FlagProvider,
  FlagProviderConfig,
  FlagProviderErrorCode,
  FlagProviderRefreshResult,
  FlagProviderResolutionDetails,
  FlagProviderStatus,
} from './flag-provider'
export {
  MAX_SCENARIO_ABORT_FAILURES,
  MAX_SCENARIO_CONCURRENCY_CAP,
  MAX_SCENARIO_DEFINITION_BYTES,
  MAX_SCENARIO_DELAY_MS,
  MAX_SCENARIO_DURATION_SECONDS,
  MAX_SCENARIO_LEASE_TTL_SECONDS,
  MAX_SCENARIO_REQUEST_CAP,
  MAX_SCENARIO_SNAPSHOT_BYTES,
  MAX_SCENARIOS_PER_SNAPSHOT,
  SCENARIO_COHORTS,
  SCENARIO_CONTRACT_VERSION,
  SCENARIO_SECURITY_TEMPLATES,
  evaluateScenario,
  parseScenarioDefinition,
  parseScenarioFault,
  parseScenarioSnapshot,
} from './scenarios'
export type {
  ScenarioCohort,
  ScenarioDefinition,
  ScenarioDefinitionResult,
  ScenarioExperimentReference,
  ScenarioFault,
  ScenarioFlagReference,
  ScenarioGuardrails,
  ScenarioKind,
  ScenarioLimits,
  ScenarioResolution,
  ScenarioSecurityTemplate,
  ScenarioSnapshot,
  ScenarioSnapshotEntry,
  ScenarioSnapshotResult,
} from './scenarios'

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
  | {
      ok: true
      id: string
      /** True when an idempotencyKey matched an existing event — nothing was created. */ deduplicated?: boolean
    }
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
  { ok: true; synced: number } | { ok: false; error: string; code?: string; issues?: unknown }

// Sprint 4, Story 4.1 (Roadmap/01-growth-engine/growth-engine-v1/sprint-4.md): deterministic
// client-side bucketing — same envelope shape as TrackResult/SyncResult (never a bare string), so
// v2 can extend it (e.g. a `reason` field) without a breaking change to callers.
export type BucketResult = { ok: true; variant: string } | { ok: false; error: string; code?: string }

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
  /**
   * signals-loop · Story 1.1 — the fraction of captured errors actually sent, 0..1 (default 1).
   *
   * A crash loop can emit the same error thousands of times a second, and the grouping downstream
   * collapses them into one row with a counter — so the marginal value of the thousandth copy is
   * nil while its cost to the tenant's quota is not. Sampling is applied per OCCURRENCE, after
   * dedupe, so a rare error is still virtually certain to be reported at least once.
   */
  errorSampleRate?: number
  /** Fraction of non-experiment flag evaluations to retain, defaulting to 1. */
  flagEvaluationSampleRate?: number
}

/** signals-loop · Story 1.1 — what `captureError` accepts alongside the error itself. */
export interface CaptureErrorProps {
  /** The feature this error happened inside, if known — the join key for the evidence bundle. */
  featureId?: string
  /** Extra diagnostic context. Scrubbed here and again, authoritatively, at ingest. */
  context?: Record<string, unknown>
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
    governance?: ExperimentGovernanceContext
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
    governance?: ExperimentGovernanceContext
  ): Promise<TrackResult>
  /**
   * Emits a bounded flag decision through canonical ingest. A bound experiment
   * deliberately reuses `experiment_exposed`, the existing comparison denominator;
   * ordinary evaluations use the reserved `flag_evaluated` event. Never throws.
   */
  trackFlagEvaluation(input: FlagEvaluationTelemetryInput): Promise<TrackResult>
  /**
   * signals-loop · Story 1.1 — report a runtime error as a reserved `$error` event.
   *
   * One line to adopt, and it rides the same envelope, the same auth and the same quota as every
   * other event — no second ingest path, no schema migration (AGENTS rule #1).
   *
   * NEVER THROWS and never rejects: a reporter that can fail inside a `catch` block turns one bug
   * into two, and the second one is in the error handler where nobody is looking.
   */
  captureError(error: unknown, props?: CaptureErrorProps): Promise<TrackResult>
  /**
   * Installs global `error` + `unhandledrejection` handlers that call `captureError`.
   *
   * Returns a disposer that removes them again — required, not a nicety: without it a hot-reloading
   * dev server or a re-mounting component stacks a new pair of listeners on every call, and the
   * duplicate reports look exactly like a worsening bug.
   *
   * Safe to call where `window` does not exist (SSR, a worker); it no-ops and returns a disposer.
   */
  captureGlobalErrors(props?: CaptureErrorProps): () => void
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
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown network error',
        code: 'NETWORK_ERROR',
      }
    }

    const body = (await res.json().catch(() => null)) as {
      ok?: boolean
      error?: string
      issues?: unknown
      deduplicated?: boolean
      id: string
    } | null
    if (!res.ok || !body?.ok) {
      return {
        ok: false,
        error: body?.error ?? `HTTP ${res.status}`,
        code: String(res.status),
        issues: body?.issues,
      }
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
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown network error',
        code: 'NETWORK_ERROR',
      }
    }

    const body = (await res.json().catch(() => null)) as {
      ok?: boolean
      error?: string
      issues?: unknown
      synced: number
    } | null
    if (!res.ok || !body?.ok) {
      return {
        ok: false,
        error: body?.error ?? `HTTP ${res.status}`,
        code: String(res.status),
        issues: body?.issues,
      }
    }
    return { ok: true, synced: body.synced }
  }

  function bucket(
    experimentKey: string,
    variants: BucketVariant[],
    governance?: ExperimentGovernanceContext
  ): BucketResult {
    const governed = governance !== undefined
    if (governed && !validGovernance(governance)) return invalidGovernanceResult()
    const variant = governed
      ? resolveGovernedVariant(
          governance.assignmentEntity.type,
          governance.assignmentEntity.id,
          experimentKey,
          governance.definitionVersion,
          variants
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
    governance?: ExperimentGovernanceContext
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

  const flagEvaluationSampleRate = normalizeFlagEvaluationSampleRate(config.flagEvaluationSampleRate)

  async function trackFlagEvaluation(input: FlagEvaluationTelemetryInput): Promise<TrackResult> {
    try {
      if (!validateFlagEvaluationTelemetry(input)) {
        return { ok: false, error: 'Invalid flag evaluation telemetry', code: 'INVALID_FLAG_EVALUATION' }
      }
      // An experiment's exposure stream is its comparison denominator. Sampling it
      // would bias every downstream conversion rate, so only ordinary evaluation
      // facts are sampled; bound experiments always reuse the complete exposure seam.
      if (!input.experiment && !shouldSampleFlagEvaluation(input, flagEvaluationSampleRate)) {
        return { ok: false, error: 'Sampled out', code: 'SAMPLED_OUT' }
      }

      const idempotencyKey = `flag_eval:${flagEvaluationFingerprint(input)}`
      const props: Omit<TrackEventProps, 'featureId'> = {
        tags: {
          flag_key: input.flagKey,
          flag_definition_version: input.flagVersion,
          variant: input.variant,
          reason: input.reason,
          snapshot_version: input.snapshotVersion,
          environment: input.environment,
        },
        context: {
          version: 1,
          subject: input.subject,
          idempotencyKey,
        },
      }
      if (input.experiment) {
        return await trackExposure(input.experiment.key, input.variant, props, {
          definitionVersion: input.experiment.definitionVersion,
          assignmentEntity: input.subject,
        })
      }
      return await track(FLAG_EVALUATED_EVENT, { ...props, featureId: input.flagKey })
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'flag evaluation telemetry failed',
        code: 'FLAG_EVALUATION_FAILED',
      }
    }
  }

  // ── signals-loop · Story 1.1 · error capture ─────────────────────────────────────────────────

  const sampleRate = normalizeSampleRate(config.errorSampleRate)

  async function captureError(error: unknown, props: CaptureErrorProps = {}): Promise<TrackResult> {
    try {
      // Sampled BEFORE any work. A crash loop's thousandth copy adds nothing the grouping counter
      // has not already recorded, and the tenant pays quota for every one of them.
      if (sampleRate < 1 && Math.random() >= sampleRate) {
        return { ok: false, error: 'Sampled out', code: 'SAMPLED_OUT' }
      }

      // Normalize, THEN scrub — and scrub here rather than inside normalizeError, so the two
      // concerns stay independently testable (see ./capture's header). The cap is applied by
      // scrubClientText as part of the same pass, because truncating before redaction can slice a
      // secret in half and store the surviving portion.
      const normalized = normalizeError(error)
      return await track(ERROR_EVENT, {
        featureId: props.featureId,
        tags: {
          name: scrubClientText(normalized.name, 64),
          message: scrubClientText(normalized.message, SDK_MAX_MESSAGE),
          // The stack rides `tags` because that is where the server's fingerprint reads it from.
          // Both sides name it in one place each, and the e2e spec asserts the round trip.
          stack: normalized.stack === null ? null : scrubClientText(normalized.stack, SDK_MAX_STACK),
        },
        metadata: { context: props.context ?? {} },
      })
    } catch (err) {
      // The whole method is wrapped, not just the fetch. `captureError` is called from catch blocks
      // and global handlers — the two places where a thrown exception is most likely to be swallowed
      // silently or to replace the original error in the report.
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'captureError failed',
        code: 'CAPTURE_FAILED',
      }
    }
  }

  function captureGlobalErrors(props: CaptureErrorProps = {}): () => void {
    const target = getErrorEventTarget()
    if (!target) return () => {}

    const onError = (event: { error?: unknown; message?: unknown }) => {
      void captureError(event.error ?? event.message, props)
    }
    const onRejection = (event: { reason?: unknown }) => {
      void captureError(event.reason, props)
    }

    target.addEventListener('error', onError as (e: unknown) => void)
    target.addEventListener('unhandledrejection', onRejection as (e: unknown) => void)

    return () => {
      target.removeEventListener('error', onError as (e: unknown) => void)
      target.removeEventListener('unhandledrejection', onRejection as (e: unknown) => void)
    }
  }

  return {
    track,
    trackAdoption: (featureKey, props) => track('feature_adopted', { ...props, featureId: featureKey }),
    syncFeatures,
    bucket,
    trackExposure,
    trackFlagEvaluation,
    captureError,
    captureGlobalErrors,
  }
}

// ── Why this is a hand-rolled structural type and not `lib: ["DOM"]` ─────────────────────────
// This package's tsconfig deliberately declares `lib: ["ES2022"]` and nothing else, because the SDK
// is framework- AND runtime-agnostic: it runs in a browser, in Node, in a worker, on an edge
// runtime. Adding the DOM lib to make `window` type-check would let ANY future code in this package
// silently assume a browser and still compile — the error would move from here (where it is one
// obvious line) to a customer's server bundle at runtime.
//
// So the global handler describes only the shape it actually uses. `captureGlobalErrors` is the one
// browser-shaped API in the SDK, and this keeps that fact local to it.
type ErrorEventTarget = {
  addEventListener: (type: string, listener: (event: never) => void) => void
  removeEventListener: (type: string, listener: (event: never) => void) => void
}

function getErrorEventTarget(): ErrorEventTarget | null {
  const g = globalThis as unknown as { addEventListener?: unknown; removeEventListener?: unknown }
  if (typeof g.addEventListener !== 'function' || typeof g.removeEventListener !== 'function') {
    return null
  }
  return g as unknown as ErrorEventTarget
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
    entity !== null &&
    typeof entity === 'object' &&
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
