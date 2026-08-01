import { NextRequest, NextResponse } from 'next/server'
import {
  FLAG_DEFINITION_SYNC_CONTRACT_VERSION,
  MAX_FLAG_DEFINITION_SYNC_BODY_BYTES,
  parseFlagDefinitionSyncRequest,
} from '@golden-beans/sdk'
import { hashCredential } from '@/lib/credential-hash'
import { isFlagDefinitionSyncEnabled } from '@/lib/flags'
import { syncFlagDefinitionCatalog } from '@/lib/flag-sync-operations'

function credential(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const value = authorization.slice('Bearer '.length).trim()
  return value || null
}

async function readBoundedBody(
  req: NextRequest
): Promise<{ ok: true; body: string } | { ok: false; reason: 'invalid' | 'too_large' }> {
  const contentLength = req.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^[0-9]+$/.test(contentLength)) return { ok: false, reason: 'invalid' }
    if (Number(contentLength) > MAX_FLAG_DEFINITION_SYNC_BODY_BYTES) return { ok: false, reason: 'too_large' }
  }
  if (!req.body) return { ok: true, body: '' }

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_FLAG_DEFINITION_SYNC_BODY_BYTES) {
        await reader.cancel()
        return { ok: false, reason: 'too_large' }
      }
      chunks.push(next.value)
    }
  } catch {
    return { ok: false, reason: 'invalid' }
  } finally {
    // cancel() retains the reader lock in the WHATWG/Node implementation, but keep cleanup safe
    // if another runtime has already released it while aborting an oversized upload.
    try {
      if (req.body.locked) reader.releaseLock()
    } catch {
      // Cleanup is best-effort; an aborted body must retain the 400/413 response chosen above.
    }
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { ok: true, body }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}

function unauthorized() {
  // Unknown, revoked, expired and every other credential scope remain indistinguishable.
  return NextResponse.json({ ok: false, error: 'Invalid flag definition sync credential' }, { status: 401 })
}

export async function POST(req: NextRequest) {
  // The gate intentionally precedes header and body work. OFF is a real whole-route kill switch,
  // not a credential-validity or payload-shape oracle, and is independent from snapshot serving.
  if (!isFlagDefinitionSyncEnabled()) return new NextResponse(null, { status: 404 })

  const rawKey = credential(req)
  if (!rawKey) return unauthorized()
  const rawBody = await readBoundedBody(req)
  if (!rawBody.ok) {
    return NextResponse.json(
      { ok: false, error: rawBody.reason === 'too_large' ? 'Flag catalog sync payload is too large' : 'Invalid flag definition sync payload' },
      { status: rawBody.reason === 'too_large' ? 413 : 400 }
    )
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody.body)
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid flag definition sync payload' }, { status: 400 })
  }
  const parsed = parseFlagDefinitionSyncRequest(body)
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: 'Invalid flag definition sync payload', issues: parsed.errors },
      { status: 400 }
    )
  }

  const result = await syncFlagDefinitionCatalog({
    keyHash: hashCredential(rawKey),
    entries: parsed.request.entries,
  })
  if (!result.ok) {
    if (result.status === 401) return unauthorized()
    if (result.status === 409)
      return NextResponse.json(
        { ok: false, error: 'Flag catalog conflicts with an existing definition.' },
        { status: 409 }
      )
    if (result.status === 400)
      return NextResponse.json({ ok: false, error: 'Invalid flag definition sync payload' }, { status: 400 })
    return NextResponse.json({ ok: false, error: 'Could not sync flag definitions' }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    contractVersion: FLAG_DEFINITION_SYNC_CONTRACT_VERSION,
    entries: result.entries,
  })
}
