// golden-frijoles-cli · Sprint 1, Story 1.5 — `gf doctor`.
//
// ── What this verb is for ─────────────────────────────────────────────────────────────────────
// The seed's words: *"an agent that can't tell WHY it's unauthenticated burns a whole session
// guessing."* So `doctor` runs the checks in dependency order and reports every one of them —
// including the ones it could not run, and why — rather than stopping at the first failure with a
// single sentence.
//
// ── It requires no credential, and that is load-bearing ───────────────────────────────────────
// `needsAuth: false`. The dispatcher refusing this verb for want of a credential would make the
// tool useless exactly when it is needed: diagnosing a missing credential.
//
// ── It NEVER prints key material ──────────────────────────────────────────────────────────────
// Not the token, not a prefix, not a length. `doctor` output is the thing people paste into an
// issue, and `cli.test.ts`'s "gf doctor never prints key material, in either mode" asserts that a
// known token string appears nowhere in its output — a claim about a security property gets an
// assertion, not a comment. (That citation named a `doctor.test.ts` which does not exist; a
// pointer to a missing guard is how the next reader concludes there isn't one.)

import { existsSync } from 'node:fs'
import { flagValue } from '../args'
import type { Command, CommandContext } from '../command'
import { CLI_TOKEN_FORMAT, credentialsPath, readCredentials } from '../credentials'
import { EXIT, type ExitCode } from '../exit-codes'
import { pad } from '../output'
import { VERSION } from '../version'

export type CheckStatus = 'ok' | 'fail' | 'warn' | 'skipped'
export type Check = {
  id: string
  status: CheckStatus
  /** One sentence a person can act on. Never "something went wrong". */
  detail: string
}

type WhoamiBody = {
  account: { userId: string; email: string | null }
  credential: { id: string; label: string }
  projects: Array<{ slug: string; role: string }>
}

export const doctorCommand: Command = {
  path: ['doctor'],
  summary: 'why is it not working — every check, in order',
  usage: 'gf doctor [--json]',
  needsAuth: false,
  detail: `Runs whether or not you are logged in — diagnosing a missing credential is the
  point. Prints no key material in either mode.

  Exits 0 when every check that could run passed, and non-zero naming the first that did not.`,
  flags: [{ name: 'project', value: '<slug>', describe: 'check this project instead of the remembered one' }],
  async run(context): Promise<ExitCode> {
    const checks: Check[] = []
    const path = credentialsPath(context.env)

    // ── 1. is there a credential at all, and where did it come from ───────────────────────────
    const fileExists = existsSync(path)
    const parsedFile = readCredentials(context.env)
    if (fileExists && parsedFile === null) {
      // The one case where "no credential" has a different remedy: the file is there and unusable.
      // Collapsing it into "not logged in" sends someone to `gf login` when the answer may be a
      // half-written file from an interrupted paste.
      checks.push({
        id: 'credentials-file',
        status: 'fail',
        detail: `${path} exists but could not be read as a credential. Delete it and run \`gf login\`.`,
      })
    } else if (fileExists) {
      checks.push({ id: 'credentials-file', status: 'ok', detail: `Readable at ${path}.` })
    } else {
      checks.push({
        id: 'credentials-file',
        status: context.auth.source === 'env' ? 'skipped' : 'warn',
        detail:
          context.auth.source === 'env'
            ? `No file at ${path} — GOLDEN_FRIJOLES_TOKEN is in use, which is the CI path.`
            : `No file at ${path}. Run \`gf login\`.`,
      })
    }

    if (context.auth.token === null) {
      checks.push({
        id: 'credential',
        status: 'fail',
        detail: 'No credential. Run `gf login`, or set GOLDEN_FRIJOLES_TOKEN.',
      })
      return report(context, checks)
    }
    checks.push({
      id: 'credential',
      status: 'ok',
      // The SOURCE, never the value.
      detail: `Found, from ${describeSource(context.auth.source)}.`,
    })

    // ── 2. does it even look like one ─────────────────────────────────────────────────────────
    // A local shape check, before the network, so a truncated paste is named as a truncated paste
    // rather than as a rejected credential — different remedies, and the server cannot tell them
    // apart because it deliberately answers both the same way.
    if (!CLI_TOKEN_FORMAT.test(context.auth.token)) {
      checks.push({
        id: 'credential-shape',
        status: 'fail',
        detail: 'That credential is not shaped like a CLI token (`gf_pat_…`). It may have been truncated.',
      })
      return report(context, checks)
    }
    checks.push({ id: 'credential-shape', status: 'ok', detail: 'Shaped like a CLI token.' })

    // ── 3. is the deployment reachable, and does it have the CLI API ──────────────────────────
    const whoami = await context.api!.get<WhoamiBody>('api/v1/cli/whoami')
    if (whoami.kind === 'network') {
      checks.push({ id: 'api-reachable', status: 'fail', detail: whoami.message })
      return report(context, checks)
    }
    if (whoami.kind === 'error' && whoami.code === 'disabled') {
      checks.push({
        id: 'api-reachable',
        status: 'fail',
        detail: `${context.api!.baseUrl} answers, but its CLI API is switched off (CLI_WRITE_API_ENABLED=false).`,
      })
      return report(context, checks)
    }
    if (whoami.kind === 'error' && whoami.code === 'unauthorized') {
      checks.push({ id: 'api-reachable', status: 'ok', detail: `${context.api!.baseUrl} answers.` })
      checks.push({
        id: 'credential-accepted',
        status: 'fail',
        // Unknown, revoked and expired are one answer at the server by design, so `doctor` must not
        // invent a distinction it cannot have. It names all three and one remedy that covers them.
        detail:
          'The deployment rejected this credential — unknown, revoked or expired. Mint a new one at /app/setup/cli.',
      })
      return report(context, checks)
    }
    if (whoami.kind === 'error') {
      checks.push({
        id: 'api-reachable',
        status: 'fail',
        detail: `${context.api!.baseUrl} answered ${whoami.status}: ${whoami.message}`,
      })
      return report(context, checks)
    }

    checks.push({ id: 'api-reachable', status: 'ok', detail: `${context.api!.baseUrl} answers.` })
    checks.push({
      id: 'credential-accepted',
      status: 'ok',
      detail: `Signed in as ${whoami.body.account.email ?? whoami.body.account.userId} (${whoami.body.credential.label}).`,
    })

    // ── 4. is the active project one this credential can reach ────────────────────────────────
    const wanted = flagValue(context.args, 'project')?.trim() || context.auth.activeProject
    if (!wanted) {
      checks.push({
        id: 'active-project',
        status: 'warn',
        detail: 'No project chosen. Run `gf projects use <slug>` or pass --project.',
      })
    } else if (whoami.body.projects.some((project) => project.slug === wanted)) {
      checks.push({ id: 'active-project', status: 'ok', detail: `\`${wanted}\` is reachable.` })
    } else {
      checks.push({
        id: 'active-project',
        status: 'fail',
        detail:
          `\`${wanted}\` is not a project this credential can reach. ` +
          `Available: ${whoami.body.projects.map((project) => project.slug).join(', ') || 'none'}.`,
      })
    }

    // ── 5. is this CLI current ────────────────────────────────────────────────────────────────
    checks.push(await versionCheck(context.fetchImpl))

    return report(context, checks)
  },
}

