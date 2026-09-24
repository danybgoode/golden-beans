// golden-frijoles-plugin · S5.2 — `gf config list|get|set` and `gf setup`.
//
// ── A thin front end over the kit's config core (D10) ─────────────────────────────────────────
// Every rule — which file wins, what counts as a secret, where the project root is — lives in
// `@golden-frijoles/kit/config` (see ../config-core.ts). These verbs parse arguments, call the core
// and print. A `ConfigError` from the core (a malformed file, a value that looks like a secret, an
// unknown section) is the caller's to fix, so it is EXIT.USAGE; nothing here decides what is valid.
//
// ── Local verbs: no credential, no network ────────────────────────────────────────────────────
// `needsAuth: false` on all four. They read and write one file in the project; demanding a login
// to change which reviewers run would make configuration depend on an account nobody needs.

import { emitKeypressEvents } from 'node:readline'
import { boolFlag } from '../args'
import type { Command, CommandContext } from '../command'
import { kitVersion, loadConfigCore, parseValue, type ConfigCore, type RegistryEntry } from '../config-core'
import { EXIT, type ExitCode } from '../exit-codes'

/** Load the core, or say plainly why it could not be loaded. `null` means the failure was already emitted. */
async function coreOrFail(context: CommandContext): Promise<{ core: ConfigCore; root: string } | null> {
  try {
    const core = await loadConfigCore()
    return { core, root: core.projectRoot({ env: context.env, cwd: context.cwd }) }
  } catch (err) {
    context.emit.fail(
      'server_error',
      `Could not load the config core from @golden-frijoles/kit: ${err instanceof Error ? err.message : String(err)}. ` +
        'Reinstall the CLI (`npm i -g @golden-frijoles/cli`).'
    )
    return null
  }
}

/** A ConfigError is the caller's to fix (EXIT.USAGE); anything else is a bug and propagates to run()'s catch. */
function configFailure(context: CommandContext, core: ConfigCore, err: unknown): ExitCode {
  if (err instanceof core.ConfigError) {
    context.emit.fail('invalid', err.message)
    return EXIT.USAGE
  }
  throw err
}

const show = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value))

export const configListCommand: Command = {
  path: ['config', 'list'],
  summary: "every setting in golden-frijoles.config.json and the legacy files, and where it came from",
  usage: 'gf config list [--json]',
  needsAuth: false,
  detail: `Reads the project's golden-frijoles.config.json and any legacy config files
  (review-config.json, jev.config.json, …). Where both set a section, the new file wins.`,
  flags: [],
  async run(context): Promise<ExitCode> {
    const loaded = await coreOrFail(context)
    if (!loaded) return EXIT.SERVER
    const { core, root } = loaded
    try {
      const config = core.loadConfig({ root })
      const names = Object.keys(config.sections)
      const human = names.length
        ? names
            .map(
              (name) =>
                `${name}  (${config.sources[name].map((source) => source.split('/').pop()).join(' + ')})\n` +
                JSON.stringify(config.sections[name], null, 2).replace(/^/gm, '  ')
            )
            .join('\n')
        : `No settings yet: no ${core.CONFIG_FILENAME} and no legacy config files. Run \`gf setup\`.`
      context.emit.ok({ root, ...config }, human)
      return EXIT.OK
    } catch (err) {
      return configFailure(context, core, err)
    }
  },
}

export const configGetCommand: Command = {
  path: ['config', 'get'],
  summary: "one setting's effective value (or its default when nothing sets it)",
  usage: 'gf config get <key> [--json]',
  needsAuth: false,
  flags: [],
  async run(context): Promise<ExitCode> {
    const [key, ...extra] = context.args.positionals
    if (!key || extra.length > 0) {
      context.emit.fail('invalid', 'Usage: `gf config get <key>`, e.g. `gf config get review.reviewScope`.')
      return EXIT.USAGE
    }
    const loaded = await coreOrFail(context)
    if (!loaded) return EXIT.SERVER
    const { core, root } = loaded
    try {
      const value = core.getKey(key, { root })
      context.emit.ok({ key, value: value ?? null }, show(value ?? null))
      return EXIT.OK
    } catch (err) {
      return configFailure(context, core, err)
    }
  },
}

export const configSetCommand: Command = {
  path: ['config', 'set'],
  summary: 'change one setting in golden-frijoles.config.json',
  usage: 'gf config set <key> <value> [--json]',
  needsAuth: false,
  detail: `<value> is read as JSON when it is valid JSON (true, 3, ["codex","claude"]), otherwise
  as text. Refuses anything that looks like a secret: keep keys and tokens in .env.local.
  Legacy config files are never edited.`,
  flags: [],
  async run(context): Promise<ExitCode> {
    const [key, ...words] = context.args.positionals
    if (!key || words.length === 0) {
      context.emit.fail(
        'invalid',
        'Usage: `gf config set <key> <value>`, e.g. `gf config set review.reviewScope every-pr`.'
      )
      return EXIT.USAGE
    }
    const loaded = await coreOrFail(context)
    if (!loaded) return EXIT.SERVER
    const { core, root } = loaded
    try {
      core.setKey(key, parseValue(words.join(' ')), { root })
      const value = core.getKey(key, { root })
      context.emit.ok({ key, value: value ?? null }, `${key} = ${JSON.stringify(value ?? null)}`)
      return EXIT.OK
    } catch (err) {
      return configFailure(context, core, err)
    }
  },
}

// ── gf setup ──────────────────────────────────────────────────────────────────────────────────

