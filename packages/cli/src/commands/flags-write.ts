// golden-frijoles-cli · Sprint 2 — the write verbs.
//
// ── Every one of these is a thin shell ────────────────────────────────────────────────────────
// Parse flags, post one request, render the D2 report. The DECISIONS — what a kill-switch serves,
// what killing clears, whether 150 is a percent — all live in `@golden-frijoles/sdk`'s planners and
// run server-side. That is D4: this file and the MCP write tools are two callers of one brain, so
// they cannot disagree, and there is nothing here for them to disagree with.
//
// ── The exit code comes from the BODY, not the status ─────────────────────────────────────────
// A partial answers 200, because the definition version was created and some environments did
// change — a 4xx would tell a caller nothing happened when something did, and a caller who retried
// on that basis would create a second version. So `outcome: 'partial'` is what produces EXIT.PARTIAL.

import { readFileSync } from 'node:fs'
import { FLAG_ENVIRONMENTS, OFF_VARIANT_KEY, ON_VARIANT_KEY, type FlagEnvironment } from '@golden-frijoles/sdk'
import { boolFlag, flagValue, flagValues } from '../args'
import type { Command, CommandContext, FlagDoc } from '../command'
import { EXIT, exitForServerCode, type ExitCode } from '../exit-codes'
import { table } from '../output'
import { missingProject, resolveProject } from './flags-read'

type EnvironmentOutcome = {
  environment: string
  status: 'applied' | 'unchanged' | 'conflict' | 'failed'
  snapshotVersion: number | null
  error?: string
}

type WriteBody = {
  outcome: 'applied' | 'partial'
  flagKey: string
  version: number
  versionId: string
  serving: unknown
  environments: EnvironmentOutcome[]
}

/** `--env` (repeatable) and `--all-envs`, shared by every write verb. */
const ENVIRONMENT_FLAGS: FlagDoc[] = [
  { name: 'env', value: '<environment>', describe: 'development | preview | production (repeatable)' },
  { name: 'all-envs', describe: 'all three environments, under the partial-failure contract' },
  { name: 'project', value: '<slug>', describe: 'the project (default: the remembered one)' },
  { name: 'reason', value: '<text>', describe: 'why — it goes in the audit trail (default: "via gf")' },
]

/**
 * The environments a write names.
 *
 * ⚠️ `--all-envs` and `--env` together is a USAGE ERROR, not a union. A caller who typed both meant
 * one of them, and picking either silently is how a change reaches an environment nobody named.
 */
function resolveEnvironments(
  context: CommandContext
): { allEnvs: true } | { environments: FlagEnvironment[] } | { error: string } {
  const named = flagValues(context.args, 'env')
  const all = boolFlag(context.args, 'all-envs')
  if (all && named.length > 0)
    return { error: '--all-envs and --env say different things. Pass one of them, not both.' }
  if (all) return { allEnvs: true }
  if (named.length === 0)
    return {
      error: `Name an environment with --env (${FLAG_ENVIRONMENTS.join(' | ')}), or use --all-envs.`,
    }
  const invalid = named.filter((value) => !(FLAG_ENVIRONMENTS as readonly string[]).includes(value))
  if (invalid.length > 0)
    return { error: `Not an environment: ${invalid.join(', ')}. Use ${FLAG_ENVIRONMENTS.join(', ')}.` }
  return { environments: named as FlagEnvironment[] }
}

