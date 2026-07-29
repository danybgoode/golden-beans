import { NextRequest, NextResponse } from 'next/server'
import { hashCredential } from '@/lib/credential-hash'
import { isResilienceScenariosEnabled, isSecuritySimulationsEnabled } from '@/lib/flags'
import {
  executeScenarioAdminOperation,
  getScenarioAdminSnapshot,
  registerScenarioTarget,
  verifyScenarioTarget,
} from '@/lib/scenario-admin-operations'
import { isVerifiedMiyagiActor } from '@/lib/flag-admin-operation'
import { parseScenarioAdminOperation } from '@/lib/scenario-admin-operation'

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

function failure(status: 400 | 401 | 403 | 409 | 502 | 500) {
  if (status === 401) return unauthorized()
  const messages = {
    400: 'Invalid scenario administration command',
    403: 'Scenario operation requires owner approval',
    409: 'Scenario state changed; refresh and retry',
    502: 'Scenario target ownership could not be verified',
    500: 'Could not apply scenario operation',
  } as const
  return NextResponse.json({ ok: false, error: messages[status] }, { status })
}

export async function GET(req: NextRequest) {
  // Definitions and stop-state evidence remain inspectable while execution gates are OFF.
  const rawKey = credential(req)
  if (!rawKey) return unauthorized()
  try {
    const snapshot = await getScenarioAdminSnapshot(hashCredential(rawKey))
    return snapshot
      ? NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
      : unauthorized()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Could not load scenario administration snapshot' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return failure(400)
  }
  const operation = parseScenarioAdminOperation(body)
  if (!operation) return failure(400)

  // Starting is the only administration command that executes a scenario. If both execution
  // planes are dark, reject before credential work. Create/inspect/approve and emergency stop stay
  // available so a gate cannot strand an active run.
  if (
    operation.operation === 'start_run' &&
    !isResilienceScenariosEnabled() &&
    !isSecuritySimulationsEnabled()
  ) {
    return new NextResponse(null, { status: 404 })
  }

  const rawKey = credential(req)
  const actor = req.headers.get('x-miyagi-clerk-actor')
  if (!rawKey || !isVerifiedMiyagiActor(actor)) return unauthorized()
  const keyHash = hashCredential(rawKey)

  try {
    if (operation.operation === 'register_target') {
      const result = await registerScenarioTarget({ keyHash, rawKey, actor, operation })
      return result.ok ? NextResponse.json(result) : failure(result.status)
    }
    if (operation.operation === 'verify_target') {
      const result = await verifyScenarioTarget({ keyHash, rawKey, actor, operation })
      return result.ok ? NextResponse.json(result) : failure(result.status)
    }

    if (operation.operation === 'start_run') {
      const snapshot = await getScenarioAdminSnapshot(keyHash)
      if (!snapshot) return unauthorized()
      const run = snapshot.runs.find((candidate) => candidate.id === operation.runId)
      const version = snapshot.versions.find(
        (candidate) => candidate.scenarioVersionId === run?.scenarioVersionId
      )
      const kind = version?.definition.kind
      if (
        (kind === 'resilience' && !isResilienceScenariosEnabled()) ||
        (kind === 'security' && !isSecuritySimulationsEnabled()) ||
        (kind !== 'resilience' && kind !== 'security')
      ) {
        return new NextResponse(null, { status: 404 })
      }
    }

    const result = await executeScenarioAdminOperation({ keyHash, actor, operation })
    return result.ok ? NextResponse.json(result) : failure(result.status)
  } catch {
    return failure(500)
  }
}
