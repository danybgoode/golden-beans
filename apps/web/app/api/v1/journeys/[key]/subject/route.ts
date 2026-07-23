import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { isValidOpaqueId } from '@/lib/event-context'
import { isJourneyProjectionsEnabled } from '@/lib/flags'
import { validateJourneyKey } from '@/lib/journey-definition'
import { getJourneySubjectByProjectId } from '@/lib/journey-query'

// GET /api/v1/journeys/:key/subject?subjectId=<opaque>&version=<positive integer>
// `subjectId` stays a query input: it is data, not a route hierarchy/tenant identifier. Tenant
// identity comes exclusively from the resolved API key; the key is project-scoped again in every
// resolver query below.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  // Gate first so disabled seams reveal neither credentials nor registry existence.
  if (!isJourneyProjectionsEnabled()) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { key } = await params
  if (!validateJourneyKey(key)) {
    return NextResponse.json({ ok: false, error: 'journey key must be 1-64 characters of lower_snake_case' }, { status: 400 })
  }

  const subjectId = req.nextUrl.searchParams.get('subjectId')
  if (!isValidOpaqueId(subjectId)) {
    return NextResponse.json({ ok: false, error: 'subjectId must be a valid opaque subject id' }, { status: 400 })
  }
  const rawVersion = req.nextUrl.searchParams.get('version')
  const version = rawVersion === null ? Number.NaN : Number(rawVersion)
  if (!Number.isSafeInteger(version) || version < 1 || String(version) !== rawVersion) {
    return NextResponse.json({ ok: false, error: 'version must be a positive integer' }, { status: 400 })
  }
  const result = await getJourneySubjectByProjectId(auth.projectId, key, version, subjectId)
  if (!result.ok) {
    if (result.reason === 'query_failed') {
      return NextResponse.json({ ok: false, error: 'Journey projection lookup failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: false, error: result.reason === 'journey_not_found' ? `Unknown journey: ${key}` : `Unknown journey version: ${version}` }, { status: 404 })
  }

  return NextResponse.json({ ok: true, journey: result.journey, subject: result.subject })
}