/** Post a write and render the D2 report. The one place a write verb talks to the server. */
async function submit(
  context: CommandContext,
  key: string,
  payload: Record<string, unknown>,
  humanVerb: string
): Promise<ExitCode> {
  const project = resolveProject(context)
  if (!project) return missingProject(context)

  const environments = resolveEnvironments(context)
  if ('error' in environments) {
    context.emit.fail('invalid', environments.error)
    return EXIT.USAGE
  }

  const result = await context.api!.post<WriteBody>('api/v1/cli/flags/write', {
    project,
    key,
    reason: flagValue(context.args, 'reason')?.trim() || 'via gf',
    ...environments,
    ...payload,
  })

  if (result.kind === 'network') {
    context.emit.fail('server_error', result.message)
    return EXIT.SERVER
  }
  if (result.kind === 'error') {
    context.emit.fail(result.code, result.message, result.body.issues ? { issues: result.body.issues } : undefined)
    return exitForServerCode(result.code)
  }

  const body = result.body
  context.emit.ok(
    { project, ...body },
    [
      `${humanVerb} ${body.flagKey} — v${body.version}, serving ${JSON.stringify(body.serving)}`,
      '',
      table(
        ['ENVIRONMENT', 'RESULT', 'SNAPSHOT'],
        body.environments.map((row) => [
          row.environment,
          row.error ? `${row.status}: ${row.error}` : row.status,
          row.snapshotVersion === null ? '—' : String(row.snapshotVersion),
        ])
      ),
    ].join('\n')
  )

  // ⚠️ D2. `partial` is neither a success nor a clean failure — some environments changed and some
  // did not — and a CLI with no code for it forces the caller to parse prose. The version WAS
  // created in every case, which is why this is never EXIT.OK.
  return body.outcome === 'partial' ? EXIT.PARTIAL : EXIT.OK
}

export const flagsCreateCommand: Command = {
  path: ['flags', 'create'],
  summary: 'create a flag, with a polarity, in the environments you name',
  usage: 'gf flags create <key> --kill-switch|--enablement --all-envs',
  needsAuth: true,
  detail: `Polarity decides what the flag serves on the day it is born, and the CLI derives the
  default variant AND the activation from it — so the wrong combination cannot be typed:

    --kill-switch   default "on",  serves TRUE  everywhere    (it is on until you kill it)
    --enablement    default "off", serves FALSE everywhere    (you open it deliberately later)

  ⚠️ BOTH polarities ACTIVATE. A flag that is not activated is absent from the environment's
  snapshot, so your app falls back to its own literal and the flag is invisible in the
  provider — which is the failure this tool exists to end. "Disabled" means serving false.

  For a non-boolean flag use --type with --variants and --default; polarity does not apply,
  because "which way is off?" has no answer for a string.`,
  flags: [
    ...ENVIRONMENT_FLAGS,
    { name: 'kill-switch', describe: 'born serving true — the incident switch' },
    { name: 'enablement', describe: 'born serving false — the gate you open later' },
    { name: 'description', value: '<text>', describe: 'what the flag is for' },
    { name: 'type', value: '<type>', describe: 'string | number | json (omit for a boolean)' },
    { name: 'variants', value: '<json>', describe: 'a JSON array of {key,value} — with --type' },
    { name: 'default', value: '<key>', describe: 'which variant is served by default — with --type' },
  ],
  async run(context): Promise<ExitCode> {
    const key = context.args.positionals[0]
    if (!key) {
      context.emit.fail('invalid', 'Name a flag: `gf flags create <key> --kill-switch --all-envs`.')
      return EXIT.USAGE
    }

    const killSwitch = boolFlag(context.args, 'kill-switch')
    const enablement = boolFlag(context.args, 'enablement')
    const type = flagValue(context.args, 'type')

    if (killSwitch && enablement) {
      // The one combination the planner's input type cannot forbid, because the command line can
      // carry both words. Refused here so it never reaches a planner that would have to pick.
      context.emit.fail('invalid', 'A flag is a kill-switch or an enablement, not both.')
      return EXIT.USAGE
    }

    if (type !== undefined) {
      if (killSwitch || enablement) {
        context.emit.fail(
          'invalid',
          'Polarity is a boolean concept — "which way is off?" has no answer for a ' +
            `${type} flag. Use --variants and --default instead.`
        )
        return EXIT.USAGE
      }
      const rawVariants = flagValue(context.args, 'variants')
      const defaultVariantKey = flagValue(context.args, 'default')
      if (!rawVariants || !defaultVariantKey) {
        context.emit.fail('invalid', '--type needs --variants \'[{"key":"a","value":1}]\' and --default <key>.')
        return EXIT.USAGE
      }
      let variants: unknown
      try {
        variants = JSON.parse(rawVariants)
      } catch {
        context.emit.fail('invalid', '--variants must be valid JSON.')
        return EXIT.USAGE
      }
      return submit(
        context,
        key,
        {
          command: 'create',
          valueType: type,
          variants,
          defaultVariantKey,
          description: flagValue(context.args, 'description') ?? '',
        },
        'Created'
      )
    }

    if (!killSwitch && !enablement) {
      // No default polarity, on purpose. Guessing "enablement" would create a flag serving `false`
      // for someone who meant a kill-switch, and the two are opposites on the day they matter.
      context.emit.fail(
        'invalid',
        'Say which kind of flag this is: --kill-switch (born on) or --enablement (born off).'
      )
      return EXIT.USAGE
    }

    return submit(
      context,
      key,
      {
        command: 'create',
        polarity: killSwitch ? 'kill-switch' : 'enablement',
        description: flagValue(context.args, 'description') ?? '',
      },
      'Created'
    )
  },
}

