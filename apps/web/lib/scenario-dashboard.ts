import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import type { ScenarioImpactEvidence } from './scenario-impact'

export type ScenarioDashboardRun = {
  id: string
  scenarioKey: string
  definitionVersion: number
  kind: 'resilience' | 'security'
  cohort: 'synthetic' | 'internal' | 'external'
  targetKey: string
  environment: string
  status: string
  revision: number
  requestCount: number
  successCount: number
  failureCount: number
  createdAt: string
  startedAt: string | null
  stoppedAt: string | null
  stopReason: string | null
}

export type ScenarioDashboardSecurityResult = {
  id: string
  runId: string
  template: string
  expectedOutcome: string
  observedOutcome: string
  observedStatuses: number[]
  succeeded: boolean
  latencyMs: number
  createdAt: string
}

export type ScenarioDashboardImpact = {
  id: string
  runId: string
  scenarioKey: string
  scenarioVersion: number
  evidence: ScenarioImpactEvidence
  reason: string
  createdAt: string
}

export type ScenarioDashboardPolicy = {
  id: string
  key: string
  definition: Record<string, unknown>
  status: string
  revision: number
  tripCount: number
  lastTrippedAt: string | null
  createdAt: string
}

export type ScenarioDashboardTrip = {
  id: string
  policyId: string
  evidenceId: string
  mode: 'manual' | 'automatic'
  observedBasisPoints: number
  oldSnapshotVersion: number
  newSnapshotVersion: number
  reason: string
  createdAt: string
}

