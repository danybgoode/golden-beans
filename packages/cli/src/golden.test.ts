// golden-frijoles-cli · D5 — the agent-facing contract, as bytes.
//
// ── Why a golden file and not "assert the help mentions --json" ───────────────────────────────
// An agent handed `gf --help` reads it to learn what this tool can do, and an agent handed
// `gf … --json` parses the shape it gets. Both are contracts, and a contract that a copy edit can
// change silently is a contract with no teeth (the epic's words). A spot-check assertion moves with
// the text it checks; a byte diff does not.
//
// **Updating a golden file is the normal way to change one of these.** Run with `UPDATE_GOLDEN=1`
// and READ THE DIFF — that diff is the whole point. It is the moment someone decides whether a
// rename is worth breaking every agent that already scrapes the old name.
//
// ── The --json shapes are recorded from a REAL run ───────────────────────────────────────────
// Each envelope below comes from running the actual dispatcher in-process against an injected
// `fetch` — not from a hand-written object that would agree with itself. A fixture typed by hand is
// a fixture that keeps agreeing after the code stops matching it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Module from 'node:module'

// The extensionless-import hook this repo uses in every unit test over source that ships
// extensionless relative imports. Source must stay extensionless (allowing `.ts` there would let
// app code ship `.ts` imports, trading a caught type error for an uncaught build break); only
// *.test.ts opts into the looser rule, so the modules under test are reached through this.
type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown

const registerHooks = (Module as typeof Module & { registerHooks: (hooks: { resolve: ResolveHook }) => void })
  .registerHooks

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      typeof context.parentURL === 'string' &&
      context.parentURL.includes('/packages/cli/src/') &&
      specifier.startsWith('.') &&
      !specifier.endsWith('.ts')
    ) {
      // `./commands` resolves to `./commands/index.ts`, the way a bundler would.
      const candidate = specifier.endsWith('/commands') ? `${specifier}/index.ts` : `${specifier}.ts`
      return nextResolve(candidate, context)
    }
    return nextResolve(specifier, context)
  },
})

const { COMMANDS } = await import('./commands/index.ts')
const { renderCommandHelp, renderRootHelp } = await import('./help.ts')
const { run } = await import('./run.ts')

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), '__golden__')
const UPDATE = process.env.UPDATE_GOLDEN === '1'

function golden(name: string, actual: string) {
  const path = join(GOLDEN_DIR, name)
  if (UPDATE) {
    mkdirSync(GOLDEN_DIR, { recursive: true })
    writeFileSync(path, actual.endsWith('\n') ? actual : `${actual}\n`)
  }
  // ⚠️ A MISSING golden file FAILS. The obvious convenience — write it and pass on the first run —
  // is a guard that heals itself: delete the file the contract lives in and the test goes green,
  // which is the "a guard can be green for the wrong reason" trap this repo keeps finding
  // (CODE-QUALITY #5b). Recording a new one is a deliberate act with a flag on it.
  assert.ok(
    existsSync(path),
    `${name} has no golden file. If this contract is new, record it with UPDATE_GOLDEN=1 and commit ` +
      `the file — a contract with no recorded bytes is not a contract.`
  )
  const expected = readFileSync(path, 'utf8')
  assert.equal(
    actual.endsWith('\n') ? actual : `${actual}\n`,
    expected,
    `${name} changed. This is an agent-facing contract — read the diff, decide whether the change is ` +
      `intended, then re-record with UPDATE_GOLDEN=1.`
  )
}

test('gf --help is byte-identical to its golden file', () => {
  golden('help.txt', renderRootHelp(COMMANDS))
})

for (const command of COMMANDS) {
  const name = command.path.join('-')
  test(`gf ${command.path.join(' ')} --help is byte-identical to its golden file`, () => {
    golden(`help-${name}.txt`, renderCommandHelp(command))
  })
}

// ── The `--json` envelopes ────────────────────────────────────────────────────────────────────

/** A writer that captures, so the dispatcher can be driven in-process. */
function capture() {
  const out: string[] = []
  const err: string[] = []
  return { writer: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) }, out, err }
}

