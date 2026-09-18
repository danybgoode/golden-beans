// golden-frijoles-cli · Sprint 1 — the CLI's behaviour, driven in-process.
//
// Every test here runs the REAL dispatcher with a captured writer, an injected `fetch` and a
// throwaway HOME. Nothing spawns a process, so a test can assert an exit code, the exact bytes, AND
// what was written to disk — and a developer's own credentials file is never touched.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Module from 'node:module'
import { execFileSync } from 'node:child_process'

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
      return nextResolve(
        specifier.endsWith('/commands') ? `${specifier}/index.ts` : `${specifier}.ts`,
        context
      )
    }
    return nextResolve(specifier, context)
  },
})

const { run } = await import('./run.ts')
const { EXIT, exitForServerCode } = await import('./exit-codes.ts')
const { parseArgs, flagValues, boolFlag } = await import('./args.ts')
const { credentialsPath, normalizeApiUrl, readCredentials, writeCredentials } =
  await import('./credentials.ts')
const { gitignoreCovers, readEnvValue, upsertEnvValue, ENV_KEYS } = await import('./commands/init.ts')
const { VERSION } = await import('./version.ts')

const TOKEN = `gf_pat_${'a'.repeat(32)}`

/** A fetch that FAILS the test if it is reached — proof that a path answered without the network. */
const noNetworkFetch = (() => {
  throw new Error('the network must not be touched')
}) as unknown as typeof fetch

function capture() {
  const out: string[] = []
  const err: string[] = []
  return {
    writer: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) },
    out,
    err,
    all: () => [...out, ...err].join('\n'),
  }
}

