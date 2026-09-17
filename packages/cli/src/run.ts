// golden-frijoles-cli · Sprint 1, Story 1.1 — the dispatcher.
//
// ── `run()` returns an exit code; only `bin.ts` calls `process.exit` ──────────────────────────
// So the whole CLI can be driven in-process by a test with a captured writer, an injected `fetch`
// and a temporary HOME — and asserted on its exact bytes and its exit code. A dispatcher that
// exited the process could only be tested by spawning one, which is how a CLI ends up with three
// assertions and a lot of confidence.

import { parseArgs, flagValue, unknownFlags } from './args'
import { createApiClient, type ApiClient } from './api'
import { matchCommand, type Command, type CommandContext } from './command'
import { COMMANDS } from './commands'
import { resolveAuth } from './credentials'
import { EXIT, type ExitCode } from './exit-codes'
import { renderCommandHelp, renderRootHelp } from './help'
import { createEmitter, processWriter, type Writer } from './output'
import { VERSION } from './version'

export type RunOptions = {
  argv: readonly string[]
  writer?: Writer
  env?: NodeJS.ProcessEnv
  cwd?: string
  /** Injected in tests. Production passes nothing and the global `fetch` is used. */
  fetchImpl?: typeof fetch
  commands?: readonly Command[]
}

export async function run(options: RunOptions): Promise<ExitCode> {
  const writer = options.writer ?? processWriter
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const commands = options.commands ?? COMMANDS
  const args = parseArgs(options.argv)
  const emit = createEmitter(writer, args.json)

  // `--version` before everything, including before the command table: someone asking which version
  // they have is asking a question about the binary, not about a verb, and it must answer on a
  // machine with no credential, no network and a typo in the command.
  //
  // ⚠️ **`args.path.length === 0` used to be part of this condition, and that made `--help`'s
  // "global flags" section false** (cross-family review, Codex, PR #149). `gf whoami --version`
  // entered `whoami`, demanded a credential and then made a network call — for a question about the
  // binary. A flag documented as global is honoured globally, as `git --version` and `npm --version`
  // are; the alternative is a help text an agent cannot trust, which is the whole of D5.
  if (args.version) {
    emit.ok({ version: VERSION }, VERSION)
    return EXIT.OK
  }

  if (args.path.length === 0 || args.path[0] === 'help') {
    const target = args.path[0] === 'help' ? args.path.slice(1) : []
    if (target.length > 0) {
      const found = matchCommand(commands, target)
      if (!found) return unknownCommand(target, emit)
      writer.out(renderCommandHelp(found.command))
      return EXIT.OK
    }
    writer.out(renderRootHelp(commands))
    // `gf` with no arguments prints help and exits 0 — it is what a person types to find out what
    // this is, and answering their question is not an error. `gf nonsense` is (see below).
    return EXIT.OK
  }

  const found = matchCommand(commands, args.path)
  if (!found) return unknownCommand(args.path, emit)
  const { command, rest } = found

  if (args.help) {
    writer.out(renderCommandHelp(command))
    return EXIT.OK
  }

  // Leftover path words become positionals. `gf flags get checkout.demo` matches `['flags','get']`
  // and leaves `checkout.demo`, which is how a verb receives its subject without the parser needing
  // to know the arity of every command.
  const withPositionals = { ...args, positionals: [...rest, ...args.positionals] }

  // ⚠️ An unknown flag is a USAGE ERROR, not something to ignore. An agent that types `--environment`
  // for `--env` and is silently ignored gets a flag created in the wrong place, with exit 0 — the
  // CLI agreeing with a command nobody wrote.
  const unknown = unknownFlags(withPositionals, command.flags.map((flag) => flag.name))
  if (unknown.length > 0) {
    emit.fail(
      'invalid',
      `Unknown flag${unknown.length === 1 ? '' : 's'} for \`gf ${command.path.join(' ')}\`: ` +
        `${unknown.map((name) => `--${name}`).join(', ')}. Run \`gf ${command.path.join(' ')} --help\`.`
    )
    return EXIT.USAGE
  }

  const auth = resolveAuth({
    tokenFlag: flagValue(withPositionals, 'token'),
    apiFlag: flagValue(withPositionals, 'api'),
    env,
  })

  const clientFor = (token: string): ApiClient =>
    createApiClient({
      baseUrl: auth.apiUrl,
      token,
      userAgent: `golden-frijoles-cli/${VERSION}`,
      fetchImpl: options.fetchImpl,
    })

  if (command.needsAuth && auth.token === null) {
    // ONE sentence, in one place, rather than every verb re-checking and phrasing it differently.
    emit.fail(
      'unauthorized',
      'Not signed in. Run `gf login`, or set GOLDEN_FRIJOLES_TOKEN. `gf doctor` explains what it found.'
    )
    return EXIT.AUTH
  }

  const context: CommandContext = {
    args: withPositionals,
    emit,
    writer,
    auth,
    env,
    cwd,
    api: auth.token === null ? null : clientFor(auth.token),
    clientFor,
    fetchImpl: options.fetchImpl ?? fetch,
  }

  try {
    return await command.run(context)
  } catch (err) {
    // A handler that throws is a bug in this CLI, and it says so rather than printing a stack the
    // caller cannot act on. EXIT.SERVER because the remedy — retry, then report — is the same.
    emit.fail(
      'server_error',
      `\`gf ${command.path.join(' ')}\` failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`
    )
    return EXIT.SERVER
  }
}

function unknownCommand(path: readonly string[], emit: ReturnType<typeof createEmitter>): ExitCode {
  emit.fail('invalid', `Unknown command \`gf ${path.join(' ')}\`. Run \`gf --help\` for the list.`)
  return EXIT.USAGE
}
