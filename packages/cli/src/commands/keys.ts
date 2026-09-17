// golden-frijoles-cli · Sprint 2, Story 2.6 — `gf keys ls | create | revoke`.
//
// ── The three kinds are NOT flattened, and the CLI is where that is easiest to get wrong ──────
// `lib/credential-inventory.ts` models three blast radii and the seed says the CLI must not
// collapse them: `ingest` sends events into a project, `flag_read` reads ONE environment's
// snapshot, `flag_sync` writes definitions from an outside catalog. So `--type` is REQUIRED — there
// is no default kind — and each kind's own argument is required too. A defaulted `--env` would mint
// a credential pointed at an environment the caller did not choose, which is the kind of quiet
// wrong that only shows up when the wrong thing is served.
//
// ── The plaintext is printed ONCE and never saved ─────────────────────────────────────────────
// It goes to stdout and nowhere else. It is not written to the credentials file, not echoed by
// `gf doctor`, not returned by `gf keys ls`. Only the hash was stored, so there is nothing to
// re-show and the CLI says so rather than implying it could.

import { flagValue } from '../args'
import type { Command } from '../command'
import { EXIT, exitForServerCode, type ExitCode } from '../exit-codes'
import { table } from '../output'
import { missingProject, resolveProject } from './flags-read'

const KEY_TYPES = ['ingest', 'flag_read', 'flag_sync'] as const

type KeyRow = {
  id: string
  type: string
  label: string
  scope: string | null
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
}

export const keysLsCommand: Command = {
  path: ['keys', 'ls'],
  summary: 'every credential that can reach this project',
  usage: 'gf keys ls [--project <slug>] [--json]',
  needsAuth: true,
  detail: `Owner-only, exactly as the console's Keys page is — an ordinary member can read the
  dashboards but must not enumerate the credentials production runs on.

  ⚠️ It does NOT list connector URLs, share links or your CLI tokens. Those are managed on
  their own surfaces and are not project-scoped credentials; saying so is better than a list
  that implies completeness it does not have.`,
  flags: [{ name: 'project', value: '<slug>', describe: 'the project (default: the remembered one)' }],
  async run(context): Promise<ExitCode> {
    const project = resolveProject(context)
    if (!project) return missingProject(context)

    const result = await context.api!.get<{ keys: KeyRow[] }>('api/v1/cli/keys', { project })
    if (result.kind === 'network') {
      context.emit.fail('server_error', result.message)
      return EXIT.SERVER
    }
    if (result.kind === 'error') {
      context.emit.fail(result.code, result.message)
      return exitForServerCode(result.code)
    }

    const { keys } = result.body
    context.emit.ok(
      { project, keys },
      keys.length === 0
        ? `No credentials in ${project} yet.`
        : table(
            ['ID', 'TYPE', 'LABEL', 'SCOPE', 'EXPIRES', 'STATE'],
            keys.map((key) => [
              key.id,
              key.type,
              key.label || 'untitled',
              // "Everywhere" for a kind with no scope, never a blank: a blank cell reads as missing
              // data, and "this kind has no environment" is a fact.
              key.scope ?? 'everywhere',
              key.expiresAt ?? 'no expiry',
              key.revokedAt ? 'revoked' : 'active',
            ])
          )
    )
    return EXIT.OK
  },
}

