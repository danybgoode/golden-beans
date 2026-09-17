// golden-frijoles-cli · Sprint 1, Story 1.2 — `gf login`, `gf logout`, `gf whoami`.

import { flagValue } from '../args'
import type { Command, CommandContext } from '../command'
import {
  credentialsPath,
  normalizeApiUrl,
  readCredentials,
  writeCredentials,
  DEFAULT_API_URL,
} from '../credentials'
import { EXIT, exitForServerCode, type ExitCode } from '../exit-codes'
import { table } from '../output'

type WhoamiBody = {
  account: { userId: string; email: string | null }
  credential: { id: string; label: string }
  projects: Array<{ slug: string; role: string }>
}

/**
 * Read a token from stdin when `--token` was not given.
 *
 * ⚠️ **stdin, not `argv`, and not a prompt with echo.** A token in `argv` is readable by every
 * process on the machine (`ps`) and lands in shell history; the shaping listed key material on disk
 * as a rabbit hole and this is the same hazard one step earlier. Piping (`… | gf login`) is the CI
 * shape and works identically.
 */
async function readTokenFromStdin(context: CommandContext): Promise<string | null> {
  // ⚠️ **The `--json` branch used to only SUPPRESS the prompt, and then read stdin anyway** (fresh
  // reviewer, PR #149, graded Blocking). On an interactive terminal `gf login --json` printed
  // nothing at all and blocked until the user guessed at Ctrl-D — strictly worse than the
  // non-`--json` path it was meant to improve on, and on the credential-entry path. The comment
  // above it claimed it returned a usage error. It did not.
  //
  // Now the two conditions are separate facts and both are acted on:
  //   • nothing is piped AND there is no one to ask (`--json`) ⇒ return null, the caller exits 1
  //   • nothing is piped and there IS someone to ask ⇒ prompt, then read
  //   • something is piped ⇒ read it, prompt or not. This is the CI shape and must never block.
  if (process.stdin.isTTY) {
    if (context.emit.json) return null
    context.emit.note('Paste your CLI token and press Enter:')
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  const value = Buffer.concat(chunks).toString('utf8').trim()
  return value === '' ? null : value
}

export const loginCommand: Command = {
  path: ['login'],
  summary: 'save a CLI token for this machine',
  usage: 'gf login [--token <token>] [--api <url>]',
  needsAuth: false,
  detail: `Mint a token at /app/setup/cli in the console, then paste it here.

  With no --token, the token is read from STDIN — so it never appears in your shell
  history or in \`ps\`. For CI, set GOLDEN_FRIJOLES_TOKEN instead and skip this verb;
  nothing is written to disk in that case.`,
  flags: [
    { name: 'token', value: '<token>', describe: 'the token, instead of reading stdin' },
    { name: 'api', value: '<url>', describe: `the deployment (default: ${DEFAULT_API_URL})` },
  ],
  async run(context): Promise<ExitCode> {
    const token = flagValue(context.args, 'token')?.trim() || (await readTokenFromStdin(context))
    if (!token) {
      context.emit.fail('invalid', 'No token supplied. Pass --token, or pipe one into `gf login`.')
      return EXIT.USAGE
    }

    const apiUrl = normalizeApiUrl(
      flagValue(context.args, 'api')?.trim() || context.env.GOLDEN_FRIJOLES_URL?.trim() || DEFAULT_API_URL
    )

    // ⚠️ VERIFY before saving. Writing an unverified token produces a credentials file that looks
    // fine and fails on every later command with an error about that command — which is how someone
    // spends an afternoon debugging `gf flags ls` when the real answer is "that paste was truncated".
    const probe = await context.clientFor(token).get<WhoamiBody>('api/v1/cli/whoami')
    if (probe.kind === 'network') {
      context.emit.fail('server_error', probe.message)
      return EXIT.SERVER
    }
    if (probe.kind === 'error') {
      context.emit.fail(probe.code, probe.message)
      return exitForServerCode(probe.code)
    }

    const existing = readCredentials(context.env)
    const path = writeCredentials(
      {
        token,
        apiUrl,
        // Keep the active project only if it is still one this account can reach. A token swapped
        // for a different account would otherwise leave `gf flags ls` pointed at a project the new
        // credential 404s on, and the error would name the flag rather than the stale selection.
        activeProject: probe.body.projects.some((project) => project.slug === existing?.activeProject)
          ? existing?.activeProject
          : probe.body.projects[0]?.slug,
      },
      context.env
    )

    context.emit.ok(
      {
        account: probe.body.account,
        apiUrl,
        credentialsPath: path,
        projects: probe.body.projects,
      },
      `Signed in as ${probe.body.account.email ?? probe.body.account.userId} on ${apiUrl}.\n` +
        `Saved to ${path} (mode 0600).`
    )
    return EXIT.OK
  },
}

export const logoutCommand: Command = {
  path: ['logout'],
  summary: 'forget the saved token on this machine',
  usage: 'gf logout',
  needsAuth: false,
  detail: `Removes the local credential only. It does NOT revoke the token — anything else
  holding it still works. Revoke at /app/setup/cli when that is what you mean.`,
  flags: [],
  async run(context): Promise<ExitCode> {
    const path = credentialsPath(context.env)
    if (!readCredentials(context.env)) {
      context.emit.ok({ removed: false, credentialsPath: path }, 'No saved credential to remove.')
      return EXIT.OK
    }
    // Overwritten with an empty token rather than unlinked: `readCredentials` treats it as "not
    // logged in", the file keeps its 0600 mode, and `gf doctor` can still report where it looked.
    writeCredentials({ token: '', apiUrl: DEFAULT_API_URL }, context.env)
    context.emit.ok(
      { removed: true, credentialsPath: path },
      `Removed the saved credential from ${path}. The token itself is NOT revoked — revoke it at /app/setup/cli.`
    )
    return EXIT.OK
  },
}

export const whoamiCommand: Command = {
  path: ['whoami'],
  summary: 'the account, the credential and the projects it reaches',
  usage: 'gf whoami [--json]',
  needsAuth: true,
  flags: [],
  async run(context): Promise<ExitCode> {
    const result = await context.api!.get<WhoamiBody>('api/v1/cli/whoami')
    if (result.kind === 'network') {
      context.emit.fail('server_error', result.message)
      return EXIT.SERVER
    }
    if (result.kind === 'error') {
      context.emit.fail(result.code, result.message)
      return exitForServerCode(result.code)
    }

    const { account, credential, projects } = result.body
    context.emit.ok(
      {
        account,
        // The credential's id and LABEL. Never the token — `gf doctor`'s rule applies here too, and
        // `whoami` is the command most likely to be pasted into an issue.
        credential,
        apiUrl: context.api!.baseUrl,
        tokenSource: context.auth.source,
        activeProject: context.auth.activeProject,
        projects,
      },
      [
        `${account.email ?? account.userId}  on ${context.api!.baseUrl}`,
        `credential: ${credential.label} (from ${describeSource(context.auth.source)})`,
        `active project: ${context.auth.activeProject ?? 'none — run `gf projects use <slug>`'}`,
        '',
        table(
          ['PROJECT', 'ROLE'],
          projects.map((project) => [
            project.slug + (project.slug === context.auth.activeProject ? ' *' : ''),
            project.role,
          ])
        ),
      ].join('\n')
    )
    return EXIT.OK
  },
}

function describeSource(source: string): string {
  if (source === 'env') return 'GOLDEN_FRIJOLES_TOKEN'
  if (source === 'flag') return '--token'
  if (source === 'file') return 'the saved credentials file'
  return 'nowhere'
}
