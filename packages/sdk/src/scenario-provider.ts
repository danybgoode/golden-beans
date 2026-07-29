// Resilience scenario v1 — bounded server-side snapshot transport around pure local evaluation.
//
// This provider only resolves closed fault data. Executing a delay/error remains the responsibility
// of one explicit, target-specific application seam.
import {
  evaluateScenario,
  parseScenarioSnapshot,
  type ScenarioResolution,
  type ScenarioSnapshot,
} from './scenarios'
import type { FlagEnvironment, FlagEvaluationContext } from './flags'

const DEFAULT_REFRESH_INTERVAL_MS = 15_000
const DEFAULT_MAX_STALE_MS = 30_000
const DEFAULT_REFRESH_TIMEOUT_MS = 5_000
const MAX_REFRESH_INTERVAL_MS = 86_400_000
const MAX_MAX_STALE_MS = 86_400_000
const MAX_REFRESH_TIMEOUT_MS = 30_000

export type ScenarioProviderRefreshResult =
  | { ok: true; changed: boolean; notModified: boolean; revision: number }
  | {
      ok: false
      errorCode: 'PARSE_ERROR' | 'PROVIDER_NOT_READY' | 'GENERAL' | 'PROVIDER_FATAL'
      errorMessage: string
    }

export type ScenarioProviderStatus = {
  state: 'NOT_READY' | 'READY' | 'STALE' | 'SHUTDOWN'
  revision?: number
  environment?: FlagEnvironment
  lastRefreshAt?: number
  lastRefreshError?: ScenarioProviderRefreshResult
}

export type ScenarioProviderResolution =
  | ScenarioResolution
  | {
      value: { kind: 'none' }
      reason: 'PROVIDER_NOT_READY' | 'PROVIDER_STALE' | 'PROVIDER_SHUTDOWN'
    }

export interface ScenarioProviderConfig {
  baseUrl: string
  /** Reuses the project/environment-scoped flag_read credential; keep it server-side. */
  flagReadKey: string
  refreshIntervalMs?: number
  maxStaleMs?: number
  refreshTimeoutMs?: number
  fetchImpl?: typeof fetch
  now?: () => number
  environment?: FlagEnvironment
}

export interface ScenarioProvider {
  readonly metadata: { name: 'golden-beans-scenarios' }
  initialize(): Promise<ScenarioProviderRefreshResult>
  refresh(): Promise<ScenarioProviderRefreshResult>
  shutdown(): void
  getStatus(): ScenarioProviderStatus
  getSnapshot(): ScenarioSnapshot | undefined
  resolveScenario(
    targetKey: string,
    context: FlagEvaluationContext,
    nowMs?: number
  ): ScenarioProviderResolution
}

