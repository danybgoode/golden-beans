import { NextRequest, NextResponse } from 'next/server'
import { hashCredential } from '@/lib/credential-hash'
import { isVerifiedMiyagiActor } from '@/lib/flag-admin-operation'
import { captureScenarioImpactEvidence, getScenarioImpactEvidence } from '@/lib/scenario-impact-operations'
import { parseScenarioImpactCaptureRequest } from '@/lib/scenario-impact-request'

function credential(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  return authorization.slice('Bearer '.length).trim() || null
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: 'Invalid scenario administration credential' },
    {
      status: 401,
    }
  )
}

export async function GET(req: NextRequest) {
  const rawKey = credential(req)
  if (!rawKey) return unauthorized()
  try {
    const evidence = await getScenarioImpactEvidence(hashCredential(rawKey))
    return evidence === null
      ? unauthorized()
      : NextResponse.json({ evidence }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Could not load scenario impact evidence' },
      {
        status: 500,
      }
    )
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid scenario impact command' }, { status: 400 })
  }
  const command = parseScenarioImpactCaptureRequest(body)
  if (!command) {
    return NextResponse.json({ ok: false, error: 'Invalid scenario impact command' }, { status: 400 })
  }
  const rawKey = credential(req)
  const actor = req.headers.get('x-miyagi-clerk-actor')
  if (!rawKey || !isVerifiedMiyagiActor(actor)) return unauthorized()
  try {
    const result = await captureScenarioImpactEvidence({
      keyHash: hashCredential(rawKey),
      actor,
      request: command,
    })
    if (result.ok) return NextResponse.json(result)
    const messages = {
      400: 'Invalid scenario impact command',
      401: 'Invalid scenario administration credential',
      409: 'Scenario impact source changed; refresh and retry',
      500: 'Could not capture scenario impact evidence',
    } as const
    return NextResponse.json({ ok: false, error: messages[result.status] }, { status: result.status })
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Could not capture scenario impact evidence' },
      {
        status: 500,
      }
    )
  }
}