/**
 * Is a newer `@golden-frijoles/cli` published?
 *
 * ⚠️ It takes the run's `fetchImpl` rather than calling the global `fetch`. A direct call made
 * every `doctor` test reach registry.npmjs.org for real, and left this check unassertable — the
 * same second-HTTP-path defect `init.ts`'s `probeFlagReadKey` records having already made once.
 *
 * ⚠️ A `warn` or a `skipped`, NEVER a `fail`. The registry is a third party: an offline machine, a
 * corporate proxy or an npm outage must not make `gf doctor` report that the CLI is broken. Being
 * unable to check is a different fact from being out of date, and this reports which.
 */
async function versionCheck(fetchImpl: typeof fetch): Promise<Check> {
  try {
    const response = await fetchImpl('https://registry.npmjs.org/@golden-frijoles/cli/latest', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) return { id: 'cli-version', status: 'skipped', detail: `Running ${VERSION}. Could not reach the npm registry to compare.` }
    const body = (await response.json()) as { version?: string }
    const latest = typeof body.version === 'string' ? body.version : null
    if (!latest) return { id: 'cli-version', status: 'skipped', detail: `Running ${VERSION}. The registry gave no version to compare.` }
    return latest === VERSION
      ? { id: 'cli-version', status: 'ok', detail: `Running ${VERSION}, the latest.` }
      : {
          id: 'cli-version',
          status: 'warn',
          detail: `Running ${VERSION}; ${latest} is published. Update with \`npm i -g @golden-frijoles/cli\`.`,
        }
  } catch {
    return { id: 'cli-version', status: 'skipped', detail: `Running ${VERSION}. Could not reach the npm registry to compare.` }
  }
}

function describeSource(source: string): string {
  if (source === 'env') return 'GOLDEN_FRIJOLES_TOKEN'
  if (source === 'flag') return '--token'
  return 'the saved credentials file'
}

/**
 * Print every check and choose the exit code.
 *
 * A `warn` does NOT fail. "No project chosen" and "a newer CLI exists" are both things a caller may
 * legitimately be living with, and a doctor that exits non-zero for them is a doctor whose exit code
 * nobody can put in a CI step.
 */
function report(context: CommandContext, checks: Check[]): ExitCode {
  const failed = checks.find((check) => check.status === 'fail')
  context.emit.ok(
    { checks, healthy: failed === undefined },
    checks
      .map((check) => `${symbol(check.status)} ${pad(check.id, 20)} ${check.detail}`)
      .join('\n')
  )
  if (!failed) return EXIT.OK
  // The failing check decides the code, so a caller branching on it gets the same vocabulary the
  // other verbs use rather than a doctor-specific number.
  if (failed.id === 'api-reachable') return EXIT.SERVER
  if (failed.id === 'active-project') return EXIT.NOT_FOUND
  return EXIT.AUTH
}

function symbol(status: CheckStatus): string {
  if (status === 'ok') return 'ok  '
  if (status === 'fail') return 'FAIL'
  if (status === 'warn') return 'warn'
  return 'skip'
}