function sandbox(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv & { HOME: string } {
  const home = mkdtempSync(join(tmpdir(), 'gf-test-'))
  return { HOME: home, XDG_CONFIG_HOME: join(home, '.config'), ...extra }
}

function stubFetch(
  routes: Record<string, { status?: number; body: unknown }>,
  seen?: Array<{ method: string; url: string; body: unknown }>
): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    seen?.push({
      method: init?.method ?? 'GET',
      url: `${url.pathname}${url.search}`,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const match = routes[`${url.pathname}${url.search}`] ?? routes[url.pathname]
    if (!match) throw new Error(`stubFetch has no answer for ${url.pathname}${url.search}`)
    return new Response(JSON.stringify(match.body), {
      status: match.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

const WHOAMI = {
  ok: true,
  account: { userId: 'user-1', email: 'someone@example.com' },
  credential: { id: 'token-1', label: 'my laptop' },
  projects: [{ slug: 'acme', role: 'owner' }],
}

// ── The parser ────────────────────────────────────────────────────────────────────────────────

test('two boolean flags in a row do not eat each other', () => {
  // ⚠️ The failure this prevents is a WRONG RESULT from a correct-looking command line: without the
  // boolean allow-list, `--all-envs --kill-switch` parses the polarity as the VALUE of --all-envs.
  const args = parseArgs(['flags', 'create', 'a.b', '--all-envs', '--kill-switch'])
  assert.equal(boolFlag(args, 'all-envs'), true)
  assert.equal(boolFlag(args, 'kill-switch'), true)
  // The leading bare words are the PATH. `run()` matches the longest command prefix and hands the
  // leftovers to the verb as positionals — which is how a verb gets its subject without the parser
  // having to know the arity of every command.
  assert.deepEqual(args.path, ['flags', 'create', 'a.b'])
  assert.deepEqual(args.positionals, [])
})

test('a repeated flag accumulates, so --env can be given more than once', () => {
  const args = parseArgs(['flags', 'kill', 'a.b', '--env', 'preview', '--env', 'production'])
  assert.deepEqual(flagValues(args, 'env'), ['preview', 'production'])
})

test('--flag=value works, and an explicit =false is honoured over the boolean default', () => {
  assert.equal(boolFlag(parseArgs(['x', '--json=false']), 'json'), false)
  assert.equal(boolFlag(parseArgs(['x', '--json']), 'json'), true)
})

test('a value-taking flag with nothing after it records EMPTY, not true', () => {
  // So the command reports "--env needs a value" instead of treating it as a boolean it is not.
  const args = parseArgs(['flags', 'ls', '--project'])
  assert.deepEqual(args.flags.get('project'), [''])
  assert.deepEqual(flagValues(args, 'project'), [])
})

test('everything after -- is a positional, even if it starts with a dash', () => {
  const args = parseArgs(['flags', 'rules', 'a.b', '--', '--weird.json'])
  assert.deepEqual(args.positionals, ['--weird.json'])
})

// ── The dispatcher ────────────────────────────────────────────────────────────────────────────

test('gf --version prints the version and exits 0 with no credential and no network', async () => {
  const { writer, out } = capture()
  const code = await run({ argv: ['--version'], writer, env: sandbox() })
  assert.equal(code, EXIT.OK)
  assert.deepEqual(out, [VERSION])
})

test('gf with no arguments prints help and exits 0 — asking what this is, is not an error', async () => {
  const { writer, out } = capture()
  const code = await run({ argv: [], writer, env: sandbox() })
  assert.equal(code, EXIT.OK)
  assert.match(out.join('\n'), /Commands/)
})

test('an unknown command exits USAGE, not 0', async () => {
  const { writer } = capture()
  assert.equal(await run({ argv: ['frobnicate'], writer, env: sandbox() }), EXIT.USAGE)
})

test('⚠️ an unknown FLAG is a usage error, not something ignored', async () => {
  // An agent that types --environment for --env and is silently ignored gets a flag created in the
  // wrong place with exit 0 — the CLI agreeing with a command nobody wrote.
  const { writer, err } = capture()
  const code = await run({
    argv: ['flags', 'ls', '--environment', 'production'],
    writer,
    env: sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN }),
  })
  assert.equal(code, EXIT.USAGE)
  assert.match(err.join('\n'), /--environment/)
})

test('a command that needs auth refuses with EXIT.AUTH before touching the network', async () => {
  const { writer } = capture()
  const code = await run({
    argv: ['whoami'],
    writer,
    env: sandbox(),
    // A fetch that would THROW if called. The refusal must not have reached it.
    fetchImpl: (() => {
      throw new Error('the network must not be touched without a credential')
    }) as unknown as typeof fetch,
  })
  assert.equal(code, EXIT.AUTH)
})

test('gf doctor runs WITHOUT a credential — diagnosing that is its job', async () => {
  const { writer, out } = capture()
  const code = await run({ argv: ['doctor', '--json'], writer, env: sandbox() })
  // Non-zero, because something IS wrong — but it ran, and said what.
  assert.equal(code, EXIT.AUTH)
  const report = JSON.parse(out.join('\n')) as { checks: Array<{ id: string; status: string }> }
  assert.ok(report.checks.some((check) => check.id === 'credential' && check.status === 'fail'))
})

test('⚠️ gf doctor never prints key material, in either mode', async () => {
  for (const argv of [['doctor'], ['doctor', '--json']]) {
    const { writer, all } = capture()
    await run({
      argv,
      writer,
      env: sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN }),
      fetchImpl: stubFetch({ '/api/v1/cli/whoami': { body: WHOAMI } }),
    })
    assert.equal(
      all().includes(TOKEN),
      false,
      `\`gf ${argv.join(' ')}\` printed the token. Its output is the thing people paste into an issue.`
    )
  }
})

test('gf doctor names a TRUNCATED paste as a shape problem, without a round-trip', async () => {
  const { writer, out } = capture()
  const code = await run({
    argv: ['doctor', '--json'],
    writer,
    env: sandbox({ GOLDEN_FRIJOLES_TOKEN: 'gf_pat_short' }),
    fetchImpl: (() => {
      throw new Error('the shape check must answer before the network')
    }) as unknown as typeof fetch,
  })
  assert.equal(code, EXIT.AUTH)
  const report = JSON.parse(out.join('\n')) as { checks: Array<{ id: string; status: string }> }
  assert.ok(report.checks.some((check) => check.id === 'credential-shape' && check.status === 'fail'))
})

test('a server `code` maps to its own exit code, and an unknown one does not become 0', () => {
  assert.equal(exitForServerCode('unauthorized'), EXIT.AUTH)
  assert.equal(exitForServerCode('not_found'), EXIT.NOT_FOUND)
  assert.equal(exitForServerCode('conflict'), EXIT.CONFLICT)
  assert.equal(exitForServerCode('invalid'), EXIT.USAGE)
  assert.equal(exitForServerCode('disabled'), EXIT.SERVER)
  assert.equal(exitForServerCode('something-nobody-has-shipped'), EXIT.SERVER)
  assert.notEqual(exitForServerCode(undefined), EXIT.OK)
})

test('a network failure is EXIT.SERVER and says which host it could not reach', async () => {
  const { writer, err } = capture()
  const code = await run({
    argv: ['whoami'],
    writer,
    env: sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN, GOLDEN_FRIJOLES_URL: 'https://nowhere.example' }),
    fetchImpl: (() => Promise.reject(new Error('getaddrinfo ENOTFOUND'))) as unknown as typeof fetch,
  })
  assert.equal(code, EXIT.SERVER)
  assert.match(err.join('\n'), /nowhere\.example/)
})

