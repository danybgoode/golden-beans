// The weld between what `/install` tells a reader to type and what is actually published.
//
// ⚠️ It reads `packages/cli/package.json` off DISK rather than importing it, because D4 forbids
// `apps/web` depending on the CLI package — the dependency runs the other way. A test can look at a
// file that a module may not import, which is what makes the weld possible at all.
//
// The failure this prevents is ordinary: someone renames the binary or the package, every test in
// `packages/cli` still passes (they read the manifest too), and the public install page quietly
// keeps telling the world to run a command that no longer exists.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLI_BIN,
  CLI_GLOBAL_INSTALL,
  CLI_KILL_SWITCH_STORY,
  CLI_NPX_INIT,
  CLI_NPX_LOGIN,
  CLI_PACKAGE,
} from './cli-install.ts'

const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '..', '..', 'packages/cli/package.json'), 'utf8')
) as { name: string; bin: Record<string, string> }

test('the package the install page names is the package that is published', () => {
  assert.equal(CLI_PACKAGE, manifest.name)
})

test('the binary the install page names is the binary that is published', () => {
  assert.deepEqual(Object.keys(manifest.bin), [CLI_BIN])
})

test('every printed command uses those two names and nothing else', () => {
  for (const command of [CLI_NPX_INIT, CLI_NPX_LOGIN, CLI_GLOBAL_INSTALL]) {
    assert.match(command, new RegExp(CLI_PACKAGE.replace('/', '\\/')), command)
  }
  for (const command of CLI_KILL_SWITCH_STORY) {
    assert.ok(command.startsWith(`${CLI_BIN} `), `${command} does not invoke ${CLI_BIN}`)
  }
})

test('the kill-switch story is the three verbs the epic promises, in order', () => {
  // create → roll out → kill. Asserted as a sequence because the story is the sequence: a page that
  // listed them in some other order would be teaching something the epic did not claim.
  assert.deepEqual(
    CLI_KILL_SWITCH_STORY.map((command) => command.split(' ')[2]),
    ['create', 'rollout', 'kill']
  )
  assert.match(CLI_KILL_SWITCH_STORY[0], /--kill-switch --all-envs$/)
})

// ── The half of the weld that was missing (cross-family review, Codex, PR #151) ─────────────────
//
// The tests above prove the page names the right PACKAGE and BINARY. They did not prove the page's
// COMMANDS exist: rename `--kill-switch` in the CLI, and every test in both packages stayed green
// while `/install` kept teaching a flag that no longer parses. The claim "one surface" was only
// half enforced.
//
// The CLI's own recorded `--json --help` is the machine-readable truth about what `gf` accepts —
// every verb and every flag it declares — and it is pinned by the CLI's golden test, so it cannot
// drift from the CLI either. Read off DISK, for the same D4 reason as the manifest above.

type RecordedHelp = {
  help: {
    commands: Array<{ command: string; flags: Array<{ flag: string }> }>
    globalFlags: string[]
  }
}

const recorded = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', '..', 'packages/cli/src/__golden__/json-help.json'),
    'utf8'
  )
) as RecordedHelp

/** Check one printed command line against what the CLI actually declares. */
function assertRealCommand(line: string) {
  const words = line.replace(/^npx \S+ /, `${CLI_BIN} `).split(/\s+/)
  assert.equal(words[0], CLI_BIN, `${line} does not invoke ${CLI_BIN}`)
  const bare = words.slice(1).filter((word) => !word.startsWith('-'))
  // The LONGEST verb the CLI declares that prefixes the bare words — the dispatcher's own rule.
  const verb = recorded.help.commands
    .map((entry) => entry.command)
    .filter((command) => bare.join(' ').startsWith(command))
    .sort((left, right) => right.length - left.length)[0]
  assert.ok(verb, `\`${line}\` names no verb the CLI declares`)
  const declared = new Set([
    ...recorded.help.globalFlags,
    ...recorded.help.commands.find((entry) => entry.command === verb)!.flags.map((flag) => flag.flag),
  ])
  for (const flag of words.filter((word) => word.startsWith('--'))) {
    assert.ok(declared.has(flag), `\`${line}\` passes ${flag}, which \`gf ${verb}\` does not declare`)
  }
}

test('every command /install prints is a verb and flags the CLI actually declares', () => {
  for (const line of [CLI_NPX_INIT, CLI_NPX_LOGIN, ...CLI_KILL_SWITCH_STORY]) assertRealCommand(line)
})

test('the guard above can fail: a renamed flag is caught', () => {
  // Without this, a checker that silently matched nothing — a bad path, an empty recording — would
  // pass the test above forever (CODE-QUALITY #5b).
  assert.throws(
    () => assertRealCommand(`${CLI_BIN} flags create x --kill-switchh --all-envs`),
    /--kill-switchh/
  )
  assert.throws(() => assertRealCommand(`${CLI_BIN} flags obliterate x`), /names no verb/)
})
