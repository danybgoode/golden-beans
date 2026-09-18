import 'server-only'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { cliError, cliOk, cliUserProjects, requireCliAccount } from '@/lib/cli-auth'
import { getSupabaseServiceClient } from '@/lib/supabase'

// golden-frijoles-cli · Sprint 1, Story 1.2 — `gf whoami`.
//
// The first thing an agent runs when something is wrong, so it answers the three questions that
// actually get asked: WHO am I, WHICH credential am I using, and WHAT can I reach. A CLI that can
// only say "unauthorized" burns a session on guesses (the seed's words).

export const runtime = 'nodejs'

/**
 * The account's own email address.
 *
 * Its own, and only its own — read by user id from the already-resolved credential, never from
 * anything in the request. Showing it is what makes `gf whoami` answer "am I logged in as the right
 * account?", which is the question a person with two tenants actually has.
 *
 * Returns null rather than failing the request: a `whoami` that 500s because the auth schema was
 * slow is a `whoami` that cannot do its one job, which is telling you what is wrong.
 */
async function accountEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseServiceClient().auth.admin.getUserById(userId)
    if (error) {
      console.error('[cli/whoami] email lookup failed:', error)
      return null
    }
    return data.user?.email ?? null
  } catch (err) {
    console.error('[cli/whoami] email lookup threw:', err)
    return null
  }
}

export async function GET(req: NextRequest) {
  const account = await requireCliAccount(req)
  if (account instanceof NextResponse) return account

  try {
    const [email, projects] = await Promise.all([
      accountEmail(account.userId),
      cliUserProjects(account.userId),
    ])
    return cliOk({
      account: { userId: account.userId, email },
      credential: { id: account.tokenId, label: account.tokenLabel },
      projects: projects
        .map((project) => ({ slug: project.slug, role: project.role }))
        .sort((left, right) => left.slug.localeCompare(right.slug)),
    })
  } catch (err) {
    // getUserProjects THROWS on a query failure rather than returning [], deliberately: an empty
    // list would read as "you belong to nothing", which is an authorization answer, not an outage.
    // Surfacing it as a 500 keeps that distinction all the way to the terminal.
    console.error('[cli/whoami] failed:', err)
    return cliError('server_error', 'Could not read this account right now.')
  }
}