test('a non-JSON body is a failure, never an empty success', async () => {
  const { writer } = capture()
  const code = await run({
    argv: ['whoami'],
    writer,
    env: sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN }),
    fetchImpl: (async () =>
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof fetch,
  })
  assert.equal(code, EXIT.SERVER)
})

// ── Credentials on disk ───────────────────────────────────────────────────────────────────────

test('the credentials file is written 0600 — and re-written 0600 over a loose one', () => {
  const env = sandbox()
  const path = credentialsPath(env)
  writeCredentials({ token: TOKEN, apiUrl: 'https://example.test' }, env)
  assert.equal(statSync(path).mode & 0o777, 0o600)

  // ⚠️ The second write is the one that used to be wrong. `writeFileSync`'s `mode` applies only when
  // the file is CREATED, so a file loosened by hand stayed loose through every later login.
  chmodSync(path, 0o644)
  writeCredentials({ token: TOKEN, apiUrl: 'https://example.test' }, env)
  assert.equal(statSync(path).mode & 0o777, 0o600)
})

test('GOLDEN_FRIJOLES_TOKEN wins over the saved file — the CI path writes nothing', async () => {
  const env = sandbox({ GOLDEN_FRIJOLES_TOKEN: `gf_pat_${'b'.repeat(32)}` })
  writeCredentials({ token: TOKEN, apiUrl: 'https://example.test' }, env)
  const seen: Array<{ method: string; url: string; body: unknown }> = []
  const { writer } = capture()
  await run({
    argv: ['whoami'],
    writer,
    env,
    fetchImpl: stubFetch({ '/api/v1/cli/whoami': { body: WHOAMI } }, seen),
  })
  // The file still holds the old token: nothing about a run overwrites it.
  assert.equal(readCredentials(env)?.token, TOKEN)
})

test('a corrupt credentials file reads as "not signed in" rather than throwing', () => {
  const env = sandbox()
  const path = credentialsPath(env)
  mkdirSync(join(env.XDG_CONFIG_HOME!, 'golden-frijoles'), { recursive: true })
  writeFileSync(path, '{ this is not json')
  assert.equal(readCredentials(env), null)
})

test('a bare hostname gets https, and loopback gets http — never the other way round', () => {
  assert.equal(normalizeApiUrl('goldenfrijoles.com'), 'https://goldenfrijoles.com')
  assert.equal(normalizeApiUrl('localhost:3000'), 'http://localhost:3000')
  assert.equal(normalizeApiUrl('127.0.0.1:3000'), 'http://127.0.0.1:3000')
  // Guessing http for a public hostname would downgrade a credential-bearing request to plaintext.
  assert.equal(normalizeApiUrl('example.test/'), 'https://example.test')
  assert.equal(normalizeApiUrl('https://example.test/'), 'https://example.test')
})

// ── login ─────────────────────────────────────────────────────────────────────────────────────

test('gf login VERIFIES the token before saving it', async () => {
  const env = sandbox()
  const { writer } = capture()
  const code = await run({
    argv: ['login', '--token', TOKEN, '--api', 'https://example.test'],
    writer,
    env,
    fetchImpl: stubFetch({
      '/api/v1/cli/whoami': { status: 401, body: { ok: false, code: 'unauthorized', error: 'nope' } },
    }),
  })
  assert.equal(code, EXIT.AUTH)
  // ⚠️ Nothing on disk. A saved-but-invalid credential fails every LATER command with THAT
  // command's error, which is how an afternoon goes into debugging `gf flags ls`.
  assert.equal(existsSync(credentialsPath(env)), false)
})

test('gf login saves the token and adopts the account’s project', async () => {
  const env = sandbox()
  const { writer } = capture()
  const code = await run({
    argv: ['login', '--token', TOKEN, '--api', 'https://example.test'],
    writer,
    env,
    fetchImpl: stubFetch({ '/api/v1/cli/whoami': { body: WHOAMI } }),
  })
  assert.equal(code, EXIT.OK)
  const saved = readCredentials(env)
  assert.equal(saved?.token, TOKEN)
  assert.equal(saved?.apiUrl, 'https://example.test')
  assert.equal(saved?.activeProject, 'acme')
})

