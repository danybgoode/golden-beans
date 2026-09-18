// golden-frijoles-cli · Sprint 1, Story 1.1 — the command shape, and the context every verb gets.
//
// ── One table, and `--help` is RENDERED from it ───────────────────────────────────────────────
// The help text is not written anywhere. It is generated from the same array the dispatcher reads,
// so a verb cannot exist without being documented and cannot be documented without existing — and
// the golden file (D5) then pins the rendered result. The failure this prevents is ordinary and
// constant: a flag added to a handler and not to its help, which an agent then never learns about.
//
// ── Why a handler returns an exit code instead of calling process.exit ────────────────────────
// So the whole CLI can be run in-process by a test, with a captured writer and an injected `fetch`,
// and asserted on its exit code and its exact bytes. A handler that exits the process is a handler
// that can only be tested by spawning one.

import type { ParsedArgs } from './args'
import type { ApiClient } from './api'
import type { Emitter, Writer } from './output'
import type { ResolvedAuth } from './credentials'
import type { ExitCode } from './exit-codes'

export type FlagDoc = {
  /** `--env`, written without the dashes. */
  name: string
  /** The value's placeholder — `<environment>` — or undefined for a boolean flag. */
  value?: string
  describe: string
}

export type CommandContext = {
  args: ParsedArgs
  emit: Emitter
  writer: Writer
  auth: ResolvedAuth
  env: NodeJS.ProcessEnv
  cwd: string
  /**
   * The HTTP client, already carrying the resolved token.
   *
   * `null` when there is no credential. A command with `needsAuth: true` never sees `null` — the
   * dispatcher refuses first, with EXIT.AUTH and one sentence — so handlers do not each re-check.
   */
  api: ApiClient | null
  /** Build a client against an arbitrary token. `gf login` needs one before a token is saved. */
  clientFor(token: string): ApiClient
  /**
   * The `fetch` this run should use, for the ONE call that is not to this deployment's API.
   *
   * ⚠️ Only `gf doctor`'s npm-registry check needs it, and it exists because the alternative was a
   * bare global `fetch` — which is how `packages/cli` grew a second HTTP path twice in one sprint
   * (`probeFlagReadKey` was the other). A direct global call skips the injected stub, so
   * `npm run test:unit` made a REAL network request to registry.npmjs.org on every doctor test, and
   * the check it performs could not be asserted at all.
   *
   * Everything talking to the deployment goes through `api` / `clientFor` instead — this is not a
   * general escape hatch, and a second consumer should be a reason to ask why.
   */
  fetchImpl: typeof fetch
}

export type Command = {
  /** `['flags', 'create']`. The dispatcher matches the LONGEST path first. */
  path: string[]
  summary: string
  /** One line, as a person would type it. Rendered into `--help` and pinned by the golden file. */
  usage: string
  flags: FlagDoc[]
  /**
   * Does this verb need a credential?
   *
   * `false` for `login`, `doctor`, `help` and `version` — and `doctor` is the important one: its job
   * is diagnosing a missing credential, so a dispatcher that refused it for want of one would make
   * the tool useless exactly when it is needed.
   */
  needsAuth: boolean
  /** Longer prose for `gf <verb> --help`. Optional; the summary carries most verbs. */
  detail?: string
  run(context: CommandContext): Promise<ExitCode>
}

/**
 * Find the command whose path is the longest prefix of what was typed.
 *
 * Longest-first so `flags create` wins over a hypothetical bare `flags`, and so adding a
 * sub-verb later cannot shadow an existing one by accident.
 *
 * Returns the leftover words as `positionals` — `gf flags get checkout.demo` matches
 * `['flags','get']` and leaves `['checkout.demo']`, which is how a verb receives its subject
 * without the parser having to know the arity of every command.
 */
export function matchCommand(
  commands: readonly Command[],
  path: readonly string[]
): { command: Command; rest: string[] } | null {
  const byLength = [...commands].sort((left, right) => right.path.length - left.path.length)
  for (const command of byLength) {
    if (command.path.every((segment, index) => path[index] === segment)) {
      return { command, rest: path.slice(command.path.length) }
    }
  }
  return null
}