export type ScenarioDashboardView = {
  targets: Array<{
    id: string
    key: string
    kind: string
    origin: string
    status: string
    verifiedAt: string | null
  }>
  runs: ScenarioDashboardRun[]
  securityResults: ScenarioDashboardSecurityResult[]
  impacts: ScenarioDashboardImpact[]
  policies: ScenarioDashboardPolicy[]
  trips: ScenarioDashboardTrip[]
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function boundedRows<T>(data: T[] | null): T[] {
  return data ?? []
}

/**
 * Member-facing operating lens. The project id comes only from requireProjectMembership(), and
 * every service-role read repeats that project predicate. This intentionally has no mutation
 * methods: scenario execution and breaker actions stay behind their revocable admin credential.
 */
export async function getScenarioDashboardView(projectId: string): Promise<ScenarioDashboardView> {
  const supabase = getSupabaseServiceClient()
  const [
    targetsResult,
    registriesResult,
    versionsResult,
    runsResult,
    securityResult,
    impactResult,
    policiesResult,
    statesResult,
    tripsResult,
  ] = await Promise.all([
    supabase
      .from('scenario_targets')
      .select('id, key, target_kind, origin, status, verified_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('scenario_registries').select('id, key').eq('project_id', projectId).limit(100),
    supabase
      .from('scenario_definition_versions')
      .select('id, scenario_id, target_id, version, definition')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('scenario_runs')
      .select(
        'id, scenario_id, scenario_version_id, target_id, environment, status, revision, request_count, success_count, failure_count, created_at, started_at, stopped_at, stop_reason'
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('scenario_security_results')
      .select(
        'id, run_id, template, expected_outcome, observed_outcome, observed_statuses, succeeded, latency_ms, created_at'
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('scenario_impact_evidence')
      .select('id, run_id, scenario_version, evidence, reason, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('breaker_policies')
      .select('id, key, definition, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('breaker_policy_states')
      .select('policy_id, status, revision, trip_count, last_tripped_at')
      .eq('project_id', projectId)
      .limit(100),
    supabase
      .from('breaker_trip_records')
      .select(
        'id, policy_id, evidence_id, mode, observed_basis_points, old_snapshot_version, new_snapshot_version, reason, created_at'
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const results = [
    targetsResult,
    registriesResult,
    versionsResult,
    runsResult,
    securityResult,
    impactResult,
    policiesResult,
    statesResult,
    tripsResult,
  ]
  const failed = results.find((result) => result.error)
  if (failed?.error) {
    console.error('[scenario-dashboard] project read failed', { code: failed.error.code })
    throw new Error('Could not load scenario operating view')
  }

  const targets = boundedRows(targetsResult.data)
  const registries = new Map(
    boundedRows(registriesResult.data).map((row) => [String(row.id), String(row.key)])
  )
  const versions = new Map(boundedRows(versionsResult.data).map((row) => [String(row.id), row]))
  const targetKeys = new Map(targets.map((row) => [String(row.id), String(row.key)]))
  const states = new Map(boundedRows(statesResult.data).map((row) => [String(row.policy_id), row]))

  return {
    targets: targets.map((row) => ({
      id: String(row.id),
      key: String(row.key),
      kind: String(row.target_kind),
      origin: String(row.origin),
      status: String(row.status),
      verifiedAt: (row.verified_at as string | null) ?? null,
    })),
    runs: boundedRows(runsResult.data).flatMap((row) => {
      const version = versions.get(String(row.scenario_version_id))
      const definition = version && record(version.definition) ? version.definition : null
      const kind = definition?.kind
      const cohort = definition?.cohort
      if (
        !version ||
        (kind !== 'resilience' && kind !== 'security') ||
        (cohort !== 'synthetic' && cohort !== 'internal' && cohort !== 'external')
      )
        return []
      return [
        {
          id: String(row.id),
          scenarioKey: registries.get(String(row.scenario_id)) ?? 'unknown',
          definitionVersion: Number(version.version),
          kind,
          cohort,
          targetKey: targetKeys.get(String(row.target_id)) ?? 'unknown',
          environment: String(row.environment),
          status: String(row.status),
          revision: Number(row.revision),
          requestCount: Number(row.request_count),
          successCount: Number(row.success_count),
          failureCount: Number(row.failure_count),
          createdAt: String(row.created_at),
          startedAt: (row.started_at as string | null) ?? null,
          stoppedAt: (row.stopped_at as string | null) ?? null,
          stopReason: (row.stop_reason as string | null) ?? null,
        },
      ]
    }),
    securityResults: boundedRows(securityResult.data).map((row) => ({
      id: String(row.id),
      runId: String(row.run_id),
      template: String(row.template),
      expectedOutcome: String(row.expected_outcome),
      observedOutcome: String(row.observed_outcome),
      observedStatuses: Array.isArray(row.observed_statuses) ? row.observed_statuses.map(Number) : [],
      succeeded: Boolean(row.succeeded),
      latencyMs: Number(row.latency_ms),
      createdAt: String(row.created_at),
    })),
    impacts: boundedRows(impactResult.data).flatMap((row) => {
      if (!record(row.evidence)) return []
      const scenario = record(row.evidence.scenario) ? row.evidence.scenario : null
      if (!scenario || typeof scenario.key !== 'string') return []
      return [
        {
          id: String(row.id),
          runId: String(row.run_id),
          scenarioKey: scenario.key,
          scenarioVersion: Number(row.scenario_version),
          evidence: row.evidence as ScenarioImpactEvidence,
          reason: String(row.reason),
          createdAt: String(row.created_at),
        },
      ]
    }),
    policies: boundedRows(policiesResult.data).flatMap((row) => {
      const state = states.get(String(row.id))
      if (!state || !record(row.definition)) return []
      return [
        {
          id: String(row.id),
          key: String(row.key),
          definition: row.definition,
          status: String(state.status),
          revision: Number(state.revision),
          tripCount: Number(state.trip_count),
          lastTrippedAt: (state.last_tripped_at as string | null) ?? null,
          createdAt: String(row.created_at),
        },
      ]
    }),
    trips: boundedRows(tripsResult.data).flatMap((row) => {
      if (row.mode !== 'manual' && row.mode !== 'automatic') return []
      return [
        {
          id: String(row.id),
          policyId: String(row.policy_id),
          evidenceId: String(row.evidence_id),
          mode: row.mode,
          observedBasisPoints: Number(row.observed_basis_points),
          oldSnapshotVersion: Number(row.old_snapshot_version),
          newSnapshotVersion: Number(row.new_snapshot_version),
          reason: String(row.reason),
          createdAt: String(row.created_at),
        },
      ]
    }),
  }
}