/** A `fetch` that answers from a table, and FAILS LOUDLY on a request nobody planned for. */
function stubFetch(routes: Record<string, { status?: number; body: unknown }>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input.toString())
    const key = `${url.pathname}${url.search}`
    const match = routes[key] ?? routes[url.pathname]
    if (!match) throw new Error(`stubFetch has no answer for ${key}`)
    return new Response(JSON.stringify(match.body), {
      status: match.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

/** A throwaway HOME so a developer's real credentials file is never read or written by a test. */
function sandbox(): NodeJS.ProcessEnv {
  const home = mkdtempSync(join(tmpdir(), 'gf-golden-'))
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    GOLDEN_FRIJOLES_TOKEN: `gf_pat_${'a'.repeat(32)}`,
  }
}

const WHOAMI = {
  ok: true,
  account: { userId: 'user-1', email: 'someone@example.com' },
  credential: { id: 'token-1', label: 'my laptop' },
  projects: [{ slug: 'acme', role: 'owner' }],
}

const FLAGS = {
  ok: true,
  project: 'acme',
  flags: [
    {
      key: 'checkout.demo_enabled',
      valueType: 'boolean',
      description: 'Checkout demo.',
      latestVersion: 2,
      environments: [
        {
          environment: 'development',
          state: 'on',
          version: 2,
          serving: true,
          readable: true,
          updatedAt: '2026-09-17T00:00:00.000Z',
        },
        {
          environment: 'preview',
          state: 'off',
          version: null,
          serving: null,
          readable: true,
          updatedAt: '2026-09-17T00:00:00.000Z',
        },
        {
          environment: 'production',
          state: 'never',
          version: null,
          serving: null,
          readable: true,
          updatedAt: null,
        },
      ],
    },
  ],
  environments: [{ environment: 'production', snapshotVersion: 7, updatedAt: '2026-09-17T00:00:00.000Z' }],
}

test('gf --json --help has the recorded MACHINE-READABLE shape', async () => {
  // Added in review round 2, with the fix that made `--json --help` emit JSON at all. It is a
  // contract for the same reason the text form is: an agent reads it to learn the verbs, so a
  // renamed field breaks every agent that already scrapes the old one.
  const { writer, out } = capture()
  const code = await run({ argv: ['--json', '--help'], writer, env: sandbox() })
  assert.equal(code, 0)
  golden('json-help.json', out.join('\n'))
})

test('gf whoami --json has the recorded shape', async () => {
  const { writer, out } = capture()
  const code = await run({
    argv: ['whoami', '--json'],
    writer,
    env: sandbox(),
    fetchImpl: stubFetch({ '/api/v1/cli/whoami': { body: WHOAMI } }),
  })
  assert.equal(code, 0)
  golden('json-whoami.json', out.join('\n'))
})

test('gf projects ls --json has the recorded shape', async () => {
  const { writer, out } = capture()
  const code = await run({
    argv: ['projects', 'ls', '--json'],
    writer,
    env: sandbox(),
    fetchImpl: stubFetch({ '/api/v1/cli/projects': { body: { ok: true, projects: WHOAMI.projects } } }),
  })
  assert.equal(code, 0)
  golden('json-projects-ls.json', out.join('\n'))
})

test('gf flags ls --json has the recorded shape', async () => {
  const { writer, out } = capture()
  const code = await run({
    argv: ['flags', 'ls', '--project', 'acme', '--json'],
    writer,
    env: sandbox(),
    fetchImpl: stubFetch({ '/api/v1/cli/flags?project=acme': { body: FLAGS } }),
  })
  assert.equal(code, 0)
  golden('json-flags-ls.json', out.join('\n'))
})

test('a FAILURE envelope has the recorded shape, and goes to stdout under --json', async () => {
  // The reflex is stderr, and it is wrong here: under `--json` the machine-readable failure IS the
  // result, and a caller who captured stdout and got an empty string cannot tell a failure from a
  // command that produced nothing.
  const { writer, out, err } = capture()
  const code = await run({
    argv: ['flags', 'ls', '--project', 'acme', '--json'],
    writer,
    env: sandbox(),
    fetchImpl: stubFetch({
      '/api/v1/cli/flags?project=acme': {
        status: 404,
        body: { ok: false, code: 'not_found', error: 'No project `acme` is available to this account.' },
      },
    }),
  })
  assert.equal(code, 3)
  assert.deepEqual(err, [], 'under --json nothing may reach stderr')
  golden('json-error.json', out.join('\n'))
})
