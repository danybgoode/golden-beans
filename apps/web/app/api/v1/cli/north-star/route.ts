import 'server-only'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { cliError, cliOk, requireCliMember, readCliBody, requireCliOwner } from '@/lib/cli-auth'
import { listNorthStar, syncNorthStar } from '@/lib/north-star-sync'

// think-skills S3 (D6) — `gf north-star set`'s two calls: read the project's North Star, then sync a new one.
//
// ── Why a CLI route, and not the existing one (think-skills C1) ───────────────────────────────────────────────────
// `/api/v1/north-star/sync` authenticates a project INGEST key. `gf` holds a personal token (`gf_pat_…`) that signs
// its holder in to every project they belong to, and only `/api/v1/cli/*` accepts it. So this is a second door onto
// the SAME read and write (`lib/north-star-sync.ts`), not a second implementation. The gate, the token and the
// membership check are `lib/cli-auth.ts`'s, the one seam every CLI route enters through.
//
// ── MEMBER reads, OWNER writes ────────────────────────────────────────────────────────────────────────────────────
// The console shows the North Star to any member, so the dry run's read is a member's. Syncing redefines what the
// whole project is measured by, which is a definition write like a flag write, so it is owner-only, and a member gets
// the same 404 a stranger gets.
//
// ── The tenant comes from the credential ──────────────────────────────────────────────────────────────────────────
// The `project` slug only selects among projects the token's holder is already a member of (`requireCliMember`). The
// `projectId` every query is scoped to is resolved from that membership, never read from the request.

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const context = await requireCliMember(req, url.searchParams.get('project'))
  if (context instanceof NextResponse) return context

  const metrics = await listNorthStar(context.projectId)
  if (metrics === null) return cliError('server_error', 'Could not read this project’s North Star right now.')
  return cliOk({ project: context.projectSlug, metrics })
}

export async function POST(req: NextRequest) {
  const input = await readCliBody(req)
  if (input instanceof NextResponse) return input

  const context = await requireCliOwner(req, typeof input.project === 'string' ? input.project : null)
  if (context instanceof NextResponse) return context

  // The payload travels under `sync`, apart from `project`, so a field named `project` can never be mistaken for part
  // of the North Star, and the schema sees exactly what the workshop file holds.
  const result = await syncNorthStar(context.projectId, input.sync)
  if (!result.ok) {
    if (result.status === 400)
      return cliError('invalid', result.error, 'issues' in result ? { issues: result.issues } : undefined)
    return cliError('server_error', result.error)
  }
  return cliOk({ project: context.projectSlug, metric: result.metric, inputsSynced: result.inputsSynced })
}
