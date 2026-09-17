// golden-frijoles-cli · Sprint 1, Story 1.1 — `--help`, rendered from the command table.
//
// ── D5: this output is a CONTRACT ─────────────────────────────────────────────────────────────
// `src/__golden__/help.txt` holds these exact bytes and `golden.test.ts` diffs them. That is not
// pedantry about copy: an agent handed `gf --help` reads it to learn the verbs and the flags, so a
// silent change to this text changes what every agent believes the tool can do. A golden file makes
// the change arrive in review, where someone can decide it is intended.
//
// Nothing here is hand-maintained prose about which verbs exist. It is rendered from `COMMANDS`, so
// the help and the dispatcher cannot disagree.

import type { Command } from './command'
import { EXIT_CODE_TABLE } from './exit-codes'
import { pad } from './output'

const HEADER = `gf — the Golden Frijoles CLI

  Create a flag in every environment, roll it out, and kill it, from a terminal
  or from an agent. Every command takes --json.`

const GLOBAL_FLAGS = `Global flags
  --json                 machine-readable output on stdout, and nothing else
  --project <slug>       act on this project (default: the one from \`gf projects use\`)
  --api <url>            the deployment to talk to (default: the one you logged in to)
  --token <token>        use this credential instead of the saved one
  --help, -h             this text, or a verb's own
  --version, -V          print the version and exit`

const ENVIRONMENT = `Environment
  GOLDEN_FRIJOLES_TOKEN    a CLI token. Wins over the saved credential — this is the CI path,
                           and it means CI never has to write a token to disk.
  GOLDEN_FRIJOLES_URL      the deployment to talk to.
  GOLDEN_FRIJOLES_PROJECT  the active project.`

/** The verb list, aligned. Grouped by first word so `flags` reads as a family. */
function verbList(commands: readonly Command[]): string {
  const width = Math.max(...commands.map((command) => command.path.join(' ').length))
  const groups = new Map<string, Command[]>()
  for (const command of commands) {
    const group = command.path.length === 1 ? '' : command.path[0]
    groups.set(group, [...(groups.get(group) ?? []), command])
  }
  return [...groups.entries()]
    .map(([group, members]) => {
      const lines = members.map(
        (command) => `  ${pad(command.path.join(' '), width)}  ${command.summary}`
      )
      return group === '' ? lines.join('\n') : [`  ${group}`, ...lines].join('\n')
    })
    .join('\n\n')
}

function exitCodes(): string {
  return [
    'Exit codes',
    ...EXIT_CODE_TABLE.map(
      (row) => `  ${row.code}  ${pad(row.name, 9)}  ${row.means}`
    ),
  ].join('\n')
}

export function renderRootHelp(commands: readonly Command[]): string {
  return [HEADER, `Usage\n  gf <command> [flags]`, `Commands\n${verbList(commands)}`, GLOBAL_FLAGS, ENVIRONMENT, exitCodes()].join(
    '\n\n'
  )
}

export function renderCommandHelp(command: Command): string {
  const parts = [`gf ${command.path.join(' ')} — ${command.summary}`, `Usage\n  ${command.usage}`]
  if (command.detail) parts.push(command.detail)
  if (command.flags.length > 0) {
    const width = Math.max(
      ...command.flags.map((flag) => `--${flag.name}${flag.value ? ` ${flag.value}` : ''}`.length)
    )
    parts.push(
      [
        'Flags',
        ...command.flags.map((flag) => {
          const left = `--${flag.name}${flag.value ? ` ${flag.value}` : ''}`
          return `  ${pad(left, width)}  ${flag.describe}`
        }),
      ].join('\n')
    )
  }
  parts.push(exitCodes())
  return parts.join('\n\n')
}
