// golden-frijoles-cli · Sprint 2 — the write verbs' argument contract and the D2 exit code.
//
// What is asserted HERE is what a caller can express and what exit code they get. What each verb
// MEANS is asserted in `packages/sdk/src/flag-commands.test.ts`, against the planners, because that
// is where the meaning lives (D4). Neither file duplicates the other.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Module from 'node:module'

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
const { EXIT } = await import('./exit-codes.ts')

const TOKEN = `gf_pat_${'a'.repeat(32)}`

function capture() {
  const out: string[] = []
  const err: string[] = []
  return { writer: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) }, out, err }
}

function sandbox(): NodeJS.ProcessEnv {
  const home = mkdtempSync(join(tmpdir(), 'gf-write-'))
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    GOLDEN_FRIJOLES_TOKEN: TOKEN,
    GOLDEN_FRIJOLES_PROJECT: 'acme',
  }
}

type Sent = { url: string; body: Record<string, unknown> }

function stubWrite(response: { status?: number; body: unknown }, sent: Sent[] = []): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    sent.push({
      url: url.pathname,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
    })
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

/** A fetch that FAILS the test if it is reached. Used to prove a refusal happened locally. */
const noNetwork = (() => {
  throw new Error('nothing should have been sent')
}) as unknown as typeof fetch

const APPLIED = {
  ok: true,
  outcome: 'applied',
  flagKey: 'checkout.demo_enabled',
  version: 1,
  versionId: 'v1',
  serving: true,
  environments: [
    { environment: 'development', status: 'applied', snapshotVersion: 1 },
    { environment: 'preview', status: 'applied', snapshotVersion: 1 },
    { environment: 'production', status: 'applied', snapshotVersion: 1 },
  ],
}

// ── create: polarity ──────────────────────────────────────────────────────────────────────────

test('create sends the polarity and --all-envs, and exits 0 on a clean apply', async () => {
  const sent: Sent[] = []
  const { writer } = capture()
  const code = await run({
    argv: ['flags', 'create', 'checkout.demo_enabled', '--kill-switch', '--all-envs'],
    writer,
    env: sandbox(),
    fetchImpl: stubWrite({ body: APPLIED }, sent),
  })
  assert.equal(code, EXIT.OK)
  assert.equal(sent[0].url, '/api/v1/cli/flags/write')
  assert.equal(sent[0].body.command, 'create')
  assert.equal(sent[0].body.polarity, 'kill-switch')
  assert.equal(sent[0].body.allEnvs, true)
  // A reason is always sent — the audit trail's `why` column is never blank, and the RPC rejects
  // an empty one with an opaque error rather than a useful sentence.
  assert.equal(typeof sent[0].body.reason, 'string')
})

test('⚠️ --kill-switch --enablement is refused LOCALLY — the one contradiction argv can carry', async () => {
  // The planner's input type cannot forbid it, because a command line can carry both words. It is
  // refused before the request so no planner ever has to pick between them.
  const { writer } = capture()
  const code = await run({
    argv: ['flags', 'create', 'a.b', '--kill-switch', '--enablement', '--all-envs'],
    writer,
    env: sandbox(),
    fetchImpl: noNetwork,
  })
  assert.equal(code, EXIT.USAGE)
})

test('create with NO polarity refuses rather than defaulting to one', async () => {
  // Guessing "enablement" would create a flag serving false for someone who meant a kill-switch,
  // and the two are opposites on the day they matter.
  const { writer } = capture()
  assert.equal(
    await run({
      argv: ['flags', 'create', 'a.b', '--all-envs'],
      writer,
      env: sandbox(),
      fetchImpl: noNetwork,
    }),
    EXIT.USAGE
  )
})

test('--type with a polarity is refused — polarity is a boolean concept', async () => {
  const { writer, err } = capture()
  const code = await run({
    argv: ['flags', 'create', 'ui.theme', '--type', 'string', '--kill-switch', '--all-envs'],
    writer,
    env: sandbox(),
    fetchImpl: noNetwork,
  })
  assert.equal(code, EXIT.USAGE)
  assert.match(err.join('\n'), /boolean/)
})

// ── environments ──────────────────────────────────────────────────────────────────────────────

