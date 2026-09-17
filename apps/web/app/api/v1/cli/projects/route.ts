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
// So there is no second project for this route to create. What it does instead is call the SAME
// idempotent `provisionTenantForUser` the auth callback calls, and report `created: false` with the
// existing slug when there is one.
//
// ⚠️ **An earlier version of this comment claimed it recovers the `?provision=failed` state. That
// was FALSE, and it is the exact defect CODE-QUALITY #3 exists to catch** (cross-family review,
// Codex, PR #149, graded Blocking). Reaching this route needs a CLI token; minting a CLI token needs
// `/app/setup/cli/<slug>`, which needs a membership — so an account with NO project can never call
// it. The prose asserted a capability the code does not have.
//
// **There is no deadlock, and that is why this is a comment fix rather than a new route.** The
// token is minted in a BROWSER either way, and `/app` redirects any project-less signed-in user
// straight to `/app/provision`, which retries provisioning and hands back the same first-run
// experience. A project-less user arriving to mint a token is provisioned before they get there;
// if provisioning genuinely fails they land on `/app?provision=failed` with no tenant, and a CLI
// that could talk to that account would have nothing to talk about.
//
// What this verb IS for: a script saying "make sure I have a project before I init", idempotently,
// without parsing `gf projects ls`. Recovery from a failed provision is a browser task at `/app`.
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
