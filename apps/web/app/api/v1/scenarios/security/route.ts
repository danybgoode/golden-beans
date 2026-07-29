import { NextRequest, NextResponse } from 'next/server'
import { hashCredential } from '@/lib/credential-hash'
import { isVerifiedMiyagiActor } from '@/lib/flag-admin-operation'
import { isSecuritySimulationsEnabled } from '@/lib/flags'
import { parseScenarioSecurityOperation } from '@/lib/scenario-security-operation'
import { getScenarioSecurityResults, runScenarioSecurityTemplate } from '@/lib/scenario-security-runner'

function credential(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const value = authorization.slice('Bearer '.length).trim()
  return value || null
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: 'Invalid scenario administration credential' },
    { status: 401 }
  )
}

export async function GET(req: NextRequest) {
  // Results remain inspectable while execution is dark.
  const rawKey = credential(req)
  const actor = req.headers.get('x-miyagi-clerk-actor')
  if (!rawKey || !isVerifiedMiyagiActor(actor)) return unauthorized()
  try {
    const result = await getScenarioSecurityResults(hashCredential(rawKey))
    return result ? NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } }) : unauthorized()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Could not load scenario security results' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  // The root gate is checked before body parsing and credential work.
  if (!isSecuritySimulationsEnabled()) {
    return new NextResponse(null, { status: 404 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid security scenario command' }, { status: 400 })
  }
  const operation = parseScenarioSecurityOperation(body)
  if (!operation) {
    return NextResponse.json({ ok: false, error: 'Invalid security scenario command' }, { status: 400 })
  }
  const rawKey = credential(req)
  const actor = req.headers.get('x-miyagi-clerk-actor')
  if (!rawKey || !isVerifiedMiyagiActor(actor)) return unauthorized()

  const result = await runScenarioSecurityTemplate({
    keyHash: hashCredential(rawKey),
    rawKey,
    runId: operation.runId,
    expectedRevision: operation.expectedRevision,
  })
  if (result.ok) return NextResponse.json(result)
  const messages = {
    401: 'Invalid scenario administration credential',
    409: 'Scenario state changed; refresh and retry',
    429: 'Scenario execution cap or cooldown reached',
    500: 'Could not execute security scenario',
  } as const
  return NextResponse.json(
    { ok: false, error: messages[result.status], reason: result.reason },
    { status: result.status }
  )
}
