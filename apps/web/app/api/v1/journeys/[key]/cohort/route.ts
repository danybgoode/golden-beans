import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { parseJourneyCohortRequest } from '@/lib/journey-cohort-request'
import { isJourneyProjectionsEnabled } from '@/lib/flags'
import { validateJourneyKey } from '@/lib/journey-definition'
import { getJourneyCohortByProjectId } from '@/lib/journey-query'

// GET /api/v1/journeys/:key/cohort?version=1&from=<offset>&to=<offset>&timezone=UTC
// API credentials resolve the only project id accepted by the shared cohort resolver.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!isJourneyProjectionsEnabled()) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }
  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { key } = await params
  if (!validateJourneyKey(key)) {
    return NextResponse.json(
      { ok: false, error: 'journey key must be 1-64 characters of lower_snake_case' },
      { status: 400 },
    )
  }
  const parsed = parseJourneyCohortRequest({
    version: req.nextUrl.searchParams.get('version'),
    from: req.nextUrl.searchParams.get('from'),
    to: req.nextUrl.searchParams.get('to'),
    asOf: req.nextUrl.searchParams.get('asOf'),
    timezone: req.nextUrl.searchParams.get('timezone'),
    staleAfterHours: req.nextUrl.searchParams.get('staleAfterHours'),
    drilldown: req.nextUrl.searchParams.get('drilldown'),
    cursor: req.nextUrl.searchParams.get('cursor'),
    pageSize: req.nextUrl.searchParams.get('pageSize'),
  })
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })

  const result = await getJourneyCohortByProjectId(
    auth.projectId,
    key,
    parsed.version,
    parsed.options,
  )
  if (!result.ok) {
    if (result.reason === 'resource_limit') {
      return NextResponse.json(
        { ok: false, error: 'Journey cohort exceeds the query-time safety limit' },
        { status: 422 },
      )
    }
    if (result.reason === 'query_failed') {
      return NextResponse.json({ ok: false, error: 'Journey cohort lookup failed' }, { status: 500 })
    }
    return NextResponse.json(
      {
        ok: false,
        error: result.reason === 'journey_not_found'
          ? `Unknown journey: ${key}`
          : `Unknown journey version: ${parsed.version}`,
      },
      { status: 404 },
    )
  }
  return NextResponse.json(result)
}
