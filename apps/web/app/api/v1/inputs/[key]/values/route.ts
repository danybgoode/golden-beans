import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { inputValuesSchema } from '@/lib/north-star-schema'

// POST /v1/inputs/:key/values — Story 3.3. Appends daily values to an 'external_push'
// input's ledger (`input_values`). Money-touching: this is where Miyagi's real
// attributed-revenue figures land (via scripts/sync-revenue-from-miyagi.mjs), so pushes
// are append-only and idempotent (re-pushing the same day is a no-op, never an update —
// `input_values` has no UPDATE path at all, enforced by a DB trigger, not just this route).
export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }
  const { key: inputKey } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = inputValuesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Malformed values payload', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const supabase = getSupabaseServiceClient()

  const { data: input, error: inputError } = await supabase
    .from('leading_inputs')
    .select('id, value_source')
    .eq('project_id', auth.projectId)
    .eq('key', inputKey)
    .maybeSingle()
  if (inputError) {
    console.error('[inputs/values] input lookup failed:', inputError)
    return NextResponse.json({ ok: false, error: 'Input lookup failed' }, { status: 500 })
  }
  if (!input) {
    return NextResponse.json({ ok: false, error: `Unknown input: ${inputKey}` }, { status: 404 })
  }
  if (input.value_source !== 'external_push') {
    return NextResponse.json(
      { ok: false, error: `Input '${inputKey}' is telemetry_event-sourced — its values are computed, never pushed` },
      { status: 400 },
    )
  }

  const occurredOnDates = parsed.data.values.map((v) => v.occurredOn)
  const duplicateDates = [...new Set(occurredOnDates.filter((d, i) => occurredOnDates.indexOf(d) !== i))]
  if (duplicateDates.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Duplicate occurredOn date(s) in payload: ${duplicateDates.join(', ')}` },
      { status: 400 },
    )
  }

  const rows = parsed.data.values.map((v) => ({
    project_id: auth.projectId,
    input_id: input.id,
    occurred_on: v.occurredOn,
    value: v.value,
    dedupe_key: `${input.id}:${v.occurredOn}`,
  }))

  // ON CONFLICT (dedupe_key) DO NOTHING — never an UPDATE (the ledger's trigger blocks
  // that anyway). A day pushed twice is a safe no-op, not a duplicate row.
  const { data: inserted, error: insertError } = await supabase
    .from('input_values')
    .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('occurred_on')

  if (insertError) {
    console.error('[inputs/values] insert failed:', insertError)
    return NextResponse.json({ ok: false, error: 'Failed to append values' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    inputKey,
    inserted: inserted?.length ?? 0,
    skippedDuplicates: rows.length - (inserted?.length ?? 0),
  })
}
