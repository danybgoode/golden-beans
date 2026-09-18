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
