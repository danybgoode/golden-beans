import 'server-only'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { validateFlagKey } from '@golden-frijoles/sdk'
import { cliError, cliOk, requireCliMember } from '@/lib/cli-auth'
import { toCliFlagDetailView, toCliFlagView } from '@/lib/cli-flag-view'
import { getFlagRegistryView } from '@/lib/flag-registry'

// golden-frijoles-cli · Sprint 1, Story 1.5 — `gf flags ls` and `gf flags get`.
//
// MEMBER, not owner: the console already shows definitions and per-environment state to any member
// (`/app/flags/[projectSlug]` calls `requireProjectMembership`), and this answers a question they
// can already read. Credential enumeration stays owner-only where it belongs.
//
// Read-only, and that is asserted rather than asserted-about: there is no write in this file, and
// `gf flags diff` / `gf flags history` (Story 2.4) are served from this same GET for the same
// reason — a read verb that could write is a read verb someone will run during an incident.

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const context = await requireCliMember(req, url.searchParams.get('project'))
  if (context instanceof NextResponse) return context

  const key = url.searchParams.get('key')
  // Shape-check the key BEFORE the query. It costs nothing, and it keeps an arbitrary string out of
  // a comparison whose miss would otherwise be reported as "no such flag" — which is true but
  // unhelpful when the real answer is "that is not a flag key at all".
  if (key !== null && !validateFlagKey(key)) return cliError('invalid', `\`${key}\` is not a valid flag key.`)

  let registry: Awaited<ReturnType<typeof getFlagRegistryView>>
  try {
    registry = await getFlagRegistryView(context.projectId)
  } catch (err) {
    console.error('[cli/flags] registry read failed:', err)
    return cliError('server_error', 'Could not read this project’s flags right now.')
  }

  if (key === null) {
    return cliOk({
      project: context.projectSlug,
      flags: registry.flags.map(toCliFlagView),
      // The snapshot revision per environment. `gf flags ls` prints it because it is the number
      // every write has to carry (D10's optimistic concurrency), so an agent that read the list can
      // write without a second round-trip — and a human debugging a 409 can see what moved.
      environments: registry.environments.map((row) => ({
        environment: row.environment,
        snapshotVersion: row.snapshotVersion,
        updatedAt: row.updatedAt,
      })),
    })
  }

  const flag = registry.flags.find((candidate) => candidate.key === key)
  // "Not in this project" and "does not exist anywhere" are the same answer, as everywhere else.
  if (!flag) return cliError('not_found', `No flag \`${key}\` in \`${context.projectSlug}\`.`)

  return cliOk({
    project: context.projectSlug,
    flag: toCliFlagDetailView(flag, registry.audit),
    environments: registry.environments.map((row) => ({
      environment: row.environment,
      snapshotVersion: row.snapshotVersion,
      updatedAt: row.updatedAt,
    })),
  })
}