test('⚠️ --all-envs together with --env is a usage error, not a union', async () => {
  // A caller who typed both meant one of them. Picking either silently is how a change reaches an
  // environment nobody named.
  const { writer } = capture()
  assert.equal(
    await run({
      argv: ['flags', 'kill', 'a.b', '--all-envs', '--env', 'production'],
      writer,
      env: sandbox(),
      fetchImpl: noNetwork,
    }),
    EXIT.USAGE
  )
})

test('naming no environment at all is refused before anything is sent', async () => {
  const { writer } = capture()
  assert.equal(
    await run({ argv: ['flags', 'kill', 'a.b'], writer, env: sandbox(), fetchImpl: noNetwork }),
    EXIT.USAGE
  )
})

test('a misspelled environment is named back, and nothing is sent', async () => {
  const { writer, err } = capture()
  const code = await run({
    argv: ['flags', 'kill', 'a.b', '--env', 'prod'],
    writer,
    env: sandbox(),
    fetchImpl: noNetwork,
  })
  assert.equal(code, EXIT.USAGE)
  assert.match(err.join('\n'), /prod/)
})

test('repeated --env sends both environments', async () => {
  const sent: Sent[] = []
  const { writer } = capture()
  await run({
    argv: ['flags', 'kill', 'a.b', '--env', 'preview', '--env', 'production'],
    writer,
    env: sandbox(),
    fetchImpl: stubWrite({ body: APPLIED }, sent),
  })
  assert.deepEqual(sent[0].body.environments, ['preview', 'production'])
})

// ── D2: the partial exit code ─────────────────────────────────────────────────────────────────

test('⚠️ a PARTIAL answers 200 and still exits 5, naming which environments failed', async () => {
  // The whole of D2. The definition version WAS created and one environment DID change, so this is
  // neither a success nor a clean failure — and a CLI with no code for it forces the caller to
  // parse prose to find out which.
  const { writer, out } = capture()
  const code = await run({
    argv: ['flags', 'create', 'a.b', '--kill-switch', '--all-envs', '--json'],
    writer,
    env: sandbox(),
    fetchImpl: stubWrite({
      body: {
        ok: true,
        outcome: 'partial',
        flagKey: 'a.b',
        version: 1,
        versionId: 'v1',
        serving: true,
        environments: [
          { environment: 'development', status: 'applied', snapshotVersion: 1 },
          {
            environment: 'preview',
            status: 'conflict',
            snapshotVersion: null,
            error: 'someone else changed it',
          },
          { environment: 'production', status: 'failed', snapshotVersion: null, error: 'boom' },
        ],
      },
    }),
  })
  assert.equal(code, EXIT.PARTIAL)
  const report = JSON.parse(out.join('\n')) as {
    outcome: string
    environments: Array<{ environment: string; status: string }>
  }
  assert.equal(report.outcome, 'partial')
  assert.deepEqual(
    report.environments.map((row) => row.status),
    ['applied', 'conflict', 'failed']
  )
})

test('a 409 from the write route is EXIT.CONFLICT — the one an agent can resolve itself', async () => {
  const { writer } = capture()
  const code = await run({
    argv: ['flags', 'kill', 'a.b', '--env', 'production'],
    writer,
    env: sandbox(),
    fetchImpl: stubWrite({
      status: 409,
      body: { ok: false, code: 'conflict', error: 'Someone else changed this environment.' },
    }),
  })
  assert.equal(code, EXIT.CONFLICT)
})

// ── set ───────────────────────────────────────────────────────────────────────────────────────

test('--value true|false maps to the SDK’s own on/off variant keys', async () => {
  for (const [value, variantKey] of [
    ['true', 'on'],
    ['false', 'off'],
  ] as const) {
    const sent: Sent[] = []
    const { writer } = capture()
    await run({
      argv: ['flags', 'set', 'a.b', '--value', value, '--env', 'production'],
      writer,
      env: sandbox(),
      fetchImpl: stubWrite({ body: APPLIED }, sent),
    })
    assert.equal(sent[0].body.variantKey, variantKey)
  }
})

test('--value and --variant together are refused — two ways to say one thing', async () => {
  const { writer } = capture()
  assert.equal(
    await run({
      argv: ['flags', 'set', 'a.b', '--value', 'true', '--variant', 'on', '--env', 'production'],
      writer,
      env: sandbox(),
      fetchImpl: noNetwork,
    }),
    EXIT.USAGE
  )
})

