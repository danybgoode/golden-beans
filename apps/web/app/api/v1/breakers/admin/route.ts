import { NextRequest, NextResponse } from 'next/server'
import {
  executeBreakerAdminOperation,
  getBreakerAdminSnapshot,
} from '@/lib/breaker-admin-operations'
import { parseBreakerAdminOperation } from '@/lib/breaker-admin-operation'
import { hashCredential } from '@/lib/credential-hash'
import { isVerifiedMiyagiActor } from '@/lib/flag-admin-operation'

function credential(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  return authorization.slice('Bearer '.length).trim() || null
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Invalid breaker administration credential' }, {
    status: 401,
  })
}

export async function GET(req: NextRequest) {
  const rawKey = credential(req)
  if (!rawKey) return unauthorized()
  try {
    const snapshot = await getBreakerAdminSnapshot(hashCredential(rawKey))
    return snapshot
      ? NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
      : unauthorized()
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not load breaker snapshot' }, {
      status: 500,
    })
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid breaker command' }, { status: 400 })
  }
  const operation = parseBreakerAdminOperation(body)
  if (!operation) {
    return NextResponse.json({ ok: false, error: 'Invalid breaker command' }, { status: 400 })
  }
  const rawKey = credential(req)
  const actor = req.headers.get('x-miyagi-clerk-actor')
  if (!rawKey || !isVerifiedMiyagiActor(actor)) return unauthorized()
  try {
    const result = await executeBreakerAdminOperation({
      keyHash: hashCredential(rawKey),
      actor,
      operation,
    })
    if (result.ok) return NextResponse.json(result)
    const messages = {
      400: 'Invalid breaker command',
      401: 'Invalid breaker administration credential',
      403: 'Breaker action is not approved',
      409: 'Breaker state or evidence is not eligible',
      500: 'Could not apply breaker operation',
    } as const
    return NextResponse.json({ ok: false, error: messages[result.status] }, { status: result.status })
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not apply breaker operation' }, {
      status: 500,
    })
  }
}
