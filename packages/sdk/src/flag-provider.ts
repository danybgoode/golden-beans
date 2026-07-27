// Flag-serving v1 — bounded server-side snapshot transport around the pure local evaluator.
//
// The read credential is intentionally separate from telemetry credentials. This provider never
// logs it (or transport errors that might contain it), and it only evaluates the last accepted,
// typed snapshot synchronously.
import {
  evaluateFlag,
  parseFlagSnapshot,
  type FlagEnvironment,
  type FlagEvaluationContext,
  type FlagResolutionDetails,
  type FlagSnapshot,
  type FlagValueType,
  type JsonValue,
} from './flags'

const DEFAULT_REFRESH_INTERVAL_MS = 60_000
const DEFAULT_MAX_STALE_MS = 300_000
const DEFAULT_REFRESH_TIMEOUT_MS = 5_000
const MAX_REFRESH_INTERVAL_MS = 86_400_000
const MAX_MAX_STALE_MS = 86_400_000
const MAX_REFRESH_TIMEOUT_MS = 30_000

export type FlagProviderErrorCode =
  | 'FLAG_NOT_FOUND'
  | 'TYPE_MISMATCH'
  | 'INVALID_CONTEXT'
  | 'PARSE_ERROR'
  | 'PROVIDER_NOT_READY'
  | 'GENERAL'
  | 'PROVIDER_FATAL'

export type FlagProviderResolutionDetails<T> = Omit<FlagResolutionDetails<T>, 'errorCode'> & {
  errorCode?: FlagProviderErrorCode
  /** Generic by design: transport details can accidentally contain a credential or endpoint data. */
  errorMessage?: string
}

export type FlagProviderRefreshResult =
  | { ok: true; changed: boolean; notModified: boolean; snapshotVersion: number }
  | {
      ok: false
      errorCode: 'PARSE_ERROR' | 'PROVIDER_NOT_READY' | 'GENERAL' | 'PROVIDER_FATAL'
      errorMessage: string
    }

export type FlagProviderStatus = {
  state: 'NOT_READY' | 'READY' | 'STALE' | 'SHUTDOWN'
  snapshotVersion?: number
  environment?: FlagEnvironment
  lastRefreshAt?: number
  lastRefreshError?: FlagProviderRefreshResult
}

export interface FlagProviderConfig {
  /** Golden Beans base URL. The snapshot route is always `/api/v1/flags/snapshot`. */
  baseUrl: string
  /** Revocable, project- and environment-scoped `flag_read` credential. Keep this server-side. */
  flagReadKey: string
  /** Periodic refresh cadence; `0` disables the timer and leaves explicit refreshes available. */
  refreshIntervalMs?: number
  /** Maximum age of an accepted snapshot before every evaluation falls back safely. */
  maxStaleMs?: number
  /** Hard upper bound for a single snapshot request. */
  refreshTimeoutMs?: number
  /** Test seam; defaults to the runtime global fetch. */
  fetchImpl?: typeof fetch
  /** Test seam; defaults to Date.now. */
  now?: () => number
  /** Optional local assertion; otherwise the first accepted snapshot establishes the environment. */
  environment?: FlagEnvironment
}

export interface FlagProvider {
  readonly metadata: { name: 'golden-beans' }
  /** Starts bounded periodic refresh and makes one immediate, deduplicated refresh attempt. */
  initialize(): Promise<FlagProviderRefreshResult>
  /** Makes one bounded, deduplicated refresh attempt without making reads asynchronous. */
  refresh(): Promise<FlagProviderRefreshResult>
  /** Cancels future refreshes and any in-flight request. This provider cannot be restarted. */
  shutdown(): void
  /** A copy-free visibility seam for health reporting; never exposes credential material. */
  getStatus(): FlagProviderStatus
  /** The last accepted snapshot, if it remains within the configured stale bound. */
  getSnapshot(): FlagSnapshot | undefined
  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context?: FlagEvaluationContext
  ): FlagProviderResolutionDetails<boolean>
  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context?: FlagEvaluationContext
  ): FlagProviderResolutionDetails<string>
  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context?: FlagEvaluationContext
  ): FlagProviderResolutionDetails<number>
  resolveObjectEvaluation<T extends JsonValue[] | Record<string, JsonValue>>(
    flagKey: string,
    defaultValue: T,
    context?: FlagEvaluationContext
  ): FlagProviderResolutionDetails<T>
}

function boundedMilliseconds(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(0, Math.floor(value)), maximum)
}

function safeNow(now: () => number): number {
  try {
    const value = now()
    return Number.isFinite(value) ? value : Date.now()
  } catch {
    return Date.now()
  }
}

function providerFailure(
  errorCode: Extract<FlagProviderErrorCode, 'PROVIDER_NOT_READY' | 'GENERAL' | 'PROVIDER_FATAL'>,
  errorMessage: string
): FlagProviderRefreshResult {
  return { ok: false, errorCode, errorMessage }
}