test('--value with something that is not true/false points at --variant', async () => {
  const { writer, err } = capture()
  const code = await run({
    argv: ['flags', 'set', 'a.b', '--value', 'dark', '--env', 'production'],
    writer,
    env: sandbox(),
    fetchImpl: noNetwork,
  })
  assert.equal(code, EXIT.USAGE)
  assert.match(err.join('\n'), /--variant/)
})

// ── rollout ───────────────────────────────────────────────────────────────────────────────────

test('rollout sends the percent as a NUMBER, so the one conversion seam sees a number', async () => {
  const sent: Sent[] = []
  const { writer } = capture()
  await run({
    argv: ['flags', 'rollout', 'a.b', '--percent', '25', '--env', 'production'],
    writer,
    env: sandbox(),
    fetchImpl: stubWrite({ body: APPLIED }, sent),
  })
  assert.equal(sent[0].body.percent, 25)
  assert.equal(typeof sent[0].body.percent, 'number')
})

test('a non-numeric --percent is refused locally', async () => {
  const { writer } = capture()
  assert.equal(
    await run({
      argv: ['flags', 'rollout', 'a.b', '--percent', 'lots', '--env', 'production'],
      writer,
      env: sandbox(),
      fetchImpl: noNetwork,
    }),
    EXIT.USAGE
  )
})

// ── rules ─────────────────────────────────────────────────────────────────────────────────────

test('rules reads a file and refuses one that is not an array, naming the path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gf-rules-'))
  const path = join(dir, 'rules.json')
  writeFileSync(path, '{"not":"an array"}')
  const { writer, err } = capture()
  const code = await run({
    argv: ['flags', 'rules', 'a.b', '--rules-file', path, '--env', 'production'],
    writer,
    env: sandbox(),
    fetchImpl: noNetwork,
  })
  assert.equal(code, EXIT.USAGE)
  assert.match(err.join('\n'), /ARRAY/)
})

test('a missing rules file names the PATH and the reason, not just "could not read rules"', async () => {
  const { writer, err } = capture()
  const code = await run({
    argv: ['flags', 'rules', 'a.b', '--rules-file', '/nope/rules.json', '--env', 'production'],
    writer,
    env: sandbox(),
    fetchImpl: noNetwork,
  })
  assert.equal(code, EXIT.USAGE)
  assert.match(err.join('\n'), /\/nope\/rules\.json/)
})

// ── sync ──────────────────────────────────────────────────────────────────────────────────────

test('⚠️ sync REFUSES to fall back to the CLI token when no flag_sync key is set', async () => {
  // The security property of this verb. Falling back would quietly hand a pipeline the wider
  // credential the moment someone forgot to set the narrow one.
  const dir = mkdtempSync(join(tmpdir(), 'gf-cat-'))
  const path = join(dir, 'flags.json')
  writeFileSync(path, '[]')
  const { writer, err } = capture()
  const code = await run({
    argv: ['flags', 'sync', '--file', path],
    writer,
    env: sandbox(), // carries GOLDEN_FRIJOLES_TOKEN, and deliberately no sync key
    fetchImpl: noNetwork,
  })
  assert.equal(code, EXIT.AUTH)
  assert.match(err.join('\n'), /flag_sync/)
})

test('sync --dry-run sends nothing, and works without any credential at all', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gf-cat-'))
  const path = join(dir, 'flags.json')
  writeFileSync(path, JSON.stringify([{ key: 'a.b', definition: {} }]))
  const { writer, out } = capture()
  const code = await run({
    argv: ['flags', 'sync', '--file', path, '--dry-run', '--json'],
    writer,
    env: { HOME: mkdtempSync(join(tmpdir(), 'gf-empty-')) },
    fetchImpl: noNetwork,
  })
  assert.equal(code, EXIT.OK)
  assert.equal((JSON.parse(out.join('\n')) as { dryRun: boolean }).dryRun, true)
})

// ── keys ──────────────────────────────────────────────────────────────────────────────────────

test('keys create REQUIRES --type — there is no default kind', async () => {
  // The three kinds have three blast radii. A default would hand out one of them by accident.
  const { writer } = capture()
  assert.equal(
    await run({
      argv: ['keys', 'create', '--label', 'x'],
      writer,
      env: sandbox(),
      fetchImpl: noNetwork,
    }),
    EXIT.USAGE
  )
})

