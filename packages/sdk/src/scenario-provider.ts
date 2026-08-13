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
const DEFAULT_EXECUTION_TIMEOUT_MS = 5_000
const MAX_REFRESH_INTERVAL_MS = 86_400_000
const MAX_MAX_STALE_MS = 86_400_000
const MAX_REFRESH_TIMEOUT_MS = 30_000
const MAX_EXECUTION_TIMEOUT_MS = 30_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

export type ScenarioExecutionFailure = {
  ok: false
  errorCode: 'INVALID_ARGUMENT' | 'PROVIDER_NOT_READY' | 'GENERAL' | 'PROVIDER_FATAL'
  errorMessage: string
}

export type ScenarioExecutionReservation =
  | {
      ok: true
      operation: 'reserve'
      leaseId: string
      runRevision: number
      expiresAt: string
      admitted: true
      reason: 'ADMITTED'
    }
  | {
      ok: true
      operation: 'reserve'
      leaseId: null
      runRevision: number
      expiresAt: null
      admitted: false
      reason: 'STALE_REVISION' | 'INACTIVE' | 'REQUEST_CAP' | 'CONCURRENCY_CAP'
    }
  | ScenarioExecutionFailure

export type ScenarioExecutionSettlement =
  | {
      ok: true
      operation: 'settle'
      leaseId: string
      runRevision: number
      runStatus: 'running' | 'stopped' | 'aborted' | 'expired'
      activeLeaseCount: number
      successCount: number
      failureCount: number
      settled: boolean
      reason: 'SETTLED' | 'ALREADY_SETTLED' | 'LEASE_EXPIRED'
    }
  | ScenarioExecutionFailure

export interface ScenarioProviderConfig {
  baseUrl: string
  /** Reuses the project/environment-scoped flag_read credential; keep it server-side. */
  flagReadKey: string
  refreshIntervalMs?: number
  maxStaleMs?: number
  refreshTimeoutMs?: number
  executionTimeoutMs?: number
  fetchImpl?: typeof fetch
  now?: () => number
  environment?: FlagEnvironment
}