function rejectedSnapshot(): FlagProviderRefreshResult {
  return { ok: false, errorCode: 'PARSE_ERROR', errorMessage: 'Flag snapshot was rejected.' }
}

function mapEvaluation<T>(details: FlagResolutionDetails<T>): FlagProviderResolutionDetails<T> {
  const { errorCode, ...withoutErrorCode } = details
  if (!errorCode) return withoutErrorCode
  if (errorCode === 'INVALID_DEFINITION') {
    return { ...withoutErrorCode, errorCode: 'PARSE_ERROR' }
  }
  return { ...withoutErrorCode, errorCode }
}

/**
 * Creates an OpenFeature-shaped provider without introducing an OpenFeature runtime dependency.
 * Snapshot reads are the only asynchronous operation; every `resolve*Evaluation` method is local,
 * bounded by `maxStaleMs`, and never throws.
 */
export function createFlagProvider(config: FlagProviderConfig): FlagProvider {
  const refreshIntervalMs = boundedMilliseconds(
    config.refreshIntervalMs,
    DEFAULT_REFRESH_INTERVAL_MS,
    MAX_REFRESH_INTERVAL_MS
  )
  const maxStaleMs = boundedMilliseconds(config.maxStaleMs, DEFAULT_MAX_STALE_MS, MAX_MAX_STALE_MS)
  const refreshTimeoutMs = Math.max(
    1,
    boundedMilliseconds(config.refreshTimeoutMs, DEFAULT_REFRESH_TIMEOUT_MS, MAX_REFRESH_TIMEOUT_MS)
  )
  const fetchFn = config.fetchImpl ?? globalThis.fetch
  const now = config.now ?? Date.now
  const flagsByKey = new Map<string, FlagSnapshot['flags'][number]>()
  let snapshot: FlagSnapshot | undefined
  let etag: string | undefined
  let acceptedAt: number | undefined
  let lastRefreshError: FlagProviderRefreshResult | undefined
  let refreshInFlight: Promise<FlagProviderRefreshResult> | undefined
  let refreshTimer: ReturnType<typeof setInterval> | undefined
  let abortController: AbortController | undefined
  let initialized = false
  let shutDown = false

  function isFresh(): boolean {
    if (!snapshot || acceptedAt === undefined || shutDown) return false
    return Math.max(0, safeNow(now) - acceptedAt) <= maxStaleMs
  }

  function snapshotUrl(): string | undefined {
    if (typeof config.baseUrl !== 'string' || config.baseUrl.trim().length === 0) return undefined
    return `${config.baseUrl.replace(/\/+$/, '')}/api/v1/flags/snapshot`
  }

  function startRefreshTimer(): void {
    if (refreshTimer || refreshIntervalMs === 0 || shutDown) return
    refreshTimer = setInterval(() => {
      void refresh()
    }, refreshIntervalMs)
    // Do not keep a Node application alive merely because its flag cache exists. Browser timer
    // handles are numbers, so feature-detect rather than importing Node timer types.
    if (
      typeof refreshTimer === 'object' &&
      refreshTimer !== null &&
      'unref' in refreshTimer &&
      typeof refreshTimer.unref === 'function'
    ) {
      refreshTimer.unref()
    }
  }

  async function refreshOnce(): Promise<FlagProviderRefreshResult> {
    if (shutDown) return providerFailure('PROVIDER_FATAL', 'Flag provider has been shut down.')
    const url = snapshotUrl()
    if (!url || typeof fetchFn !== 'function') {
      const failure = providerFailure('PROVIDER_NOT_READY', 'Flag provider is not configured for refresh.')
      lastRefreshError = failure
      return failure
    }

    const controller = new AbortController()
    abortController = controller
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const timeoutResult = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort()
          reject(new Error('refresh timed out'))
        }, refreshTimeoutMs)
      })
      // Keep a rejection handler on the request after the timeout wins. Aborting is advisory:
      // runtimes may reject the detached fetch later, and that must not become an unhandled
      // rejection in a caller that already received its bounded fallback.
      const request = Promise.resolve().then(() =>
        fetchFn(url, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${config.flagReadKey}`,
            ...(etag ? { 'If-None-Match': etag } : {}),
          },
          signal: controller.signal,
        })
      )
      void request.catch(() => undefined)
      const response = await Promise.race([request, timeoutResult])

      if (shutDown) return providerFailure('PROVIDER_FATAL', 'Flag provider has been shut down.')
      if (response.status === 304) {
        if (!snapshot) {
          const failure = rejectedSnapshot()
          lastRefreshError = failure
          return failure
        }
        acceptedAt = safeNow(now)
        lastRefreshError = undefined
        return { ok: true, changed: false, notModified: true, snapshotVersion: snapshot.snapshotVersion }
      }
      if (!response.ok) {
        const failure = providerFailure('GENERAL', 'Flag snapshot refresh failed.')
        lastRefreshError = failure
        return failure
      }

      const parsed = parseFlagSnapshot(await response.json().catch(() => undefined))
      if (
        !parsed.ok ||
        (config.environment !== undefined && parsed.snapshot.environment !== config.environment) ||
        (snapshot &&
          (parsed.snapshot.environment !== snapshot.environment ||
            parsed.snapshot.snapshotVersion < snapshot.snapshotVersion))
      ) {
        const failure = rejectedSnapshot()
        lastRefreshError = failure
        return failure
      }

      snapshot = parsed.snapshot
      flagsByKey.clear()
      for (const flag of snapshot.flags) flagsByKey.set(flag.key, flag)
      acceptedAt = safeNow(now)
      etag = response.headers.get('etag') ?? undefined
      lastRefreshError = undefined
      return { ok: true, changed: true, notModified: false, snapshotVersion: snapshot.snapshotVersion }
    } catch {
      const failure = providerFailure(
        shutDown ? 'PROVIDER_FATAL' : 'GENERAL',
        shutDown ? 'Flag provider has been shut down.' : 'Flag snapshot refresh failed.'
      )
      lastRefreshError = failure
      return failure
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      if (abortController === controller) abortController = undefined
    }
  }

  function refresh(): Promise<FlagProviderRefreshResult> {
    if (refreshInFlight) return refreshInFlight
    const operation = refreshOnce()
    refreshInFlight = operation
    void operation.finally(() => {
      if (refreshInFlight === operation) refreshInFlight = undefined
    })
    return operation
  }

  function fallback<T>(defaultValue: T): FlagProviderResolutionDetails<T> {
    if (shutDown) {
      return {
        value: defaultValue,
        reason: 'ERROR',
        flagMetadata: {},
        errorCode: 'PROVIDER_FATAL',
        errorMessage: 'Flag provider has been shut down.',
      }
    }
    if (snapshot && !isFresh()) {
      return {
        value: defaultValue,
        reason: 'ERROR',
        flagMetadata: {},
        errorCode: 'PROVIDER_NOT_READY',
        errorMessage: 'Flag snapshot is stale.',
      }
    }
    return {
      value: defaultValue,
      reason: 'ERROR',
      flagMetadata: {},
      errorCode: 'PROVIDER_NOT_READY',
      errorMessage: 'Flag provider has no fresh snapshot.',
    }
  }

  function resolve<T>(
    flagKey: string,
    defaultValue: T,
    expectedType: FlagValueType,
    context?: FlagEvaluationContext
  ): FlagProviderResolutionDetails<T> {
    try {
      if (!isFresh()) return fallback(defaultValue)
      return mapEvaluation(
        evaluateFlag({ flag: flagsByKey.get(flagKey), defaultValue, expectedType, context })
      )
    } catch {
      return {
        value: defaultValue,
        reason: 'ERROR',
        flagMetadata: {},
        errorCode: 'GENERAL',
        errorMessage: 'Flag evaluation failed.',
      }
    }
  }

  return {
    metadata: { name: 'golden-beans' },
    async initialize(): Promise<FlagProviderRefreshResult> {
      if (shutDown) return providerFailure('PROVIDER_FATAL', 'Flag provider has been shut down.')
      if (!initialized) {
        initialized = true
        startRefreshTimer()
      }
      return refresh()
    },
    refresh,
    shutdown(): void {
      if (shutDown) return
      shutDown = true
      if (refreshTimer !== undefined) clearInterval(refreshTimer)
      refreshTimer = undefined
      abortController?.abort()
    },
    getStatus(): FlagProviderStatus {
      if (shutDown)
        return {
          state: 'SHUTDOWN',
          ...(snapshot
            ? { snapshotVersion: snapshot.snapshotVersion, environment: snapshot.environment }
            : {}),
          ...(acceptedAt !== undefined ? { lastRefreshAt: acceptedAt } : {}),
          ...(lastRefreshError ? { lastRefreshError } : {}),
        }
      if (!snapshot) return { state: 'NOT_READY', ...(lastRefreshError ? { lastRefreshError } : {}) }
      return {
        state: isFresh() ? 'READY' : 'STALE',
        snapshotVersion: snapshot.snapshotVersion,
        environment: snapshot.environment,
        ...(acceptedAt !== undefined ? { lastRefreshAt: acceptedAt } : {}),
        ...(lastRefreshError ? { lastRefreshError } : {}),
      }
    },
    getSnapshot(): FlagSnapshot | undefined {
      return isFresh() ? snapshot : undefined
    },
    resolveBooleanEvaluation(flagKey, defaultValue, context) {
      return resolve(flagKey, defaultValue, 'boolean', context)
    },
    resolveStringEvaluation(flagKey, defaultValue, context) {
      return resolve(flagKey, defaultValue, 'string', context)
    },
    resolveNumberEvaluation(flagKey, defaultValue, context) {
      return resolve(flagKey, defaultValue, 'number', context)
    },
    resolveObjectEvaluation<T extends JsonValue[] | Record<string, JsonValue>>(
      flagKey: string,
      defaultValue: T,
      context?: FlagEvaluationContext
    ) {
      return resolve(flagKey, defaultValue, 'json', context)
    },
  }
}
