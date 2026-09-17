// golden-frijoles-cli · Sprint 1, Story 1.5 — `gf flags ls` and `gf flags get`.
//
// Read-only. Every write verb lands in Sprint 2 and goes through the shared command core; nothing
// in this file plans or posts anything.

import { flagValue } from '../args'
import type { Command, CommandContext } from '../command'
import { EXIT, exitForServerCode, type ExitCode } from '../exit-codes'
import { table } from '../output'

export type CliFlagEnvironment = {
  environment: string
  state: 'on' | 'off' | 'never'
  version: number | null
  serving: unknown
  readable: boolean
  updatedAt: string | null
}

export type CliFlag = {
  key: string
  valueType: string | null
  description: string | null
  latestVersion: number | null
  environments: CliFlagEnvironment[]
}

export type FlagsListBody = {
  project: string
  flags: CliFlag[]
  environments: Array<{ environment: string; snapshotVersion: number; updatedAt: string }>
}

export type FlagDetailBody = {
  project: string
  flag: CliFlag & {
    versions: Array<{
      version: number
      versionId: string
      createdAt: string
      definition: unknown
      servedBy: string[]
    }>
    audit: Array<{ action: string; environment: string | null; reason: string; createdAt: string; actor: string }>
  }
  environments: Array<{ environment: string; snapshotVersion: number; updatedAt: string }>
}

/**
 * The project this command acts on: `--project`, else the remembered one.
 *
 * Returns null rather than guessing. A CLI that picked "the first project" when none was chosen
 * would act on a tenant the caller did not name, which is the one mistake a multi-tenant tool must
 * not make quietly.
 */
export function resolveProject(context: CommandContext): string | null {
  return flagValue(context.args, 'project')?.trim() || context.auth.activeProject || null
}

export function missingProject(context: CommandContext): ExitCode {
  context.emit.fail(
    'invalid',
    'No project chosen. Pass --project <slug>, or run `gf projects use <slug>`.'
  )
  return EXIT.USAGE
}

/**
 * What an environment is serving, as ONE cell of text.
 *
 * ⚠️ Three outcomes, and collapsing any two of them would be the defect this whole area of the
 * product exists to stop making:
 *   • `never` / `off` — nothing is served here. The consumer falls back to its own literal.
 *   • a value — what a context with no attributes actually gets, from the SDK's own evaluator.
 *   • `unreadable` — the stored row disagrees with the parser that wrote it. Never a guess.
 */
export function describeServing(row: CliFlagEnvironment): string {
  if (row.state === 'never') return '—'
  if (row.state === 'off') return 'off (nothing served)'
  if (!row.readable) return 'unreadable'
  return `${JSON.stringify(row.serving)}  v${row.version}`
}

export const flagsLsCommand: Command = {
  path: ['flags', 'ls'],
  summary: 'every flag, and what each environment serves',
  usage: 'gf flags ls [--project <slug>] [--json]',
  needsAuth: true,
  detail: `The "serving" column is what a context with no attributes actually GETS — the
  answer the SDK's own evaluator gives, which is the answer production gives.

  ⚠️ It is NOT the same as "a version is activated here". A definition whose default
  variant is false is activated AND serves false; reporting those as one fact is how a
  console once labelled 34 of 42 flags the wrong way round.`,
  flags: [{ name: 'project', value: '<slug>', describe: 'the project (default: the remembered one)' }],
  async run(context): Promise<ExitCode> {
    const project = resolveProject(context)
    if (!project) return missingProject(context)

    const result = await context.api!.get<FlagsListBody>('api/v1/cli/flags', { project })
    if (result.kind === 'network') {
      context.emit.fail('server_error', result.message)
      return EXIT.SERVER
    }
    if (result.kind === 'error') {
      context.emit.fail(result.code, result.message)
      return exitForServerCode(result.code)
    }

    const { flags, environments } = result.body
    context.emit.ok(
      { project, flags, environments },
      flags.length === 0
        ? `No flags in ${project} yet. Create one with \`gf flags create <key> --kill-switch --all-envs\`.`
        : table(
            ['FLAG', 'TYPE', 'DEVELOPMENT', 'PREVIEW', 'PRODUCTION'],
            flags.map((flag) => [
              flag.key,
              flag.valueType ?? '—',
              ...['development', 'preview', 'production'].map((environment) => {
                const row = flag.environments.find((candidate) => candidate.environment === environment)
                return row ? describeServing(row) : '—'
              }),
            ])
          )
    )
    return EXIT.OK
  },
}

export const flagsGetCommand: Command = {
  path: ['flags', 'get'],
  summary: 'one flag: its definition, its versions and who changed it',
  usage: 'gf flags get <key> [--project <slug>] [--json]',
  needsAuth: true,
  flags: [{ name: 'project', value: '<slug>', describe: 'the project (default: the remembered one)' }],
  async run(context): Promise<ExitCode> {
    const key = context.args.positionals[0]
    if (!key) {
      context.emit.fail('invalid', 'Name a flag: `gf flags get <key>`.')
      return EXIT.USAGE
    }
    const project = resolveProject(context)
    if (!project) return missingProject(context)

    const result = await context.api!.get<FlagDetailBody>('api/v1/cli/flags', { project, key })
    if (result.kind === 'network') {
      context.emit.fail('server_error', result.message)
      return EXIT.SERVER
    }
    if (result.kind === 'error') {
      context.emit.fail(result.code, result.message)
      return exitForServerCode(result.code)
    }

    const { flag } = result.body
    context.emit.ok(
      { project, flag },
      [
        `${flag.key}  (${flag.valueType ?? 'unknown type'})`,
        flag.description ?? '',
        '',
        table(
          ['ENVIRONMENT', 'SERVING', 'SINCE'],
          flag.environments.map((row) => [row.environment, describeServing(row), row.updatedAt ?? '—'])
        ),
        '',
        table(
          ['VERSION', 'CREATED', 'SERVED BY'],
          flag.versions.map((version) => [
            `v${version.version}`,
            version.createdAt,
            version.servedBy.join(', ') || '—',
          ])
        ),
      ].join('\n')
    )
    return EXIT.OK
  },
}
