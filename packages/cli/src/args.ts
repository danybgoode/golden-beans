// golden-frijoles-cli · Sprint 1, Story 1.1 — the argument parser. PURE, and no dependency.
//
// ── Why hand-written and not `commander`/`yargs` ──────────────────────────────────────────────
// A published CLI's dependency tree is its install time and its supply-chain surface, and this one
// is meant to be reached with `npx` on a machine that has never seen it. The whole grammar here is
// "verbs, then `--flag value`", which is forty lines. A parser library would be the largest thing
// in the package by an order of magnitude, to save those forty lines.
//
// ── Pure, so the contract can be asserted without spawning anything ───────────────────────────
// Every parsing rule below is tested directly (CODE-QUALITY #5). Spawning `gf` to find out whether
// `--percent` accepts `=` is a test that also exercises the network, the filesystem and a token.

export type ParsedArgs = {
  /** The verb path: `['flags', 'create']` for `gf flags create …`. */
  path: string[]
  /** Everything that was not a flag and not part of the verb path. */
  positionals: string[]
  /** `--flag value`, `--flag=value` and repeated flags (which accumulate). */
  flags: Map<string, string[]>
  /** `--json` anywhere. Hoisted because every command honours it. */
  json: boolean
  /** `--help`/`-h` anywhere, including after a verb. */
  help: boolean
  /** `--version`/`-V` anywhere. */
  version: boolean
}

/**
 * Boolean flags — the ones that take NO value.
 *
 * ⚠️ A closed list, and it has to exist. Without it `gf flags create k --all-envs --kill-switch`
 * parses `--kill-switch` as the VALUE of `--all-envs`, and the command then silently creates a flag
 * in one environment with no polarity — a wrong result from a correct-looking command line, which
 * is the worst failure shape a CLI has. Adding a boolean flag means adding it here.
 */
const BOOLEAN_FLAGS = new Set([
  'json',
  'help',
  'h',
  'version',
  'V',
  'all-envs',
  'kill-switch',
  'enablement',
  'dry-run',
  'yes',
  'no-color',
])

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const path: string[] = []
  const positionals: string[] = []
  const flags = new Map<string, string[]>()

  function push(name: string, value: string) {
    flags.set(name, [...(flags.get(name) ?? []), value])
  }

  let index = 0
  // The verb path is the leading run of bare words. `gf flags create checkout.demo` has a two-word
  // path and one positional, and the command table decides where the path ends — see `matchCommand`.
  while (index < argv.length && !argv[index].startsWith('-')) {
    path.push(argv[index])
    index++
  }

  for (; index < argv.length; index++) {
    const token = argv[index]
    if (!token.startsWith('-')) {
      positionals.push(token)
      continue
    }
    // `--` ends flag parsing: everything after it is a positional, even if it starts with a dash.
    // A rules file called `--weird.json` is not this CLI's problem to guess about.
    if (token === '--') {
      positionals.push(...argv.slice(index + 1))
      break
    }
    const body = token.replace(/^--?/, '')
    const equals = body.indexOf('=')
    if (equals !== -1) {
      // `--flag=value` always carries its own value, even for a name in BOOLEAN_FLAGS — `--json=false`
      // is a caller saying something explicit, and swallowing the `=false` would invert it.
      push(body.slice(0, equals), body.slice(equals + 1))
      continue
    }
    if (BOOLEAN_FLAGS.has(body)) {
      push(body, 'true')
      continue
    }
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('-')) {
      // A value-taking flag with nothing after it. Recorded as EMPTY rather than as `true`, so the
      // command reports "--env needs a value" instead of treating the flag as a boolean it is not.
      push(body, '')
      continue
    }
    push(body, next)
    index++
  }

  return {
    path,
    positionals,
    flags,
    json: readBoolean(flags, 'json'),
    help: readBoolean(flags, 'help') || readBoolean(flags, 'h'),
    version: readBoolean(flags, 'version') || readBoolean(flags, 'V'),
  }
}

/**
 * A boolean flag's value.
 *
 * Present with no value ⇒ true. `--flag=false` / `=0` / `=no` ⇒ false, because a caller who typed
 * an explicit value meant it. Anything else present ⇒ true.
 */
function readBoolean(flags: Map<string, string[]>, name: string): boolean {
  const values = flags.get(name)
  if (values === undefined) return false
  const last = values[values.length - 1]
  return !['false', '0', 'no', 'off'].includes(last.toLowerCase())
}

export function flagValue(args: ParsedArgs, name: string): string | undefined {
  const values = args.flags.get(name)
  // The LAST wins for a single-valued flag: `--env production --env preview` on a verb that takes
  // one environment is a caller correcting themselves, and taking the first would silently act on
  // the value they replaced.
  return values === undefined ? undefined : values[values.length - 1]
}

export function flagValues(args: ParsedArgs, name: string): string[] {
  return (args.flags.get(name) ?? []).filter((value) => value !== '')
}

export function boolFlag(args: ParsedArgs, name: string): boolean {
  return readBoolean(args.flags, name)
}

/**
 * Flags the caller passed that this command does not know about.
 *
 * ⚠️ **Reported as a usage error rather than ignored, and that is not pedantry.** An agent that
 * types `--environment` instead of `--env` and is silently ignored gets a flag created in the wrong
 * place with exit 0 — the CLI agreeing with a command nobody wrote. Fail loud (CODE-QUALITY #7).
 */
export function unknownFlags(args: ParsedArgs, known: readonly string[]): string[] {
  const allowed = new Set([...known, 'json', 'help', 'h', 'version', 'V', 'no-color', 'api', 'token'])
  return [...args.flags.keys()].filter((name) => !allowed.has(name)).sort()
}