test('a flag_read key without --env, and a flag_sync key without --source, are refused locally', async () => {
  for (const argv of [
    ['keys', 'create', '--type', 'flag_read', '--label', 'x'],
    ['keys', 'create', '--type', 'flag_sync', '--label', 'x'],
  ]) {
    const { writer } = capture()
    assert.equal(
      await run({ argv, writer, env: sandbox(), fetchImpl: noNetwork }),
      EXIT.USAGE,
      argv.join(' ')
    )
  }
})

test('keys revoke requires the kind, so the audit trail cannot be chosen by the endpoint', async () => {
  const { writer } = capture()
  assert.equal(
    await run({ argv: ['keys', 'revoke', 'some-id'], writer, env: sandbox(), fetchImpl: noNetwork }),
    EXIT.USAGE
  )
})

test('a minted key is printed, and the report carries its id', async () => {
  const { writer, out } = capture()
  const code = await run({
    argv: ['keys', 'create', '--type', 'ingest', '--label', 'ci', '--json'],
    writer,
    env: sandbox(),
    fetchImpl: stubWrite({
      body: {
        ok: true,
        id: 'key-9',
        type: 'ingest',
        label: 'ci',
        scope: null,
        expiresAt: null,
        key: 'gb_key_x',
      },
    }),
  })
  assert.equal(code, EXIT.OK)
  const body = JSON.parse(out.join('\n')) as { id: string; key: string }
  assert.equal(body.id, 'key-9')
  // The plaintext IS in this output, once, deliberately — it is the only time it exists.
  assert.equal(body.key, 'gb_key_x')
})

// ── diff ──────────────────────────────────────────────────────────────────────────────────────

test('diff refuses both forms at once, and neither — it never guesses which was meant', async () => {
  for (const argv of [
    ['flags', 'diff', 'a.b'],
    ['flags', 'diff', 'a.b', '--from', '1', '--to', '2', '--env', 'preview', '--env', 'production'],
  ]) {
    const { writer } = capture()
    assert.equal(
      await run({ argv, writer, env: sandbox(), fetchImpl: noNetwork }),
      EXIT.USAGE,
      argv.join(' ')
    )
  }
})

test('diff describes a rollout change in PERCENT, using the console’s own differ', async () => {
  const definition = (basisPoints: number) => ({
    valueType: 'boolean',
    description: 'Checkout demo.',
    defaultVariantKey: 'off',
    variants: [
      { key: 'off', value: false },
      { key: 'on', value: true },
    ],
    rules: [{ priority: 1, clauses: [], rollout: { basisPoints }, variantKey: 'on' }],
  })
  const { writer, out } = capture()
  const code = await run({
    argv: ['flags', 'diff', 'a.b', '--from', '1', '--to', '2', '--json'],
    writer,
    env: sandbox(),
    fetchImpl: stubWrite({
      body: {
        ok: true,
        project: 'acme',
        flag: {
          key: 'a.b',
          valueType: 'boolean',
          description: 'Checkout demo.',
          latestVersion: 2,
          environments: [],
          audit: [],
          versions: [
            { version: 1, versionId: 'v1', createdAt: 'x', definition: definition(1000), servedBy: [] },
            { version: 2, versionId: 'v2', createdAt: 'y', definition: definition(2500), servedBy: [] },
          ],
        },
        environments: [],
      },
    }),
  })
  assert.equal(code, EXIT.OK)
  const report = JSON.parse(out.join('\n')) as { changes: string[] }
  // ⚠️ PERCENT, not basis points. "rollout 1000 → 2500" is a true statement about the database and
  // a false one about what the operator changed.
  assert.ok(
    report.changes.some((change) => change.includes('10%') && change.includes('25%')),
    `expected a percent sentence, got: ${JSON.stringify(report.changes)}`
  )
})

// ── think-skills S3 · `gf north-star set` (D6) ─────────────────────────────────────────────────────────────────────
// The route's MEANING is asserted in apps/web/e2e/cli-north-star.spec.ts. Here: what is sent, how many times, what
// is refused locally, and which exit code comes out.