export const keysCreateCommand: Command = {
  path: ['keys', 'create'],
  summary: 'mint a credential — the kind is required, never guessed',
  usage: 'gf keys create --type flag_read --env production --label "my app"',
  needsAuth: true,
  detail: `--type is required and has no default:

    ingest      sends events into this project, and reads its funnels through the SDK
    flag_read   reads ONE environment's flag snapshot — needs --env
    flag_sync   registers flag definitions from an outside catalog — needs --source

  These have different blast radii and the product models them separately; a CLI that
  flattened them into "a key" would hand out the widest one by accident.

  The value is printed ONCE. Only its hash is stored, so it cannot be shown again.`,
  flags: [
    { name: 'project', value: '<slug>', describe: 'the project (default: the remembered one)' },
    { name: 'type', value: '<kind>', describe: `${KEY_TYPES.join(' | ')} — required` },
    { name: 'label', value: '<text>', describe: 'what holds it — required' },
    { name: 'env', value: '<environment>', describe: 'required for flag_read' },
    { name: 'source', value: '<name>', describe: 'required for flag_sync' },
  ],
  async run(context): Promise<ExitCode> {
    const project = resolveProject(context)
    if (!project) return missingProject(context)

    const type = flagValue(context.args, 'type')
    if (!type || !(KEY_TYPES as readonly string[]).includes(type)) {
      context.emit.fail('invalid', `--type is required, and must be one of: ${KEY_TYPES.join(', ')}.`)
      return EXIT.USAGE
    }
    const label = flagValue(context.args, 'label')?.trim()
    if (!label) {
      context.emit.fail('invalid', '--label is required. Name what will hold this credential.')
      return EXIT.USAGE
    }
    // Refused HERE as well as at the server, so a caller learns what is missing without spending a
    // round-trip on it — and so the message names the kind they actually asked for.
    if (type === 'flag_read' && !flagValue(context.args, 'env')) {
      context.emit.fail('invalid', 'A flag_read key reads ONE environment. Pass --env.')
      return EXIT.USAGE
    }
    if (type === 'flag_sync' && !flagValue(context.args, 'source')) {
      context.emit.fail('invalid', 'A flag_sync key is attributed to a source catalog. Pass --source.')
      return EXIT.USAGE
    }

    const result = await context.api!.post<{
      id: string
      type: string
      label: string
      scope: string | null
      expiresAt: string | null
      key: string
    }>('api/v1/cli/keys', {
      project,
      type,
      label,
      environment: flagValue(context.args, 'env'),
      source: flagValue(context.args, 'source'),
    })
    if (result.kind === 'network') {
      context.emit.fail('server_error', result.message)
      return EXIT.SERVER
    }
    if (result.kind === 'error') {
      context.emit.fail(result.code, result.message)
      return exitForServerCode(result.code)
    }

    const minted = result.body
    context.emit.ok(minted, [
      `${minted.type} credential for ${project}${minted.scope ? ` (${minted.scope})` : ''}`,
      '',
      minted.key,
      '',
      'This is the only time it is shown — only a hash was stored.',
      minted.expiresAt ? `It expires ${minted.expiresAt}.` : 'It does not expire; revoke it when you are done.',
    ].join('\n'))
    return EXIT.OK
  },
}

export const keysRevokeCommand: Command = {
  path: ['keys', 'revoke'],
  summary: 'kill a credential, immediately and permanently',
  usage: 'gf keys revoke <id> --type ingest',
  needsAuth: true,
  detail: `--type is required, and it is not bureaucracy: each kind is revoked through its own
  path so the audit trail records what actually happened. A trail whose label can be chosen
  by picking an endpoint is worse than no trail — an operator asking "why did ingest stop?"
  must not find the answer filed under something else.

  Idempotent. A credential that is already revoked, never existed, or belongs to another
  project is one answer: not found.`,
  flags: [
    { name: 'project', value: '<slug>', describe: 'the project (default: the remembered one)' },
    { name: 'type', value: '<kind>', describe: `${KEY_TYPES.join(' | ')} — required` },
  ],
  async run(context): Promise<ExitCode> {
    const project = resolveProject(context)
    if (!project) return missingProject(context)

    const id = context.args.positionals[0]
    const type = flagValue(context.args, 'type')
    if (!id || !type || !(KEY_TYPES as readonly string[]).includes(type)) {
      context.emit.fail('invalid', `Usage: \`gf keys revoke <id> --type ${KEY_TYPES.join('|')}\`.`)
      return EXIT.USAGE
    }

    const result = await context.api!.del<{ revoked: boolean }>('api/v1/cli/keys', { project, type, id })
    if (result.kind === 'network') {
      context.emit.fail('server_error', result.message)
      return EXIT.SERVER
    }
    if (result.kind === 'error') {
      context.emit.fail(result.code, result.message)
      return exitForServerCode(result.code)
    }
    context.emit.ok({ project, type, id, revoked: true }, `Revoked ${type} credential ${id}.`)
    return EXIT.OK
  },
}