export interface ScenarioProvider {
  readonly metadata: { name: 'golden-frijoles-scenarios' }
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
  /** Atomically reserves one database-enforced execution lease for a resolved run. */
  reserveExecution(runId: string, expectedRunRevision: number): Promise<ScenarioExecutionReservation>
  /** Settles a reserved lease exactly once and returns the resulting bounded run counters. */
  settleExecution(runId: string, leaseId: string, succeeded: boolean): Promise<ScenarioExecutionSettlement>
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function executionFailure(
  errorCode: ScenarioExecutionFailure['errorCode'],
  errorMessage: string
): ScenarioExecutionFailure {
  return { ok: false, errorCode, errorMessage }
}

function parseReservation(value: unknown): ScenarioExecutionReservation | undefined {
  if (
    !isRecord(value) ||
    value.operation !== 'reserve' ||
    !isPositiveSafeInteger(value.runRevision) ||
    typeof value.admitted !== 'boolean'
  ) {
    return undefined
  }
  if (
    value.admitted === true &&
    typeof value.leaseId === 'string' &&
    UUID.test(value.leaseId) &&
    typeof value.expiresAt === 'string' &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    value.reason === 'ADMITTED'
  ) {
    return {
      ok: true,
      operation: 'reserve',
      leaseId: value.leaseId,
      runRevision: value.runRevision,
      expiresAt: value.expiresAt,
      admitted: true,
      reason: 'ADMITTED',
    }
  }
  if (
    value.admitted === false &&
    value.leaseId === null &&
    value.expiresAt === null &&
    (value.reason === 'STALE_REVISION' ||
      value.reason === 'INACTIVE' ||
      value.reason === 'REQUEST_CAP' ||
      value.reason === 'CONCURRENCY_CAP')
  ) {
    return {
      ok: true,
      operation: 'reserve',
      leaseId: null,
      runRevision: value.runRevision,
      expiresAt: null,
      admitted: false,
      reason: value.reason,
    }
  }
  return undefined
}

function parseSettlement(value: unknown): ScenarioExecutionSettlement | undefined {
  if (
    !isRecord(value) ||
    value.operation !== 'settle' ||
    typeof value.leaseId !== 'string' ||
    !UUID.test(value.leaseId) ||
    !isPositiveSafeInteger(value.runRevision) ||
    (value.runStatus !== 'running' &&
      value.runStatus !== 'stopped' &&
      value.runStatus !== 'aborted' &&
      value.runStatus !== 'expired') ||
    !isNonnegativeSafeInteger(value.activeLeaseCount) ||
    !isNonnegativeSafeInteger(value.successCount) ||
    !isNonnegativeSafeInteger(value.failureCount) ||
    typeof value.settled !== 'boolean' ||
    (value.reason !== 'SETTLED' && value.reason !== 'ALREADY_SETTLED' && value.reason !== 'LEASE_EXPIRED')
  ) {
    return undefined
  }
  return {
    ok: true,
    operation: 'settle',
    leaseId: value.leaseId,
    runRevision: value.runRevision,
    runStatus: value.runStatus,
    activeLeaseCount: value.activeLeaseCount,
    successCount: value.successCount,
    failureCount: value.failureCount,
    settled: value.settled,
    reason: value.reason,
  }
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
  const executionTimeoutMs = Math.max(
    1,
    boundedMilliseconds(config.executionTimeoutMs, DEFAULT_EXECUTION_TIMEOUT_MS, MAX_EXECUTION_TIMEOUT_MS)
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
  const executionControllers = new Set<AbortController>()
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

  function executionUrl(): string | undefined {
    if (typeof config.baseUrl !== 'string' || config.baseUrl.trim().length === 0) return undefined
    return `${config.baseUrl.replace(/\/+$/, '')}/api/v1/scenarios/execution`
  }

  async function execute(
    body: Record<string, unknown>
  ): Promise<ScenarioExecutionReservation | ScenarioExecutionSettlement> {
    if (shutDown) {
      return executionFailure('PROVIDER_FATAL', 'Scenario provider has been shut down.')
    }
    const url = executionUrl()
    if (!url || typeof fetchFn !== 'function') {
      return executionFailure('PROVIDER_NOT_READY', 'Scenario provider is not configured for execution.')
    }
    const controller = new AbortController()
    executionControllers.add(controller)
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const timeoutResult = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort()
          reject(new Error('execution timed out'))
        }, executionTimeoutMs)
      })
      const request = Promise.resolve().then(() =>
        fetchFn(url, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${config.flagReadKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      )
      void request.catch(() => undefined)
      const response = await Promise.race([request, timeoutResult])
      if (!response.ok) return executionFailure('GENERAL', 'Scenario execution request failed.')
      const result = await response.json().catch(() => undefined)
      const parsed = body.operation === 'reserve' ? parseReservation(result) : parseSettlement(result)
      return parsed ?? executionFailure('GENERAL', 'Scenario execution response was rejected.')
    } catch {
      return executionFailure(
        shutDown ? 'PROVIDER_FATAL' : 'GENERAL',
        shutDown ? 'Scenario provider has been shut down.' : 'Scenario execution request failed.'
      )
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      executionControllers.delete(controller)
    }
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
    metadata: { name: 'golden-frijoles-scenarios' },
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
      for (const controller of executionControllers) controller.abort()
      executionControllers.clear()
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
    reserveExecution(runId, expectedRunRevision) {
      if (
        typeof runId !== 'string' ||
        !UUID.test(runId) ||
        !Number.isSafeInteger(expectedRunRevision) ||
        expectedRunRevision < 1
      ) {
        return Promise.resolve(
          executionFailure('INVALID_ARGUMENT', 'Invalid scenario execution reservation.')
        )
      }
      return execute({
        operation: 'reserve',
        runId,
        expectedRunRevision,
      }) as Promise<ScenarioExecutionReservation>
    },
    settleExecution(runId, leaseId, succeeded) {
      if (
        typeof runId !== 'string' ||
        !UUID.test(runId) ||
        typeof leaseId !== 'string' ||
        !UUID.test(leaseId) ||
        typeof succeeded !== 'boolean'
      ) {
        return Promise.resolve(executionFailure('INVALID_ARGUMENT', 'Invalid scenario execution settlement.'))
      }
      return execute({
        operation: 'settle',
        runId,
        leaseId,
        succeeded,
      }) as Promise<ScenarioExecutionSettlement>
    },
  }
}