test('gf logout forgets the credential and SAYS the token is not revoked', async () => {
  const env = sandbox()
  writeCredentials({ token: TOKEN, apiUrl: 'https://example.test' }, env)
  const { writer, all } = capture()
  assert.equal(await run({ argv: ['logout'], writer, env }), EXIT.OK)
  assert.equal(readCredentials(env), null)
  assert.match(all(), /NOT revoked/)
})

// ── projects use ──────────────────────────────────────────────────────────────────────────────

test('gf projects use REFUSES a slug the account cannot reach, and writes nothing', async () => {
  const env = sandbox()
  writeCredentials({ token: TOKEN, apiUrl: 'https://example.test', activeProject: 'acme' }, env)
  const { writer } = capture()
  const code = await run({
    argv: ['projects', 'use', 'someone-elses'],
    writer,
    env,
    fetchImpl: stubFetch({ '/api/v1/cli/projects': { body: { ok: true, projects: WHOAMI.projects } } }),
  })
  assert.equal(code, EXIT.NOT_FOUND)
  assert.equal(readCredentials(env)?.activeProject, 'acme')
})

// ── init ──────────────────────────────────────────────────────────────────────────────────────

test('gitignoreCovers recognises the four spellings people actually use', () => {
  for (const line of ['.env.local', '.env*.local', '.env*', '*.local']) {
    assert.equal(gitignoreCovers(`node_modules\n${line}\n`), true, line)
  }
  assert.equal(gitignoreCovers('node_modules\n.env\n'), false)
})

test('upsertEnvValue REPLACES rather than duplicating — a dotenv file’s last wins', () => {
  const before = 'A=1\nGOLDEN_FRIJOLES_URL=http://old\nB=2\n'
  const after = upsertEnvValue(before, 'GOLDEN_FRIJOLES_URL', 'https://new')
  assert.equal(after, 'A=1\nGOLDEN_FRIJOLES_URL=https://new\nB=2\n')
  assert.equal(readEnvValue(after, 'GOLDEN_FRIJOLES_URL'), 'https://new')
})

test('gf init writes .env.local at 0600, ignores it, and prints the snippet that reads it', async () => {
  const env = sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN, GOLDEN_FRIJOLES_PROJECT: 'acme' })
  const cwd = mkdtempSync(join(tmpdir(), 'gf-repo-'))
  const { writer, out } = capture()
  const code = await run({
    argv: ['init', '--env', 'production', '--json'],
    writer,
    env,
    cwd,
    fetchImpl: stubFetch({
      '/api/v1/cli/keys': {
        body: { ok: true, id: 'key-1', key: 'gb_key_secret', type: 'flag_read', expiresAt: null },
      },
    }),
  })
  assert.equal(code, EXIT.OK)

  const envFile = readFileSync(join(cwd, '.env.local'), 'utf8')
  assert.equal(readEnvValue(envFile, ENV_KEYS.flagRead), 'gb_key_secret')
  assert.equal(readEnvValue(envFile, ENV_KEYS.environment), 'production')
  assert.equal(statSync(join(cwd, '.env.local')).mode & 0o777, 0o600)
  assert.match(readFileSync(join(cwd, '.gitignore'), 'utf8'), /\.env\.local/)

  const report = JSON.parse(out.join('\n')) as { mintedKeyId: string; snippet: string }
  // ⚠️ The key ID, never the key. Under --json this output is captured by CI and by agents.
  assert.equal(report.mintedKeyId, 'key-1')
  assert.equal(out.join('\n').includes('gb_key_secret'), false)
  // The snippet reads exactly the names the file now carries (D6) — generated together, so they
  // cannot drift.
  for (const name of Object.values(ENV_KEYS)) assert.match(report.snippet, new RegExp(name))
})

