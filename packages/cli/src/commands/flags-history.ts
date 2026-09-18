// golden-frijoles-cli · Sprint 2, Story 2.4 — `gf flags history` and `gf flags diff`.
//
// ── READ-ONLY, and that is asserted rather than asserted-about ────────────────────────────────
// Both verbs are served by the SAME `GET /api/v1/cli/flags?key=…` the read verbs use. There is no
// POST in this file, no version created, no activation touched, no audit row written — and a spec
// pins that by counting the requests each one makes. A "read" verb that could write is one someone
// will run during an incident to find out what happened.
//
// ── The diff is SEMANTIC, and it is the console's diff ────────────────────────────────────────
// `diffFlagDefinitions` comes from `@golden-frijoles/sdk` — the same function `/app/flags` renders
// its version history with, moved there by D4 precisely so `gf flags diff` and the console produce
// the SAME sentences. A JSON text diff would have been easier and would have said "two lines
// changed" where the console says "rollout 10% → 25%".
//
// It also ADMITS what it cannot describe. `unexplained` means something changed outside the six
// parts the differ covers, and the CLI prints the raw JSON rather than a confident sentence that
// happens to omit it.

import { diffFlagDefinitions, type FlagDefinition } from '@golden-frijoles/sdk'
import { flagValue, flagValues } from '../args'
import type { Command, CommandContext } from '../command'
import { EXIT, exitForServerCode, type ExitCode } from '../exit-codes'
import { table } from '../output'
import { missingProject, resolveProject, type FlagDetailBody } from './flags-read'

async function loadFlag(
  context: CommandContext,
  project: string,
  key: string
): Promise<{ ok: true; body: FlagDetailBody } | { ok: false; code: ExitCode }> {
  const result = await context.api!.get<FlagDetailBody>('api/v1/cli/flags', { project, key })
  if (result.kind === 'network') {
    context.emit.fail('server_error', result.message)
    return { ok: false, code: EXIT.SERVER }
  }
  if (result.kind === 'error') {
    context.emit.fail(result.code, result.message)
    return { ok: false, code: exitForServerCode(result.code) }
  }
  return { ok: true, body: result.body }
}

export const flagsHistoryCommand: Command = {
  path: ['flags', 'history'],
  summary: 'every version of a flag, and who changed what',
  usage: 'gf flags history <key> [--project <slug>] [--json]',
  needsAuth: true,
  detail: `Read-only: it creates no version, touches no activation and writes no audit row.

  ⚠️ The audit window is CAPPED by the control plane at the most recent entries, so a flag
  with a very long history shows the newest of them rather than all of them. Saying so is
  the point — a list that implies completeness it does not have is worse than a short one.`,
  flags: [{ name: 'project', value: '<slug>', describe: 'the project (default: the remembered one)' }],
  async run(context): Promise<ExitCode> {
    const key = context.args.positionals[0]
    if (!key) {
      context.emit.fail('invalid', 'Name a flag: `gf flags history <key>`.')
      return EXIT.USAGE
    }
    const project = resolveProject(context)
    if (!project) return missingProject(context)

    const loaded = await loadFlag(context, project, key)
    if (!loaded.ok) return loaded.code
    const { flag } = loaded.body

    context.emit.ok(
      { project, key: flag.key, versions: flag.versions, audit: flag.audit },
      [
        table(
          ['VERSION', 'CREATED', 'SERVED BY'],
          flag.versions.map((version) => [
            `v${version.version}`,
            version.createdAt,
            version.servedBy.join(', ') || '—',
          ])
        ),
        '',
        flag.audit.length === 0
          ? 'No lifecycle events recorded for this flag.'
          : table(
              ['WHEN', 'WHAT', 'WHERE', 'WHO', 'WHY'],
              flag.audit.map((row) => [
                row.createdAt,
                row.action,
                row.environment ?? '—',
                row.actor,
                row.reason,
              ])
            ),
      ].join('\n')
    )
    return EXIT.OK
  },
}

