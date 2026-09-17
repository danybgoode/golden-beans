import 'server-only'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { cliError, cliOk, cliUserProjects, requireCliAccount } from '@/lib/cli-auth'
import { provisionTenantForUser } from '@/lib/provisioning'
import { getSupabaseServiceClient } from '@/lib/supabase'

// golden-frijoles-cli · Sprint 1, Story 1.3 — `gf projects ls` and `gf projects create`.
//
// ── D9, and why `create` is an ENSURE ─────────────────────────────────────────────────────────
// `projects_one_per_creator_idx` (20260721100000_self_serve_tenants.sql) is a partial UNIQUE index
// on `projects(created_by)`: a self-serve account owns exactly ONE project, enforced by the
// database. It is a signup-race guard — two confirmed callbacks from a double-clicked confirmation
// link would otherwise both observe "no membership" and both create a project — not a plan limit,
// and dropping it would reopen the race a cross-review closed.
//
// So there is no second project for this route to create. What it does instead is the genuinely
// useful thing: it calls the SAME `provisionTenantForUser` the auth callback calls, which is
// idempotent, and reports `created: false` with the existing slug when there is one. That covers
// the state that IS reachable — `?provision=failed`, an account whose membership insert failed —
// and it is honest about the ceiling instead of pretending to a create that cannot happen.
//
// `gf projects use` is a CLIENT-side concept: it records the active project in the credentials
// file. There is nothing to store server-side, which is why there is no route for it.

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const account = await requireCliAccount(req)
  if (account instanceof NextResponse) return account
  try {
    const projects = await cliUserProjects(account.userId)
    return cliOk({
      projects: projects
        .map((project) => ({ slug: project.slug, role: project.role }))
        .sort((left, right) => left.slug.localeCompare(right.slug)),
    })
  } catch (err) {
    console.error('[cli/projects] list failed:', err)
    return cliError('server_error', 'Could not read your projects right now.')
  }
}

/**
 * The account's email, which `provisionTenantForUser` needs to SUGGEST a slug.
 *
 * Read from the auth record by user id, never accepted from the request body. A caller-supplied
 * email here would let someone steer another account's slug — and, worse, hand the provisioner an
 * address that does not belong to the credential it is provisioning for.
 */
async function accountEmail(userId: string): Promise<string | null> {
  const { data, error } = await getSupabaseServiceClient().auth.admin.getUserById(userId)
  if (error || !data.user?.email) {
    console.error('[cli/projects] email lookup failed:', error)
    return null
  }
  return data.user.email
}

export async function POST(req: NextRequest) {
  const account = await requireCliAccount(req)
  if (account instanceof NextResponse) return account

  const email = await accountEmail(account.userId)
  // FAIL CLOSED on an unreadable account rather than provisioning with a placeholder address: the
  // email decides the slug, and a generated tenant nobody recognises is unrecoverable-by-user in
  // exactly the way `provisionTenantForUser`'s own idempotency gate is careful to avoid.
  if (!email) return cliError('server_error', 'Could not read this account right now.')

  const result = await provisionTenantForUser(account.userId, email)
  if (!result.ok) return cliError('server_error', result.error)

  // `plaintextKey` is deliberately NOT returned. It is a full ingest credential, and the CLI has
  // `gf keys create --type ingest` for that with its own confirmation and its own audit row. A
  // verb whose job is "make sure I have a project" must not silently also mint a credential into a
  // terminal's scrollback.
  return cliOk({ created: result.created, slug: result.projectSlug })
}