test('gf init is IDEMPOTENT: a second run mints nothing', async () => {
  const env = sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN, GOLDEN_FRIJOLES_PROJECT: 'acme' })
  const cwd = mkdtempSync(join(tmpdir(), 'gf-repo-'))
  const seen: Array<{ method: string; url: string; body: unknown }> = []
  const fetchImpl = stubFetch(
    {
      '/api/v1/cli/keys': {
        body: { ok: true, id: 'key-1', key: 'gb_key_secret', type: 'flag_read', expiresAt: null },
      },
      // The second run PROBES the key it found. "Still works" now means BOTH that it resolves and
      // that it names the environment being set up — `gf init` defaults to development here.
      '/api/v1/flags/snapshot': {
        body: { ok: true, contractVersion: 1, environment: 'development', flags: [] },
      },
    },
    seen
  )
  const first = capture()
  await run({ argv: ['init', '--json'], writer: first.writer, env, cwd, fetchImpl })
  const second = capture()
  const code = await run({ argv: ['init', '--json'], writer: second.writer, env, cwd, fetchImpl })

  assert.equal(code, EXIT.OK)
  assert.equal(seen.filter((call) => call.url === '/api/v1/cli/keys').length, 1, 'a second key was minted')
  const report = JSON.parse(second.out.join('\n')) as {
    reusedExistingKey: boolean
    mintedKeyId: null
    existingKeyState: string
  }
  assert.equal(report.reusedExistingKey, true)
  assert.equal(report.mintedKeyId, null)
  assert.equal(report.existingKeyState, 'live')
})

test('\u26a0\ufe0f gf init REPLACES a revoked or expired key rather than reporting it reused', async () => {
  // The defect this closes (Codex, PR #149): "there is a key" is not "the key works". A `flag_read`
  // key is minted with an expiry and can be revoked from the console, and a rerun after either
  // reported success while leaving the project unable to resolve a flag.
  const env = sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN, GOLDEN_FRIJOLES_PROJECT: 'acme' })
  const cwd = mkdtempSync(join(tmpdir(), 'gf-repo-'))
  writeFileSync(join(cwd, '.gitignore'), '.env.local\n')
  writeFileSync(join(cwd, '.env.local'), `${ENV_KEYS.flagRead}=gb_key_revoked\n`)

  const seen: Array<{ method: string; url: string; body: unknown }> = []
  const { writer, out } = capture()
  const code = await run({
    argv: ['init', '--json'],
    writer,
    env,
    cwd,
    fetchImpl: stubFetch(
      {
        // The key in the file no longer resolves.
        '/api/v1/flags/snapshot': { status: 401, body: { ok: false, error: 'Invalid flag read credential' } },
        '/api/v1/cli/keys': {
          body: { ok: true, id: 'key-2', key: 'gb_key_fresh', type: 'flag_read', expiresAt: null },
        },
      },
      seen
    ),
  })

  assert.equal(code, EXIT.OK)
  assert.equal(seen.filter((call) => call.url === '/api/v1/cli/keys').length, 1, 'no replacement was minted')
  assert.equal(readEnvValue(readFileSync(join(cwd, '.env.local'), 'utf8'), ENV_KEYS.flagRead), 'gb_key_fresh')
  const report = JSON.parse(out.join('\n')) as { existingKeyState: string; reusedExistingKey: boolean }
  assert.equal(report.existingKeyState, 'dead')
  assert.equal(report.reusedExistingKey, false)
})

test('an UNVERIFIABLE key refuses retryably, and nothing is minted or rewritten', async () => {
  // Round 7's rule: a key is reused only when VERIFIED live for this environment. When the probe
  // cannot speak (flag serving off answers 404), neither the key's scope nor the environment line
  // beside it is known to be true — so init refuses rather than guessing either way.
  const env = sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN, GOLDEN_FRIJOLES_PROJECT: 'acme' })
  const cwd = mkdtempSync(join(tmpdir(), 'gf-repo-'))
  writeFileSync(join(cwd, '.gitignore'), '.env.local\n')
  const before = `${ENV_KEYS.flagRead}=gb_key_unknown\n`
  writeFileSync(join(cwd, '.env.local'), before)

  const seen: Array<{ method: string; url: string; body: unknown }> = []
  const { writer } = capture()
  const code = await run({
    argv: ['init', '--json'],
    writer,
    env,
    cwd,
    fetchImpl: stubFetch({ '/api/v1/flags/snapshot': { status: 404, body: {} } }, seen),
  })

  assert.equal(code, EXIT.SERVER)
  assert.equal(
    seen.filter((call) => call.url === '/api/v1/cli/keys').length,
    0,
    'a key was minted on a guess'
  )
  // Byte-identical: no environment line was added beside a key whose scope is unknown.
  assert.equal(readFileSync(join(cwd, '.env.local'), 'utf8'), before)
})