export const flagsDiffCommand: Command = {
  path: ['flags', 'diff'],
  summary: 'what changed between two versions, in words',
  usage: 'gf flags diff <key> --from 3 --to 4    ·    gf flags diff <key> --env preview --env production',
  needsAuth: true,
  detail: `Two ways to ask:
    --from <n> --to <n>          compare two version numbers
    --env <a> --env <b>          compare what two environments are serving

  The sentences are the console's own — one implementation, so the terminal and the page
  cannot describe the same change differently. Anything outside the six parts the differ
  covers is reported as such, with the raw JSON, rather than silently omitted.`,
  flags: [
    { name: 'project', value: '<slug>', describe: 'the project (default: the remembered one)' },
    { name: 'from', value: '<version>', describe: 'the version to compare FROM' },
    { name: 'to', value: '<version>', describe: 'the version to compare TO' },
    { name: 'env', value: '<environment>', describe: 'pass twice to compare two environments' },
  ],
  async run(context): Promise<ExitCode> {
    const key = context.args.positionals[0]
    if (!key) {
      context.emit.fail('invalid', 'Name a flag: `gf flags diff <key> --from 3 --to 4`.')
      return EXIT.USAGE
    }
    const project = resolveProject(context)
    if (!project) return missingProject(context)

    const environments = flagValues(context.args, 'env')
    const from = flagValue(context.args, 'from')
    const to = flagValue(context.args, 'to')
    const byVersion = from !== undefined && to !== undefined
    const byEnvironment = environments.length === 2

    if (byVersion === byEnvironment) {
      // Both, or neither. Both is ambiguous and neither is incomplete; guessing which the caller
      // meant would produce a confident answer to a question they did not ask.
      context.emit.fail(
        'invalid',
        'Pass EITHER --from <version> --to <version>, OR --env twice. Not both, and not neither.'
      )
      return EXIT.USAGE
    }

    const loaded = await loadFlag(context, project, key)
    if (!loaded.ok) return loaded.code
    const { flag } = loaded.body

    let before: { label: string; definition: FlagDefinition } | null = null
    let after: { label: string; definition: FlagDefinition } | null = null

    if (byVersion) {
      const find = (raw: string) => flag.versions.find((version) => version.version === Number(raw))
      const left = find(from)
      const right = find(to)
      if (!left || !right) {
        const known = flag.versions.map((version) => `v${version.version}`).join(', ')
        context.emit.fail('not_found', `No such version. ${key} has: ${known || 'none'}.`)
        return EXIT.NOT_FOUND
      }
      before = { label: `v${left.version}`, definition: left.definition as FlagDefinition }
      after = { label: `v${right.version}`, definition: right.definition as FlagDefinition }
    } else {
      const resolveEnvironment = (name: string) => {
        const row = flag.environments.find((candidate) => candidate.environment === name)
        if (!row || row.version === null) return null
        const version = flag.versions.find((candidate) => candidate.version === row.version)
        return version
          ? { label: `${name} (v${version.version})`, definition: version.definition as FlagDefinition }
          : null
      }
      before = resolveEnvironment(environments[0])
      after = resolveEnvironment(environments[1])
      if (!before || !after) {
        // Naming WHICH one, because "one of them serves nothing" sends the reader to check both.
        const empty = [before ? null : environments[0], after ? null : environments[1]].filter(Boolean)
        context.emit.fail(
          'not_found',
          `${empty.join(' and ')} ${empty.length === 1 ? 'is' : 'are'} serving nothing, so there is nothing to compare.`
        )
        return EXIT.NOT_FOUND
      }
    }

    const diff = diffFlagDefinitions(before.definition, after.definition)
    context.emit.ok(
      {
        project,
        key: flag.key,
        from: before.label,
        to: after.label,
        changes: diff.changes,
        unexplained: diff.unexplained,
        // The raw definitions travel in --json ONLY when the differ could not explain everything,
        // so an agent has what it needs exactly when the sentences are insufficient.
        ...(diff.unexplained ? { definitions: { from: before.definition, to: after.definition } } : {}),
      },
      [
        `${before.label} → ${after.label}`,
        ...(diff.changes.length === 0 && !diff.unexplained
          ? ['Nothing changed in the parts this compares.']
          : []),
        ...diff.changes.map((change) => `  · ${change}`),
        ...(diff.unexplained
          ? [
              '  · something changed outside what this can describe — the JSON:',
              JSON.stringify(after.definition, null, 2),
            ]
          : []),
      ].join('\n')
    )
    return EXIT.OK
  },
}