export const flagsSetCommand: Command = {
  path: ['flags', 'set'],
  summary: 'change which variant a flag serves by default',
  usage: 'gf flags set <key> --value true|false --env production',
  needsAuth: true,
  detail: `--value true|false is shorthand for the "on" / "off" variants every flag \`gf flags
  create\` makes. For a flag created elsewhere, or a non-boolean one, name the variant with
  --variant; the server lists the real variant keys if the one you name is not there.

  Rules are carried across untouched. A set that quietly dropped a targeting rule would be
  the worst kind of surprise on a flag someone is mid-rollout on — use \`gf flags kill\` when
  clearing the rules is what you mean.`,
  flags: [
    ...ENVIRONMENT_FLAGS,
    { name: 'value', value: 'true|false', describe: 'shorthand for the on / off variant' },
    { name: 'variant', value: '<key>', describe: 'the variant to serve, by name' },
  ],
  async run(context): Promise<ExitCode> {
    const key = context.args.positionals[0]
    if (!key) {
      context.emit.fail('invalid', 'Name a flag: `gf flags set <key> --value true --env production`.')
      return EXIT.USAGE
    }
    const variant = flagValue(context.args, 'variant')
    const value = flagValue(context.args, 'value')
    if (variant && value) {
      context.emit.fail('invalid', '--value and --variant say the same thing two ways. Pass one.')
      return EXIT.USAGE
    }
    let variantKey = variant
    if (value !== undefined) {
      const normalized = value.trim().toLowerCase()
      if (normalized !== 'true' && normalized !== 'false') {
        context.emit.fail('invalid', '--value takes true or false. For anything else use --variant <key>.')
        return EXIT.USAGE
      }
      // The SDK's own constants, not the literals 'on'/'off' — `create` writes these exact keys, so
      // a typo in either place would produce a `set` that silently misses.
      variantKey = normalized === 'true' ? ON_VARIANT_KEY : OFF_VARIANT_KEY
    }
    if (!variantKey) {
      context.emit.fail('invalid', 'Say what to serve: --value true|false, or --variant <key>.')
      return EXIT.USAGE
    }
    return submit(context, key, { command: 'set', variantKey }, 'Set')
  },
}

