import { NextRequest, NextResponse } from 'next/server'
import { hashCredential } from '@/lib/credential-hash'
import { isFlagServingEnabled } from '@/lib/flags'
import { isVerifiedMiyagiActor, parseFlagAdminOperation } from '@/lib/flag-admin-operation'
import { getFlagAdminSnapshot, setFlagAdminBoolean } from '@/lib/flag-admin-operations'

function credential(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const value = authorization.slice('Bearer '.length).trim()
  return value || null
}

function unauthorized() {
  // A bad key, a revoked key and a credential from every other scope stay indistinguishable.
  return NextResponse.json({ ok: false, error: 'Invalid flag administration credential' }, { status: 401 })
}

export async function GET(req: NextRequest) {
  // The whole admin surface shares FLAG_SERVING_ENABLED's dark-by-default semantics. Check before
  // any credential-derived work so OFF is not a credential-validity oracle.
  if (!isFlagServingEnabled()) return new NextResponse(null, { status: 404 })
  const rawKey = credential(req)
  if (!rawKey) return unauthorized()
  try {
    const snapshot = await getFlagAdminSnapshot(hashCredential(rawKey))
    return snapshot
      ? NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
      : unauthorized()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Could not load flag administration snapshot' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  // Operational activation shares FLAG_SERVING_ENABLED's dark-by-default semantics. This is after
  // nothing credential-specific, so OFF is not a credential-validity oracle.
  if (!isFlagServingEnabled()) return new NextResponse(null, { status: 404 })
  const rawKey = credential(req)
  const actor = req.headers.get('x-miyagi-clerk-actor')
  if (!rawKey) return unauthorized()
  if (!isVerifiedMiyagiActor(actor)) return unauthorized()
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid flag administration command' }, { status: 400 })
  }
  const operation = parseFlagAdminOperation(body)
  if (!operation)
    return NextResponse.json({ ok: false, error: 'Invalid flag administration command' }, { status: 400 })

  const result = await setFlagAdminBoolean({
    keyHash: hashCredential(rawKey),
    externalActorId: actor,
    ...operation,
  })
  if (!result.ok) {
    if (result.status === 401) return unauthorized()
    if (result.status === 409)
      return NextResponse.json(
        { ok: false, error: 'Flag snapshot changed; refresh and retry.' },
        { status: 409 }
      )
    if (result.status === 400)
      return NextResponse.json(
        { ok: false, error: 'Flag is not operable from Miyagi administration.' },
        { status: 400 }
      )
    return NextResponse.json({ ok: false, error: 'Could not update flag.' }, { status: 500 })
  }
  return NextResponse.json(result)
}
