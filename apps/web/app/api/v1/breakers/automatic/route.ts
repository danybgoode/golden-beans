import { NextRequest, NextResponse } from 'next/server'
import { executeAutomaticBreaker } from '@/lib/breaker-admin-operations'
import { parseBreakerAutomaticOperation } from '@/lib/breaker-admin-operation'
import { hashCredential } from '@/lib/credential-hash'
import { isAutomaticCircuitBreakersEnabled } from '@/lib/flags'

function credential(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  return authorization.slice('Bearer '.length).trim() || null
}

export async function POST(req: NextRequest) {
  // The root automatic-action gate precedes body and credential work. Its OFF response is flat.
  if (!isAutomaticCircuitBreakersEnabled()) return new NextResponse(null, { status: 404 })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid automatic breaker command' }, {
      status: 400,
    })
  }
  const operation = parseBreakerAutomaticOperation(body)
  if (!operation) {
    return NextResponse.json({ ok: false, error: 'Invalid automatic breaker command' }, {
      status: 400,
    })
  }
  const rawKey = credential(req)
  if (!rawKey) {
    return NextResponse.json({ ok: false, error: 'Invalid breaker administration credential' }, {
      status: 401,
    })
  }
  try {
    const result = await executeAutomaticBreaker({
      keyHash: hashCredential(rawKey),
      operation,
    })
    if (result.ok) return NextResponse.json(result)
    const messages = {
      400: 'Invalid automatic breaker command',
      401: 'Invalid breaker administration credential',
      403: 'Automatic breaker is not owner approved',
      409: 'Breaker state or evidence is not eligible',
      500: 'Could not apply automatic breaker',
    } as const
    return NextResponse.json({ ok: false, error: messages[result.status] }, { status: result.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not apply automatic breaker' }, {
      status: 500,
    })
  }
}