export const flagsRolloutCommand: Command = {
  path: ['flags', 'rollout'],
  summary: 'serve a flag to a percentage of contexts',
  usage: 'gf flags rollout <key> --percent 25 --env production',
  needsAuth: true,
  detail: `⚠️ REPLACES the rule list with one unconditional rollout rule, and says so here rather
  than surprising you. An unconditional rollout beside existing clause rules is ambiguous
  about which one wins at a glance, and "ambiguous at a glance" is what an operator reaches
  for at 3am. Use \`gf flags rules --rules-file\` to compose several.

  --percent is rejected, never clamped: 150 is a typo, and agreeing with a typo is worse
  than refusing it. 0 and 100 are exactly expressible.`,
  flags: [
    ...ENVIRONMENT_FLAGS,
    { name: 'percent', value: '<0-100>', describe: 'the share of matching contexts served' },
    { name: 'variant', value: '<key>', describe: 'which variant to roll out (default: on)' },
  ],
  async run(context): Promise<ExitCode> {
    const key = context.args.positionals[0]
    const raw = flagValue(context.args, 'percent')
    if (!key || raw === undefined) {
      context.emit.fail('invalid', 'Usage: `gf flags rollout <key> --percent <0-100> --env production`.')
      return EXIT.USAGE
    }
    const percent = Number(raw)
    if (!Number.isFinite(percent)) {
      context.emit.fail('invalid', '--percent takes a number from 0 to 100.')
      return EXIT.USAGE
    }
    return submit(
      context,
      key,
      { command: 'rollout', percent, variantKey: flagValue(context.args, 'variant') },
      'Rolled out'
    )
  },
}

export const flagsRulesCommand: Command = {
  path: ['flags', 'rules'],
  summary: 'replace a flag’s targeting rules from a file',
  usage: 'gf flags rules <key> --rules-file rules.json --env production',
  needsAuth: true,
  detail: `A FILE, never a command-line expression language. A rule DSL is the appetite trap
  this epic named, and a file has a property that matters more: rules live in source
  control, reviewed, beside the code they target.

  The file is a JSON array of rules. The caps come from the SDK's own constants, so the CLI
  and the parser cannot disagree about how many rules a flag may have.`,
  flags: [
    ...ENVIRONMENT_FLAGS,
    { name: 'rules-file', value: '<path>', describe: 'a JSON array of rules' },
  ],
  async run(context): Promise<ExitCode> {
    const key = context.args.positionals[0]
    const path = flagValue(context.args, 'rules-file')
    if (!key || !path) {
      context.emit.fail('invalid', 'Usage: `gf flags rules <key> --rules-file rules.json --env production`.')
      return EXIT.USAGE
    }
    let rules: unknown
    try {
      rules = JSON.parse(readFileSync(path, 'utf8'))
    } catch (err) {
      // The path and the reason, both. "Could not read rules" sends someone looking at the rules.
      context.emit.fail('invalid', `Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`)
      return EXIT.USAGE
    }
    if (!Array.isArray(rules)) {
      context.emit.fail('invalid', `${path} must contain a JSON ARRAY of rules.`)
      return EXIT.USAGE
    }
    return submit(context, key, { command: 'rules', rules }, 'Replaced the rules of')
  },
}

export const flagsKillCommand: Command = {
  path: ['flags', 'kill'],
  summary: 'the 3am verb — serve false, and clear every rule',
  usage: 'gf flags kill <key> --env production',
  needsAuth: true,
  detail: `Two things happen, and the second is the one a hand-composed "set --value false"
  forgets:

    1. the default variant becomes the one whose value is false, AND
    2. EVERY RULE IS CLEARED.

  Without (2) a flag reads as "off" on the flags page while a 10% rollout is still serving
  true to one caller in ten — which is exactly the state you are killing the flag to escape.

  Refuses a non-boolean flag rather than guessing: there is no defensible "off" for a string.`,
  flags: ENVIRONMENT_FLAGS,
  async run(context): Promise<ExitCode> {
    const key = context.args.positionals[0]
    if (!key) {
      context.emit.fail('invalid', 'Name a flag: `gf flags kill <key> --env production`.')
      return EXIT.USAGE
    }
    return submit(context, key, { command: 'kill' }, 'Killed')
  },
}