const NORTH_STAR_FILE = (payload: unknown, extra = '') =>
  `---\nkind: north-star\nstatus: agreed\nupdated: 2026-10-01\n---\n\n# North Star\n\n## Input metrics\n\n${extra}## Sync payload\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`

const PROPOSED = {
  metric: {
    key: 'weekly_planned_seeds',
    name: 'Weekly planned seeds',
    description: 'seeds groomed per week',
  },
  inputs: [
    { key: 'activated_projects', name: 'Activated projects', valueSource: 'external_push' },
    {
      key: 'seeds_groomed',
      name: 'Seeds groomed',
      valueSource: 'telemetry_event',
      sourceEvent: 'seed_groomed',
    },
  ],
}

function workspace(markdown: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'gf-north-star-'))
  writeFileSync(join(dir, 'north-star.md'), markdown)
  return dir
}

type Call = { method: string; url: string; body: Record<string, unknown> }

/** GET answers `current`; POST answers `post`. Every call is recorded. */
function stubNorthStar(
  current: unknown[],
  post: { status?: number; body: unknown } = {
    body: { ok: true, project: 'acme', metric: 'weekly_planned_seeds', inputsSynced: 2 },
  },
  calls: Call[] = []
): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    calls.push({
      method,
      url: `${url.pathname}${url.search}`,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
    })
    const response =
      method === 'GET' ? { status: 200, body: { ok: true, project: 'acme', metrics: current } } : post
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