test('⚠️ gf init REFUSES rather than minting into a repository it cannot protect', async () => {
  const env = sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN, GOLDEN_FRIJOLES_PROJECT: 'acme' })
  const cwd = mkdtempSync(join(tmpdir(), 'gf-repo-'))
  // A DIRECTORY called .gitignore: writing to it throws, which is the reachable stand-in for a
  // read-only or otherwise unwritable ignore file.
  mkdirSync(join(cwd, '.gitignore'))
  const { writer } = capture()
  const code = await run({
    argv: ['init', '--json'],
    writer,
    env,
    cwd,
    fetchImpl: (() => {
      throw new Error('nothing may be minted before .gitignore is settled')
    }) as unknown as typeof fetch,
  })
  assert.equal(code, EXIT.USAGE)
  assert.equal(existsSync(join(cwd, '.env.local')), false)
})

test('\u26a0\ufe0f gf init REFUSES when git does not actually ignore .env.local', async () => {
  // A line in .gitignore is not the same fact as "git ignores this file": a file that is ALREADY
  // TRACKED ignores .gitignore entirely. `gf init` used to print "ignored by git" on the strength of
  // having appended the line (fresh reviewer, PR #149) — a checkable claim, asserted rather than
  // checked, on the one property that keeps a live credential out of a public repository.
  const env = sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN, GOLDEN_FRIJOLES_PROJECT: 'acme' })
  const cwd = mkdtempSync(join(tmpdir(), 'gf-tracked-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' })
  git('init', '-q')
  git('config', 'user.email', 'spec@example.test')
  git('config', 'user.name', 'spec')
  // Tracked FIRST, then ignored. This is the real-world shape: someone committed the file once.
  writeFileSync(join(cwd, '.env.local'), 'EXISTING=1\n')
  git('add', '.env.local')
  git('commit', '-qm', 'track it')
  writeFileSync(join(cwd, '.gitignore'), '.env.local\n')

  const { writer, err } = capture()
  const code = await run({
    argv: ['init'],
    writer,
    env,
    cwd,
    fetchImpl: (() => {
      throw new Error('nothing may be minted into a repository that would commit the credential')
    }) as unknown as typeof fetch,
  })

  assert.equal(code, EXIT.USAGE)
  assert.match(err.join('\n'), /git rm --cached/)
  // And the file is untouched — no credential was written into a tracked file.
  assert.equal(readFileSync(join(cwd, '.env.local'), 'utf8'), 'EXISTING=1\n')
})

test('\u26a0\ufe0f gf init REPLACES a live key that reads a DIFFERENT environment', async () => {
  // A `flag_read` credential is scoped to ONE environment, and a live-but-wrong key is the most
  // dangerous of the three states: the probe said "works", init kept it, and then wrote
  // GOLDEN_FRIJOLES_ENVIRONMENT=production beside a development credential. The app then believes it
  // is reading production flags and is reading development's, with nothing saying so (Codex, round 4).
  const env = sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN, GOLDEN_FRIJOLES_PROJECT: 'acme' })
  const cwd = mkdtempSync(join(tmpdir(), 'gf-env-'))
  writeFileSync(join(cwd, '.gitignore'), '.env.local\n')
  writeFileSync(join(cwd, '.env.local'), `${ENV_KEYS.flagRead}=gb_key_development\n`)

  const seen: Array<{ method: string; url: string; body: unknown }> = []
  const { writer, out } = capture()
  const code = await run({
    argv: ['init', '--env', 'production', '--json'],
    writer,
    env,
    cwd,
    fetchImpl: stubFetch(
      {
        // Live — but for development, while production is being set up.
        '/api/v1/flags/snapshot': {
          body: { ok: true, contractVersion: 1, environment: 'development', flags: [] },
        },
        '/api/v1/cli/keys': {
          body: { ok: true, id: 'key-prod', key: 'gb_key_production', type: 'flag_read', expiresAt: null },
        },
      },
      seen
    ),
  })

  assert.equal(code, EXIT.OK)
  const report = JSON.parse(out.join('\n')) as { existingKeyState: string; mintedKeyId: string }
  assert.equal(report.existingKeyState, 'wrong-environment')
  assert.equal(report.mintedKeyId, 'key-prod')
  const envFile = readFileSync(join(cwd, '.env.local'), 'utf8')
  assert.equal(readEnvValue(envFile, ENV_KEYS.flagRead), 'gb_key_production')
  assert.equal(readEnvValue(envFile, ENV_KEYS.environment), 'production')
  // And the mint really happened — not just a relabelled report.
  assert.equal(seen.filter((call) => call.url === '/api/v1/cli/keys').length, 1)
})