/** Pure — the next cursor position for one keypress, or a final answer. Exported for the unit tests. */
export function stepChoice(
  cursor: number,
  count: number,
  key: { name?: string; ctrl?: boolean }
): { cursor: number; done?: 'chosen' | 'default' | 'abort' } {
  if (key.ctrl && key.name === 'c') return { cursor, done: 'abort' }
  if (key.name === 'up' || key.name === 'k') return { cursor: (cursor + count - 1) % count }
  if (key.name === 'down' || key.name === 'j') return { cursor: (cursor + 1) % count }
  if (key.name === 'return' || key.name === 'enter') return { cursor, done: 'chosen' }
  if (key.name === 'escape' || key.name === 's') return { cursor, done: 'default' }
  return { cursor }
}

/** A chooser: given a question, resolves to the chosen value — or `undefined` when setup is aborted. */
export type Chooser = (entry: RegistryEntry, choices: readonly unknown[]) => Promise<unknown>

/** Arrow keys to move, Enter to choose, Esc or `s` to skip (the default). Only used on a real TTY. */
const ttyChooser =
  (context: CommandContext): Chooser =>
  (entry, choices) =>
    new Promise((resolve) => {
      const stdin = process.stdin
      const defaultIndex = Math.max(0, choices.indexOf(entry.default))
      let cursor = defaultIndex
      const draw = (first: boolean) => {
        if (!first) process.stderr.write(`\x1b[${choices.length}A`)
        choices.forEach((choice, index) =>
          process.stderr.write(
            `\x1b[2K${index === cursor ? '›' : ' '} ${show(choice)}${choice === entry.default ? '  (default)' : ''}\n`
          )
        )
      }
      context.writer.err(`${entry.question}${entry.required ? '' : '  [Esc skips]'}`)
      draw(true)
      emitKeypressEvents(stdin)
      stdin.setRawMode(true)
      stdin.resume()
      const onKey = (_: string, key: { name?: string; ctrl?: boolean }) => {
        const next = stepChoice(cursor, choices.length, key ?? {})
        cursor = next.cursor
        if (!next.done) return draw(false)
        stdin.off('keypress', onKey)
        stdin.setRawMode(false)
        stdin.pause()
        if (next.done === 'abort') return resolve(undefined)
        resolve(next.done === 'chosen' || entry.required ? choices[cursor] : entry.default)
      }
      stdin.on('keypress', onKey)
    })

/** Swapped by the unit tests; production uses the TTY chooser. */
export const setupIo: { isInteractive: () => boolean; chooser: (context: CommandContext) => Chooser } = {
  isInteractive: () => Boolean(process.stdin.isTTY && process.stderr.isTTY),
  chooser: ttyChooser,
}

export const setupCommand: Command = {
  path: ['setup'],
  summary: 'answer the setup questions (each has a default; only the first is required)',
  usage: 'gf setup [--yes] [--json]',
  needsAuth: false,
  detail: `Asks what you are working on, where you are starting, and whether to connect an
  account now — arrow keys to choose, Esc to take the default. --yes takes every default without
  asking. Answers go to golden-frijoles.config.json; an account is connected with \`gf login\` and
  \`gf init\`, which write .env.local, never the config file.`,
  flags: [{ name: 'yes', describe: 'take every default without asking (required when not on a terminal)' }],
  async run(context): Promise<ExitCode> {
    const yes = boolFlag(context.args, 'yes')
    if (!yes && !setupIo.isInteractive()) {
      context.emit.fail(
        'invalid',
        '`gf setup` asks questions on a terminal. Not on one: pass --yes for the defaults, or set each ' +
          'answer with `gf config set <key> <value>`.'
      )
      return EXIT.USAGE
    }
    const loaded = await coreOrFail(context)
    if (!loaded) return EXIT.SERVER
    const { core, root } = loaded
    const choose = yes ? null : setupIo.chooser(context)
    const answers: Record<string, unknown> = {}
    try {
      for (const entry of core.REGISTRY.filter((row) => row.askWhen === 'setup')) {
        const choices = entry.choices ?? [entry.default]
        const answer = choose ? await choose(entry, choices) : entry.default
        if (answer === undefined) {
          context.emit.fail('invalid', 'Setup stopped. Nothing after the last answered question was saved.', {
            answers,
          })
          return EXIT.USAGE
        }
        answers[entry.key] = answer
        // `store: 'env'` answers are not settings: connecting an account is `gf login` + `gf init`.
        if (entry.store !== 'env') core.setKey(entry.key, answer, { root })
      }
    } catch (err) {
      return configFailure(context, core, err)
    }
    const next = nextSteps(answers, kitVersion())
    context.emit.ok(
      { root, answers, next },
      [
        `Saved to ${core.CONFIG_FILENAME} in ${root}:`,
        ...Object.entries(answers).map(([key, value]) => `  ${key} = ${show(value)}`),
        '',
        'Next:',
        ...next.map((step) => `  ${step}`),
        '',
        'Change any answer later with `gf config set <key> <value>`.',
      ].join('\n')
    )
    return EXIT.OK
  },
}

/** Pure — what to do after setup, from the answers. Same rules as the umbrella skill's Stage 2. */
export function nextSteps(answers: Record<string, unknown>, kit: string | null): string[] {
  const steps: string[] = []
  if (answers['project.account'] === 'now') steps.push('Connect your account: `gf login`, then `gf init`.')
  if (answers['project.mode'] === 'existing' || answers['project.mode'] === 'new')
    steps.push(
      `Add the Roadmap/ skeleton: \`npx -y @golden-frijoles/kit${kit ? `@${kit}` : ''} init\` (it never overwrites anything).`
    )
  steps.push(
    answers['project.startPoint'] === 'building'
      ? 'Ask your agent to run the `live-smoke` skill against what you are building.'
      : 'Ask your agent to run the `groom` skill on your first idea.'
  )
  return steps
}
