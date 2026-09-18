import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { isCliWriteApiEnabled } from './flags'
import { resolveCliToken, touchCliToken } from './cli-tokens'
import { getMembership, getUserProjects, type MemberProject } from './membership'
import { isOwner } from './roles'

// golden-frijoles-cli · Sprint 1 — the ONE authorization seam every `/api/v1/cli/*` route enters
// through. There is no second path into these routes and there must not be one.
//
// ── The order is the design, and it is the same order the connector route uses ────────────────
//   gate -> credential shape -> resolve -> (per request) membership
//
// The **gate first**, before any credential-derived work, so `CLI_WRITE_API_ENABLED=false` is a
// real whole-surface kill switch and never becomes a credential-validity oracle: with the surface
// off, a valid token and a garbage one get the identical 404. Every gated route in this repo is
// written this way (`flags/snapshot`, `flags/sync`, the MCP connector) and it is the property that
// breaks first if someone "simplifies" by checking auth before the flag.
//
// ── What a CLI token is allowed to do, in one sentence ────────────────────────────────────────
// Exactly what its holder's console session is allowed to do. `requireCliMember` and
// `requireCliOwner` below call the SAME `getMembership` / `isOwner` that `lib/dashboard-auth.ts`
// calls for a browser session. The PAT replaces the cookie; it does not replace the check.
//
// ── "Not yours" and "not there" are the same answer ───────────────────────────────────────────
// A slug the caller is not a member of returns 404, never 403 — the rule `requireProjectMembership`
// states and AGENTS #10 requires. A 403 would confirm that a foreign project exists, which is how
// slug-guessing becomes tenant enumeration.

/** The machine-readable error envelope. Every non-2xx from a CLI route has exactly this shape. */
export type CliErrorBody = { ok: false; error: string; code: CliErrorCode }

/**
 * The error vocabulary `packages/cli` switches on to pick an exit code.
 *
 * A STRING code, carried beside the human sentence, because D5's whole point is that an agent must
 * never have to match on prose: `error` may be reworded by a copy edit, `code` may not.
 */
export type CliErrorCode = 'disabled' | 'unauthorized' | 'not_found' | 'invalid' | 'conflict' | 'server_error'

const STATUS_BY_CODE: Record<CliErrorCode, number> = {
  disabled: 404,
  unauthorized: 401,
  not_found: 404,
  invalid: 400,
  conflict: 409,
  server_error: 500,
}

/**
 * `extra` carries machine-readable detail beside the sentence — `issues`, the flag parser's own
 * list of what is wrong with a definition.
 *
 * It is a separate parameter rather than something a caller folds into `error`, because the CLI
 * prints those messages verbatim and an agent branches on them. Concatenating them into the
 * sentence would turn a list into prose, which is the direction D5 exists to stop.
 */
export function cliError(
  code: CliErrorCode,
  error: string,
  extra?: Record<string, unknown>
): NextResponse<CliErrorBody> {
  return NextResponse.json(
    { ok: false as const, error, code, ...extra },
    { status: STATUS_BY_CODE[code], headers: { 'Cache-Control': 'no-store' } }
  )
}

export function cliOk<T extends Record<string, unknown>>(body: T): NextResponse {
  return NextResponse.json({ ok: true as const, ...body }, { headers: { 'Cache-Control': 'no-store' } })
}

function bearer(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  return authorization.slice('Bearer '.length).trim() || null
}

/**
 * Unknown, malformed, revoked, expired and "belongs to a deleted account" are ONE answer.
 *
 * A CLI that could tell them apart would let an attacker confirm that a stolen token was once real,
 * and `gf doctor` does not need the distinction — "your credential is not accepted; log in again"
 * is the same remedy for all of them.
 */
function unauthorized() {
  return cliError('unauthorized', 'This CLI credential is not accepted. Run `gf login` again.')
}

export type CliAccount = { userId: string; tokenId: string; tokenLabel: string }

/**
 * Gate + authenticate. The entry point for a route that needs an account but no project.
 *
 * Returns either the account or a `Response` the route returns verbatim — the shape the MCP
 * connector's `gate()` uses, so a route cannot accidentally proceed past a refusal by forgetting to
 * check a boolean.
 */
export async function requireCliAccount(req: NextRequest): Promise<CliAccount | NextResponse> {
  // ⚠️ FIRST. See this module's header — moving this below the credential work turns OFF into an
  // oracle for whether a token is valid.
  if (!isCliWriteApiEnabled()) return cliError('disabled', 'The CLI API is not available here.')

  const token = bearer(req)
  if (!token) return unauthorized()

  const resolved = await resolveCliToken(token)
  if (!resolved.ok) {
    // A database outage is NOT "your credential is dead". An agent told its credential is dead goes
    // and mints another one; an agent told the server is unwell retries. Different code, different
    // status, deliberately.
    if (resolved.reason === 'query_failed')
      return cliError('server_error', 'Could not verify this credential right now. Try again.')
    return unauthorized()
  }

  await touchCliToken(resolved.tokenId)
  return { userId: resolved.userId, tokenId: resolved.tokenId, tokenLabel: resolved.label }
}

export type CliProjectContext = CliAccount & { projectId: string; projectSlug: string; role: string }

/**
 * Gate + authenticate + require MEMBERSHIP of `slug`.
 *
 * `slug` comes from the request (a query parameter or a body field) and is used ONLY to look up a
 * membership row for the already-resolved `userId`. The tenant is therefore still resolved
 * server-side from a credential — the request selects among projects the caller already has, it
 * never selects the tenant. That is the distinction `lib/active-project.ts` documents at length,
 * and the reason a slug in the query string is not a violation of AGENTS #10.
 */
export async function requireCliMember(
  req: NextRequest,
  slug: string | null | undefined
): Promise<CliProjectContext | NextResponse> {
  const account = await requireCliAccount(req)
  if (account instanceof NextResponse) return account
  if (!slug || typeof slug !== 'string')
    return cliError('invalid', 'Name a project with --project, or set one with `gf projects use`.')

  const membership = await getMembership(account.userId, slug)
  // Not a member and no such project are indistinguishable — see this module's header.
  if (!membership) return cliError('not_found', `No project \`${slug}\` is available to this account.`)

  return { ...account, projectId: membership.projectId, projectSlug: slug, role: membership.role }
}

/**
 * Gate + authenticate + require OWNERSHIP of `slug`.
 *
 * Credential administration — minting an ingest key, a `flag_read` key or a `flag_sync` key — is
 * owner-only, exactly as it is in the console (`requireProjectOwnership`). A member who is not an
 * owner gets the same 404 a non-member gets, which is consistent with every other "you may not see
 * this" answer in this codebase.
 */
export async function requireCliOwner(
  req: NextRequest,
  slug: string | null | undefined
): Promise<CliProjectContext | NextResponse> {
  const context = await requireCliMember(req, slug)
  if (context instanceof NextResponse) return context
  if (!isOwner({ projectId: context.projectId, role: context.role }))
    return cliError('not_found', `No project \`${slug}\` is available to this account.`)
  return context
}

/** The caller's memberships, for `gf whoami` and `gf projects ls`. */
export async function cliUserProjects(userId: string): Promise<MemberProject[]> {
  return getUserProjects(userId)
}
