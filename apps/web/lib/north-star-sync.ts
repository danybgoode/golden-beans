import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { northStarSyncSchema } from './north-star-schema'

// think-skills D6 — the ONE read and the ONE write of a project's North Star.
//
// Two front doors reach them: the ingest-key routes (`GET /api/v1/north-star`, `POST /api/v1/north-star/sync`) and,
// since think-skills S3, the CLI route (`/api/v1/cli/north-star`, a `gf_pat_` credential plus membership). The logic
// was lifted out of the first pair UNCHANGED, so both doors answer the same question the same way. Each caller passes
// a `projectId` it resolved server-side from its own credential, and every query below is scoped to it.
//
// ── What a sync does, said plainly (think-skills C2) ──────────────────────────────────────────────────────────────
// It upserts the metric on (project_id, key) and each input on (project_id, key). A metric with a NEW key is added
// beside any existing one, never replacing it. An input key that already exists moves to this metric. Nothing is
// ever deleted. `gf north-star set`'s dry run shows exactly these three effects before anything is sent.

export type NorthStarInputView = {
  key: string
  name: string
  valueSource: string
  sourceEvent: string | null
  createdAt: string
}

export type NorthStarMetricView = {
  key: string
  name: string
  description: string | null
  createdAt: string
  inputs: NorthStarInputView[]
}

/** Every North Star metric of one project, each with its inputs nested. `null` when the database read failed. */
export async function listNorthStar(projectId: string): Promise<NorthStarMetricView[] | null> {
  const supabase = getSupabaseServiceClient()

  const { data: metrics, error: metricsError } = await supabase
    .from('north_star_metrics')
    .select('id, key, name, description, created_at')
    .eq('project_id', projectId)
  if (metricsError) {
    console.error('[north-star] metrics lookup failed:', metricsError)
    return null
  }

  const { data: inputs, error: inputsError } = await supabase
    .from('leading_inputs')
    .select('id, metric_id, key, name, value_source, source_event, created_at')
    .eq('project_id', projectId)
  if (inputsError) {
    console.error('[north-star] inputs lookup failed:', inputsError)
    return null
  }

  return (metrics ?? []).map((metric) => ({
    key: metric.key,
    name: metric.name,
    description: metric.description,
    createdAt: metric.created_at,
    inputs: (inputs ?? [])
      .filter((input) => input.metric_id === metric.id)
      .map((input) => ({
        key: input.key,
        name: input.name,
        valueSource: input.value_source,
        sourceEvent: input.source_event,
        createdAt: input.created_at,
      })),
  }))
}

export type NorthStarSyncResult =
  | { ok: true; metric: string; inputsSynced: number }
  | { ok: false; status: 400; error: string; issues?: unknown }
  | { ok: false; status: 500; error: string }

/** Validate and apply one sync payload to one project. The body is untrusted; the schema is the only judge of it. */
export async function syncNorthStar(projectId: string, body: unknown): Promise<NorthStarSyncResult> {
  const parsed = northStarSyncSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: 'Malformed north-star sync payload',
      issues: parsed.error.flatten(),
    }
  }

  const inputKeys = parsed.data.inputs.map((i) => i.key)
  const duplicateKeys = [...new Set(inputKeys.filter((key, i) => inputKeys.indexOf(key) !== i))]
  if (duplicateKeys.length > 0) {
    return { ok: false, status: 400, error: `Duplicate input key(s) in payload: ${duplicateKeys.join(', ')}` }
  }

  const supabase = getSupabaseServiceClient()

  // An existing input's value_source must never silently change on re-sync: switching
  // attributed_revenue from external_push to telemetry_event (a typo, a copy-paste
  // mistake) would make north-star-query.ts start computing its series from `events`
  // instead of `input_values` — every previously-pushed real revenue row would go
  // invisible in the report with no error, even though the rows themselves still exist.
  const { data: existingInputs, error: existingInputsError } = await supabase
    .from('leading_inputs')
    .select('key, value_source')
    .eq('project_id', projectId)
    .in(
      'key',
      parsed.data.inputs.map((i) => i.key)
    )
  if (existingInputsError) {
    console.error('[north-star/sync] existing-inputs lookup failed:', existingInputsError)
    return { ok: false, status: 500, error: 'Failed to check existing inputs' }
  }
  const valueSourceByKey = new Map(parsed.data.inputs.map((i) => [i.key, i.valueSource]))
  const changedValueSourceKeys = (existingInputs ?? [])
    .filter((existing) => valueSourceByKey.get(existing.key) !== existing.value_source)
    .map((existing) => existing.key)
  if (changedValueSourceKeys.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Cannot change value_source of an existing input: ${changedValueSourceKeys.join(', ')}`,
    }
  }

  const { data: metric, error: metricError } = await supabase
    .from('north_star_metrics')
    .upsert(
      {
        project_id: projectId,
        key: parsed.data.metric.key,
        name: parsed.data.metric.name,
        description: parsed.data.metric.description ?? null,
      },
      { onConflict: 'project_id,key' }
    )
    .select('id')
    .single()

  if (metricError || !metric) {
    console.error('[north-star/sync] metric upsert failed:', metricError)
    return { ok: false, status: 500, error: 'Failed to sync North Star metric' }
  }

  const inputRows = parsed.data.inputs.map((input) => ({
    project_id: projectId,
    metric_id: metric.id,
    key: input.key,
    name: input.name,
    value_source: input.valueSource,
    source_event: input.sourceEvent ?? null,
  }))

  const { data: inputs, error: inputsError } = await supabase
    .from('leading_inputs')
    .upsert(inputRows, { onConflict: 'project_id,key' })
    .select('key')

  if (inputsError) {
    console.error('[north-star/sync] inputs upsert failed:', inputsError)
    return { ok: false, status: 500, error: 'Failed to sync leading inputs' }
  }

  return { ok: true, metric: parsed.data.metric.key, inputsSynced: inputs?.length ?? 0 }
}