test('north-star set: the default is a dry run — one GET, no POST, and it says nothing was sent', async () => {
  const { writer, out } = capture()
  const calls: Call[] = []
  const cwd = workspace(NORTH_STAR_FILE(PROPOSED))
  const code = await run({
    argv: ['north-star', 'set', 'north-star.md'],
    writer,
    env: sandbox(),
    cwd,
    fetchImpl: stubNorthStar([], undefined, calls),
  })
  assert.equal(code, EXIT.OK)
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.url}`),
    ['GET /api/v1/cli/north-star?project=acme']
  )
  const text = out.join('\n')
  assert.match(text, /weekly_planned_seeds {2}"Weekly planned seeds" {2}new/)
  assert.match(text, /Dry run: nothing was sent/)
})

test('north-star set --yes: exactly one POST, carrying the file’s block under `sync`', async () => {
  const { writer, out } = capture()
  const calls: Call[] = []
  const cwd = workspace(NORTH_STAR_FILE(PROPOSED))
  const code = await run({
    argv: ['north-star', 'set', 'north-star.md', '--yes'],
    writer,
    env: sandbox(),
    cwd,
    fetchImpl: stubNorthStar([], undefined, calls),
  })
  assert.equal(code, EXIT.OK)
  const posts = calls.filter((c) => c.method === 'POST')
  assert.equal(posts.length, 1)
  assert.equal(posts[0].url, '/api/v1/cli/north-star')
  assert.deepEqual(posts[0].body, { project: 'acme', sync: PROPOSED })
  assert.match(out.join('\n'), /ok · North Star weekly_planned_seeds synced to acme · 2 inputs/)
})

test('north-star set --yes: a 400 prints the route’s issues and exits non-zero', async () => {
  const { writer, err } = capture()
  const cwd = workspace(NORTH_STAR_FILE(PROPOSED))
  const refused = {
    status: 400,
    body: {
      ok: false,
      code: 'invalid',
      error: 'Malformed north-star sync payload',
      issues: {
        formErrors: [],
        fieldErrors: { inputs: ["sourceEvent is required for 'telemetry_event' inputs"] },
      },
    },
  }
  const code = await run({
    argv: ['north-star', 'set', 'north-star.md', '--yes'],
    writer,
    env: sandbox(),
    cwd,
    fetchImpl: stubNorthStar([], refused),
  })
  assert.equal(code, EXIT.USAGE)
  const text = err.join('\n')
  assert.match(text, /Malformed north-star sync payload/)
  assert.match(text, /- inputs: sourceEvent is required/)
})

test('north-star set: `ok: false` in a 200 body is still a failure — the exit code comes from the body', async () => {
  const { writer } = capture()
  const cwd = workspace(NORTH_STAR_FILE(PROPOSED))
  const code = await run({
    argv: ['north-star', 'set', 'north-star.md', '--yes'],
    writer,
    env: sandbox(),
    cwd,
    fetchImpl: stubNorthStar([], {
      status: 200,
      body: { ok: false, code: 'server_error', error: 'Failed to sync leading inputs' },
    }),
  })
  assert.equal(code, EXIT.SERVER)
})

test('north-star set: a credential the server refuses exits 2', async () => {
  const { writer } = capture()
  const cwd = workspace(NORTH_STAR_FILE(PROPOSED))
  const refuseAll = (async () =>
    new Response(
      JSON.stringify({ ok: false, code: 'unauthorized', error: 'This CLI credential is not accepted.' }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }
    )) as unknown as typeof fetch
  const code = await run({
    argv: ['north-star', 'set', 'north-star.md', '--yes'],
    writer,
    env: sandbox(),
    cwd,
    fetchImpl: refuseAll,
  })
  assert.equal(code, EXIT.AUTH)
})

test('north-star set: zero or two json blocks is a usage error, and nothing is sent', async () => {
  const none = '---\nkind: north-star\n---\n\n## Sync payload\n\nno block here\n'
  const two = NORTH_STAR_FILE(PROPOSED).replace(
    '## Sync payload\n\n',
    '## Sync payload\n\n```json\n{}\n```\n\n'
  )
  for (const markdown of [none, two]) {
    const { writer, err } = capture()
    const code = await run({
      argv: ['north-star', 'set', 'north-star.md'],
      writer,
      env: sandbox(),
      cwd: workspace(markdown),
      fetchImpl: noNetwork,
    })
    assert.equal(code, EXIT.USAGE)
    assert.match(err.join('\n'), /Nothing was sent/)
  }
})

test('north-star set --yes: an unfilled template is refused before any request', async () => {
  const { writer, err } = capture()
  const template = {
    metric: { key: '<metric_key>', name: '<Pithy name>' },
    inputs: [{ key: '<input_key>', name: '<Input name>', valueSource: 'external_push' }],
  }
  const code = await run({
    argv: ['north-star', 'set', 'north-star.md', '--yes'],
    writer,
    env: sandbox(),
    cwd: workspace(NORTH_STAR_FILE(template)),
    fetchImpl: noNetwork,
  })
  assert.equal(code, EXIT.USAGE)
  assert.match(
    err.join('\n'),
    /placeholders \(metric\.key, metric\.name, inputs\[0\]\.key, inputs\[0\]\.name\)/
  )
})

test('north-star set: the dry run names what a sync cannot undo — an added metric and a moved input', async () => {
  const { writer, out } = capture()
  const current = [
    {
      key: 'payable_sellers',
      name: 'Payable sellers',
      description: null,
      inputs: [
        {
          key: 'activated_projects',
          name: 'Activated projects',
          valueSource: 'external_push',
          sourceEvent: null,
        },
      ],
    },
  ]
  const cwd = workspace(NORTH_STAR_FILE(PROPOSED))
  const code = await run({
    argv: ['north-star', 'set', 'north-star.md'],
    writer,
    env: sandbox(),
    cwd,
    fetchImpl: stubNorthStar(current),
  })
  assert.equal(code, EXIT.OK)
  const text = out.join('\n')
  assert.match(text, /already has another North Star: payable_sellers/)
  assert.match(text, /ADDS this one beside it\. It never replaces or deletes/)
  assert.match(text, /activated_projects +Activated projects +moved from payable_sellers/)
  assert.match(text, /seeds_groomed +Seeds groomed +new/)
})

test('north-star set: an input whose value source would change is shown as refused before sending', async () => {
  const { writer, out } = capture()
  const current = [
    {
      key: 'weekly_planned_seeds',
      name: 'Weekly planned seeds',
      description: 'seeds groomed per week',
      inputs: [
        { key: 'seeds_groomed', name: 'Seeds groomed', valueSource: 'external_push', sourceEvent: null },
      ],
    },
  ]
  const cwd = workspace(NORTH_STAR_FILE(PROPOSED))
  await run({
    argv: ['north-star', 'set', 'north-star.md'],
    writer,
    env: sandbox(),
    cwd,
    fetchImpl: stubNorthStar(current),
  })
  const text = out.join('\n')
  assert.match(text, /weekly_planned_seeds {2}"Weekly planned seeds" {2}unchanged/)
  assert.match(text, /seeds_groomed +Seeds groomed +refused: value source is external_push/)
})