function boundedMilliseconds(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
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

function failure(
  errorCode: 'PARSE_ERROR' | 'PROVIDER_NOT_READY' | 'GENERAL' | 'PROVIDER_FATAL',
  errorMessage: string
): ScenarioProviderRefreshResult {
  return { ok: false, errorCode, errorMessage }
}

function control(
  reason: Extract<
    ScenarioProviderResolution['reason'],
    'PROVIDER_NOT_READY' | 'PROVIDER_STALE' | 'PROVIDER_SHUTDOWN'
  >
): ScenarioProviderResolution {
  return { value: { kind: 'none' }, reason }
}

export function createScenarioProvider(config: ScenarioProviderConfig): ScenarioProvider {
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
  const scenariosByTarget = new Map<string, ScenarioSnapshot['scenarios'][number]>()
  let snapshot: ScenarioSnapshot | undefined
  let etag: string | undefined
  let acceptedAt: number | undefined
  let lastRefreshError: ScenarioProviderRefreshResult | undefined
  let refreshInFlight: Promise<ScenarioProviderRefreshResult> | undefined
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
    return `${config.baseUrl.replace(/\/+$/, '')}/api/v1/scenarios/snapshot`
  }

  function startRefreshTimer(): void {
    if (refreshTimer || refreshIntervalMs === 0 || shutDown) return
    refreshTimer = setInterval(() => void refresh(), refreshIntervalMs)
    if (
      typeof refreshTimer === 'object' &&
      refreshTimer !== null &&
      'unref' in refreshTimer &&
      typeof refreshTimer.unref === 'function'
    ) {
      refreshTimer.unref()
    }
  }

  async function refreshOnce(): Promise<ScenarioProviderRefreshResult> {
    if (shutDown) return failure('PROVIDER_FATAL', 'Scenario provider has been shut down.')
    const url = snapshotUrl()
    if (!url || typeof fetchFn !== 'function') {
      const result = failure('PROVIDER_NOT_READY', 'Scenario provider is not configured for refresh.')
      lastRefreshError = result
      return result
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
      if (shutDown) return failure('PROVIDER_FATAL', 'Scenario provider has been shut down.')
      if (response.status === 304) {
        if (!snapshot) {
          const result = failure('PARSE_ERROR', 'Scenario snapshot was rejected.')
          lastRefreshError = result
          return result
        }
        acceptedAt = safeNow(now)
        lastRefreshError = undefined
        return { ok: true, changed: false, notModified: true, revision: snapshot.revision }
      }
      if (!response.ok) {
        const result = failure('GENERAL', 'Scenario snapshot refresh failed.')
        lastRefreshError = result
        return result
      }
      const parsed = parseScenarioSnapshot(await response.json().catch(() => undefined))
      if (
        !parsed.ok ||
        (config.environment !== undefined && parsed.snapshot.environment !== config.environment) ||
        (snapshot &&
          (parsed.snapshot.environment !== snapshot.environment ||
            parsed.snapshot.revision < snapshot.revision))
      ) {
        const result = failure('PARSE_ERROR', 'Scenario snapshot was rejected.')
        lastRefreshError = result
        return result
      }
      snapshot = parsed.snapshot
      scenariosByTarget.clear()
      for (const scenario of snapshot.scenarios) scenariosByTarget.set(scenario.targetKey, scenario)
      acceptedAt = safeNow(now)
      etag = response.headers.get('etag') ?? undefined
      lastRefreshError = undefined
      return { ok: true, changed: true, notModified: false, revision: snapshot.revision }
    } catch {
      const result = failure(
        shutDown ? 'PROVIDER_FATAL' : 'GENERAL',
        shutDown ? 'Scenario provider has been shut down.' : 'Scenario snapshot refresh failed.'
      )
      lastRefreshError = result
      return result
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      if (abortController === controller) abortController = undefined
    }
  }

  function refresh(): Promise<ScenarioProviderRefreshResult> {
    if (refreshInFlight) return refreshInFlight
    const operation = refreshOnce()
    refreshInFlight = operation
    void operation.finally(() => {
      if (refreshInFlight === operation) refreshInFlight = undefined
    })
    return operation
  }

  return {
    metadata: { name: 'golden-beans-scenarios' },
    async initialize() {
      if (shutDown) return failure('PROVIDER_FATAL', 'Scenario provider has been shut down.')
      if (!initialized) {
        initialized = true
        startRefreshTimer()
      }
      return refresh()
    },
    refresh,
    shutdown() {
      if (shutDown) return
      shutDown = true
      if (refreshTimer !== undefined) clearInterval(refreshTimer)
      refreshTimer = undefined
      abortController?.abort()
    },
    getStatus() {
      if (shutDown) {
        return {
          state: 'SHUTDOWN',
          ...(snapshot ? { revision: snapshot.revision, environment: snapshot.environment } : {}),
          ...(acceptedAt !== undefined ? { lastRefreshAt: acceptedAt } : {}),
          ...(lastRefreshError ? { lastRefreshError } : {}),
        }
      }
      if (!snapshot) return { state: 'NOT_READY', ...(lastRefreshError ? { lastRefreshError } : {}) }
      return {
        state: isFresh() ? 'READY' : 'STALE',
        revision: snapshot.revision,
        environment: snapshot.environment,
        ...(acceptedAt !== undefined ? { lastRefreshAt: acceptedAt } : {}),
        ...(lastRefreshError ? { lastRefreshError } : {}),
      }
    },
    getSnapshot() {
      return isFresh() ? snapshot : undefined
    },
    resolveScenario(targetKey, context, nowMs = safeNow(now)) {
      try {
        if (shutDown) return control('PROVIDER_SHUTDOWN')
        if (!snapshot) return control('PROVIDER_NOT_READY')
        if (!isFresh()) return control('PROVIDER_STALE')
        return evaluateScenario(scenariosByTarget.get(targetKey), targetKey, context, nowMs)
      } catch {
        return { value: { kind: 'none' }, reason: 'INVALID_SCENARIO' }
      }
    },
  }
}
