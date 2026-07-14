import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { linkInputSchema } from '@/lib/north-star-schema'

// POST /v1/features/:key/link-input — Story 3.2. Links a feature (by its registry key,
// or any key the caller intends to register later — see the migration's comment on
// `feature_inputs.feature_key`) to a leading input already defined via
// POST /v1/north-star/sync (Story 3.1).
export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }
  const { key: featureKey } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = linkInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Malformed link-input payload', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const supabase = getSupabaseServiceClient()

  const { data: input, error: inputError } = await supabase
    .from('leading_inputs')
    .select('id')
    .eq('project_id', auth.projectId)
    .eq('key', parsed.data.inputKey)
    .maybeSingle()
  if (inputError) {
    console.error('[features/link-input] input lookup failed:', inputError)
    return NextResponse.json({ ok: false, error: 'Input lookup failed' }, { status: 500 })
  }
  if (!input) {
    return NextResponse.json({ ok: false, error: `Unknown input: ${parsed.data.inputKey}` }, { status: 404 })
  }

  const { error: linkError } = await supabase
    .from('feature_inputs')
    .upsert(
      { project_id: auth.projectId, feature_key: featureKey, input_id: input.id },
      { onConflict: 'project_id,feature_key,input_id', ignoreDuplicates: true },
    )
  if (linkError) {
    console.error('[features/link-input] link upsert failed:', linkError)
    return NextResponse.json({ ok: false, error: 'Failed to link input' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, featureKey, inputKey: parsed.data.inputKey })
}