test('\u26a0\ufe0f gf init REFUSES a symlinked .env.local, and writes nothing', async () => {
  // The ignore check answers about the PATH; `writeFileSync` follows the LINK. An ignored
  // `.env.local` pointing at a tracked file passes every check and then writes a live credential
  // into a file git is watching — the outcome `ensureIgnored` exists to prevent, reached around it
  // (cross-family review, Codex, round 2).
  const env = sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN, GOLDEN_FRIJOLES_PROJECT: 'acme' })
  const cwd = mkdtempSync(join(tmpdir(), 'gf-link-'))
  writeFileSync(join(cwd, '.gitignore'), '.env.local\n')
  writeFileSync(join(cwd, 'tracked.env'), 'SECRET_ALREADY_COMMITTED=1\n')
  symlinkSync(join(cwd, 'tracked.env'), join(cwd, '.env.local'))

  const { writer, err } = capture()
  const code = await run({
    argv: ['init'],
    writer,
    env,
    cwd,
    fetchImpl: (() => {
      throw new Error('nothing may be minted before the link is refused')
    }) as unknown as typeof fetch,
  })

  assert.equal(code, EXIT.USAGE)
  assert.match(err.join('\n'), /symlink/)
  // The target is untouched — no credential followed the link.
  assert.equal(readFileSync(join(cwd, 'tracked.env'), 'utf8'), 'SECRET_ALREADY_COMMITTED=1\n')
})

test('\u26a0\ufe0f --json --help emits ONE JSON document, not the plain-text help', async () => {
  // `output.ts` states the contract in one line: under --json, stdout carries exactly one JSON
  // document and nothing else. The help path wrote straight to the writer and bypassed the emitter,
  // so an agent piping `gf --json --help` into a parser got a wall of prose (Codex, round 2).
  for (const argv of [
    ['--json', '--help'],
    ['flags', 'ls', '--json', '--help'],
    ['help', 'whoami', '--json'],
  ]) {
    const { writer, out, err } = capture()
    const code = await run({ argv, writer, env: sandbox(), fetchImpl: noNetworkFetch })
    assert.equal(code, EXIT.OK, argv.join(' '))
    assert.equal(out.length, 1, `${argv.join(' ')} wrote ${out.length} times to stdout`)
    assert.deepEqual(err, [], argv.join(' '))
    const parsed = JSON.parse(out[0]) as { ok: boolean; help: unknown }
    assert.equal(parsed.ok, true)
    assert.ok(parsed.help, `${argv.join(' ')} carried no help payload`)
  }
})

test('\u26a0\ufe0f gf init mints NOTHING when .env.local cannot be written', async () => {
  // Minting first and discovering the file is unwritable leaves a LIVE credential nobody holds —
  // unrevokable by the caller, who never saw it — and a retry mints another (Codex, round 3).
  const env = sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN, GOLDEN_FRIJOLES_PROJECT: 'acme' })
  const cwd = mkdtempSync(join(tmpdir(), 'gf-ro-'))
  writeFileSync(join(cwd, '.gitignore'), '.env.local\n')
  writeFileSync(join(cwd, '.env.local'), '')
  chmodSync(join(cwd, '.env.local'), 0o400)

  const { writer } = capture()
  const code = await run({
    argv: ['init'],
    writer,
    env,
    cwd,
    fetchImpl: (() => {
      throw new Error('nothing may be minted before the file is known to be writable')
    }) as unknown as typeof fetch,
  })
  assert.equal(code, EXIT.USAGE)
})

test('dotenv duplicates: the LAST assignment is read, and an upsert leaves exactly one', () => {
  // `dotenv` assigns in file order, so a later line overrides an earlier one. Reading the first
  // meant `gf init` could probe and rewrite one key while the app resolved another (Codex, round 3).
  const duplicated = `${ENV_KEYS.flagRead}=first\nOTHER=1\n${ENV_KEYS.flagRead}=last\n`
  assert.equal(readEnvValue(duplicated, ENV_KEYS.flagRead), 'last')

  const upserted = upsertEnvValue(duplicated, ENV_KEYS.flagRead, 'chosen')
  // ONE occurrence, so there is nothing left for the two functions to disagree about.
  assert.equal(upserted.split('\n').filter((line) => line.startsWith(`${ENV_KEYS.flagRead}=`)).length, 1)
  assert.equal(readEnvValue(upserted, ENV_KEYS.flagRead), 'chosen')
  // ...and the unrelated line survives.
  assert.equal(readEnvValue(upserted, 'OTHER'), '1')
})

test('\u26a0\ufe0f a flag given an EMPTY value is refused, never defaulted — `--project "$UNSET"`', async () => {
  // Every resolver is `flagValue(...)?.trim() || default`, so '' silently fell back to the
  // remembered project and minted a credential for a tenant the caller did not name (Codex, round 6).
  for (const argv of [
    ['init', '--project', ''],
    ['init', '--project='],
    ['flags', 'kill', 'a.b', '--env', ''],
  ]) {
    const { writer } = capture()
    const code = await run({
      argv,
      writer,
      env: sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN, GOLDEN_FRIJOLES_PROJECT: 'remembered' }),
      fetchImpl: noNetworkFetch,
    })
    assert.equal(code, EXIT.USAGE, JSON.stringify(argv))
  }
})

test('\u26a0\ufe0f gf init refuses to re-point an UNVERIFIED key at a different environment', async () => {
  // Cannot-check + about-to-change is the mismatched config `wrong-environment` exists to prevent,
  // reached by the back door (Codex, round 6).
  const env = sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN, GOLDEN_FRIJOLES_PROJECT: 'acme' })
  const cwd = mkdtempSync(join(tmpdir(), 'gf-unv-'))
  writeFileSync(join(cwd, '.gitignore'), '.env.local\n')
  const before = `${ENV_KEYS.flagRead}=gb_key_old\n${ENV_KEYS.environment}=development\n`
  writeFileSync(join(cwd, '.env.local'), before)
  const { writer } = capture()
  const code = await run({
    argv: ['init', '--env', 'production'],
    writer,
    env,
    cwd,
    fetchImpl: stubFetch({ '/api/v1/flags/snapshot': { status: 404, body: {} } }),
  })
  assert.equal(code, EXIT.SERVER)
  // Untouched — no half-rewritten config.
  assert.equal(readFileSync(join(cwd, '.env.local'), 'utf8'), before)
})

test('\u26a0\ufe0f global flags work BEFORE the verb — `gf --json flags ls` is not root help', async () => {
  // The parser collected the verb only until the first flag, so this printed root help with exit 0:
  // a success code and none of the output asked for (Codex, round 8).
  const { writer, out } = capture()
  const code = await run({
    argv: ['--json', 'flags', 'ls', '--project', 'acme'],
    writer,
    env: sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN }),
    fetchImpl: stubFetch({
      '/api/v1/cli/flags?project=acme': { body: { ok: true, project: 'acme', flags: [], environments: [] } },
    }),
  })
  assert.equal(code, EXIT.OK)
  const body = JSON.parse(out.join('\n')) as { flags?: unknown; help?: unknown }
  assert.ok(Array.isArray(body.flags), 'expected the flags listing, got root help')
  assert.equal(body.help, undefined)
})

test('a flag value never leaks into the verb path', () => {
  const args = parseArgs(['--env', 'production', 'flags', 'kill', 'a.b'])
  assert.deepEqual(args.path, ['flags', 'kill', 'a.b'])
  assert.deepEqual(flagValues(args, 'env'), ['production'])
})

// ── the reading verbs ─────────────────────────────────────────────────────────────────────────

test('gf flags ls refuses to guess a project when none was chosen', async () => {
  const { writer } = capture()
  const code = await run({
    argv: ['flags', 'ls'],
    writer,
    env: sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN }),
    fetchImpl: (() => {
      throw new Error('no project chosen — nothing should be requested')
    }) as unknown as typeof fetch,
  })
  assert.equal(code, EXIT.USAGE)
})

test('under --json, stdout carries exactly ONE parseable document and stderr is empty', async () => {
  const { writer, out, err } = capture()
  await run({
    argv: ['flags', 'ls', '--project', 'acme', '--json'],
    writer,
    env: sandbox({ GOLDEN_FRIJOLES_TOKEN: TOKEN }),
    fetchImpl: stubFetch({
      '/api/v1/cli/flags?project=acme': { body: { ok: true, project: 'acme', flags: [], environments: [] } },
    }),
  })
  assert.equal(out.length, 1, 'more than one write reached stdout under --json')
  assert.deepEqual(err, [])
  JSON.parse(out[0])
})
