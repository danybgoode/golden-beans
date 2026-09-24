// golden-frijoles-plugin · S5.2 / S5.3 — `gf config`, `gf setup` and doctor's module lines, driven in-process.
//
// Every test runs the REAL dispatcher against the REAL kit config core (@golden-frijoles/kit, D10) in a
// throwaway project named by GF_PROJECT_ROOT, with a throwaway HOME. Nothing touches the network.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
const { setupIo, stepChoice, nextSteps } = await import('./commands/config.ts')
const { loadConfigCore } = await import('./config-core.ts')
const { moduleLines } = await import('./modules.ts')

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), '__golden__')
const CONFIG = 'golden-frijoles.config.json'

const noNetworkFetch = (() => {
  throw new Error('the network must not be touched')
}) as unknown as typeof fetch

function capture() {
  const out: string[] = []
  const err: string[] = []
  return { writer: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) }, out, err }
}

/** A fresh project and HOME. The project is named by GF_PROJECT_ROOT, the kit's own override. */
function project(files: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gf-config-'))
  mkdirSync(join(root, '.git'))
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), text)
  }
  const home = mkdtempSync(join(tmpdir(), 'gf-home-'))
  return { root, env: { HOME: home, XDG_CONFIG_HOME: join(home, '.config'), GF_PROJECT_ROOT: root } }
}

async function gf(argv: string[], env: NodeJS.ProcessEnv) {
  const { writer, out, err } = capture()
  const code = await run({ argv, writer, env, fetchImpl: noNetworkFetch })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

function golden(name: string, actual: string) {
  const path = join(GOLDEN_DIR, name)
  if (process.env.UPDATE_GOLDEN === '1') writeFileSync(path, actual.endsWith('\n') ? actual : `${actual}\n`)
  assert.ok(existsSync(path), `${name} has no golden file — record it with UPDATE_GOLDEN=1 and read it.`)
  assert.equal(actual.endsWith('\n') ? actual : `${actual}\n`, readFileSync(path, 'utf8'), `${name} changed.`)
}

// ── gf config ─────────────────────────────────────────────────────────────────────────────────

test('gf config set writes golden-frijoles.config.json through the kit core, and get reads it back', async () => {
  const { root, env } = project()
  const set = await gf(['config', 'set', 'review.reviewScope', 'every-pr', '--json'], env)
  assert.equal(set.code, EXIT.OK)
  assert.deepEqual(JSON.parse(set.out), { ok: true, key: 'review.reviewScope', value: 'every-pr' })
  assert.equal(JSON.parse(readFileSync(join(root, CONFIG), 'utf8')).review.reviewScope, 'every-pr')

  const get = await gf(['config', 'get', 'review.reviewScope'], env)
  assert.equal(get.code, EXIT.OK)
  assert.equal(get.out, 'every-pr')
})

test('gf config set reads a JSON value as JSON, and text as text', async () => {
  const { root, env } = project()
  await gf(['config', 'set', 'jev.egress', 'false'], env)
  await gf(['config', 'set', 'review.families', '["codex","claude"]'], env)
  const written = JSON.parse(readFileSync(join(root, CONFIG), 'utf8'))
  assert.equal(written.jev.egress, false)
  assert.deepEqual(written.review.families, ['codex', 'claude'])
})

test('gf config get falls back to the registry default when nothing sets the key', async () => {
  const { env } = project()
  const get = await gf(['config', 'get', 'smoke.defaultEnv', '--json'], env)
  assert.equal(get.code, EXIT.OK)
  assert.equal(JSON.parse(get.out).value, 'local')
})

test('⚠️ gf config set refuses a secret (EXIT.USAGE) and writes nothing', async () => {
  const { root, env } = project()
  // Golden Frijoles' own CLI credential first: the one a `gf` user is most likely to paste by mistake.
  for (const token of [`gf_pat_${'a'.repeat(32)}`, `ghp_${'a'.repeat(36)}`, 'postgres://u:pa55word@db/x']) {
    const set = await gf(['config', 'set', 'reporting.destination', token, '--json'], env)
    assert.equal(set.code, EXIT.USAGE, token)
    assert.equal(JSON.parse(set.out).code, 'invalid')
    assert.equal(existsSync(join(root, CONFIG)), false)
  }
})

test('a malformed golden-frijoles.config.json is a usage error naming the file, not a crash', async () => {
  const { env } = project({ [CONFIG]: '{ not json' })
  const list = await gf(['config', 'list', '--json'], env)
  assert.equal(list.code, EXIT.USAGE)
  assert.match(JSON.parse(list.out).error, /golden-frijoles\.config\.json/)
})

test('gf config list shows each section and where it came from, the new file winning over a legacy one', async () => {
  const { env } = project({
    'scripts/review-config.json': JSON.stringify({ reviewScope: 'security-paths-only', families: ['codex'] }),
    [CONFIG]: JSON.stringify({ review: { reviewScope: 'every-pr' } }),
  })
  const list = await gf(['config', 'list', '--json'], env)
  assert.equal(list.code, EXIT.OK)
  const body = JSON.parse(list.out)
  assert.equal(body.sections.review.reviewScope, 'every-pr')
  assert.deepEqual(body.sections.review.families, ['codex'])
  assert.ok(body.duplicates.includes('review.reviewScope'))
})

test('gf config needs no credential and no network', async () => {
  const { env } = project()
  const list = await gf(['config', 'list'], env)
  assert.equal(list.code, EXIT.OK)
  assert.match(list.out, /No settings yet/)
})

test('gf config get / set without their arguments are usage errors', async () => {
  const { env } = project()
  assert.equal((await gf(['config', 'get'], env)).code, EXIT.USAGE)
  assert.equal((await gf(['config', 'set', 'review.reviewScope'], env)).code, EXIT.USAGE)
})

// ── gf setup ──────────────────────────────────────────────────────────────────────────────────

test('gf setup off a terminal without --yes is a usage error and writes nothing', async () => {
  const { root, env } = project()
  const was = setupIo.isInteractive
  setupIo.isInteractive = () => false
  try {
    const setup = await gf(['setup', '--json'], env)
    assert.equal(setup.code, EXIT.USAGE)
    assert.match(JSON.parse(setup.out).error, /--yes/)
    assert.equal(existsSync(join(root, CONFIG)), false)
  } finally {
    setupIo.isInteractive = was
  }
})

test('after gf setup --yes, Plan reads configured: settings with a real default are not "missing"', async () => {
  const { env } = project()
  assert.equal((await gf(['setup', '--yes'], env)).code, EXIT.OK)
  const { modules } = await doctorModules(env)
  assert.equal(modules.find((line) => line.module === 'Plan')!.state, 'configured')
})

test('gf setup --yes saves the defaults, never the account answer, and says what is next', async () => {
  const { root, env } = project()
  const setup = await gf(['setup', '--yes', '--json'], env)
  assert.equal(setup.code, EXIT.OK)
  const body = JSON.parse(setup.out)
  assert.deepEqual(body.answers, {
    'project.mode': 'existing',
    'project.startPoint': 'idea',
    'project.account': 'later',
  })
  const written = JSON.parse(readFileSync(join(root, CONFIG), 'utf8'))
  assert.deepEqual(
    written.project,
    { mode: 'existing', startPoint: 'idea' },
    'store:env answers never reach the file'
  )
  assert.ok(body.next.some((step: string) => /groom/.test(step)))
})

test('gf setup asks the three setup questions in order, and the answers decide the next steps', async () => {
  const { root, env } = project()
  const asked: string[] = []
  const was = { ...setupIo }
  setupIo.isInteractive = () => true
  const picks: Record<string, unknown> = {
    'project.mode': 'planning-only',
    'project.startPoint': 'building',
    'project.account': 'now',
  }
  setupIo.chooser = () => async (entry) => {
    asked.push(entry.key)
    return picks[entry.key]
  }
  try {
    const setup = await gf(['setup', '--json'], env)
    assert.equal(setup.code, EXIT.OK)
    assert.deepEqual(asked, ['project.mode', 'project.startPoint', 'project.account'])
    const body = JSON.parse(setup.out)
    assert.ok(body.next.some((step: string) => /gf login/.test(step)))
    assert.ok(!body.next.some((step: string) => /kit.* init/.test(step)), 'planning-only never adds Roadmap/')
    assert.ok(body.next.some((step: string) => /live-smoke/.test(step)))
    assert.equal(JSON.parse(readFileSync(join(root, CONFIG), 'utf8')).project.mode, 'planning-only')
  } finally {
    Object.assign(setupIo, was)
  }
})

test('gf setup stopped mid-way (Ctrl-C) is a usage error and keeps what was already answered', async () => {
  const { root, env } = project()
  const was = { ...setupIo }
  setupIo.isInteractive = () => true
  setupIo.chooser = () => async (entry) => (entry.key === 'project.mode' ? 'new' : undefined)
  try {
    const setup = await gf(['setup', '--json'], env)
    assert.equal(setup.code, EXIT.USAGE)
    assert.equal(JSON.parse(readFileSync(join(root, CONFIG), 'utf8')).project.mode, 'new')
  } finally {
    Object.assign(setupIo, was)
  }
})

test('stepChoice: arrows wrap, Enter chooses, Esc takes the default, Ctrl-C aborts', () => {
  assert.equal(stepChoice(0, 3, { name: 'up' }).cursor, 2)
  assert.equal(stepChoice(2, 3, { name: 'down' }).cursor, 0)
  assert.equal(stepChoice(1, 3, { name: 'return' }).done, 'chosen')
  assert.equal(stepChoice(1, 3, { name: 'escape' }).done, 'default')
  assert.equal(stepChoice(1, 3, { name: 'c', ctrl: true }).done, 'abort')
  assert.equal(stepChoice(1, 3, { name: 'x' }).done, undefined)
})

test('nextSteps pins the kit version it prints', () => {
  assert.ok(
    nextSteps({ 'project.mode': 'existing' }, '0.4.0').some((step) =>
      step.includes('@golden-frijoles/kit@0.4.0 init')
    )
  )
})

// ── gf doctor's module lines (S5.3, D13) ──────────────────────────────────────────────────────

type Doctor = { modules: Array<{ module: string; state: string; detail: string; fix: string | null }> }

async function doctorModules(env: NodeJS.ProcessEnv) {
  const doctor = await gf(['doctor', '--json'], env)
  return { code: doctor.code, modules: (JSON.parse(doctor.out) as Doctor).modules }
}

test('doctor: a fresh project — every askable module is not configured, each with the command that fixes it', async () => {
  const { env } = project()
  const { modules } = await doctorModules(env)
  assert.deepEqual(
    modules.map((line) => line.module),
    ['Plan', 'Build', 'Ship', 'Measure', 'Spend', 'Operate']
  )
  for (const line of modules.filter((row) => row.state === 'not-configured'))
    assert.ok(line.fix, `${line.module}: not configured must name its fix`)
  const plan = modules.find((line) => line.module === 'Plan')!
  assert.equal(plan.state, 'not-configured')
  assert.match(plan.fix!, /gf setup/)
  const build = modules.find((line) => line.module === 'Build')!
  assert.match(build.fix!, /jev\.egress/, 'the egress question is named until it is answered (D12)')
  golden('json-doctor-modules-not-configured.json', JSON.stringify(modules, null, 2))
})

test('doctor: every question answered — the modules read configured', async () => {
  const { env } = project({
    [CONFIG]: JSON.stringify({
      project: { mode: 'existing', startPoint: 'building' },
      roadmap: { areas: ['01 Core'] },
      ways: { fillIns: 'Roadmap/fill-ins.yml' },
      review: { families: ['codex'], reviewScope: 'every-pr', securityPaths: ['auth/**'] },
      jev: { egress: false },
      smoke: { defaultEnv: 'preview' },
      ship: { killSwitchPolicy: 'every-risk-high-story-names-its-flag' },
      reporting: { destination: 'terminal' },
      deploy: { vercelProject: 'web' },
    }),
    '.env.local': 'GOLDEN_FRIJOLES_FLAG_READ_KEY=gf_flag_read_x\n',
  })
  const { modules } = await doctorModules(env)
  for (const name of ['Plan', 'Build', 'Ship', 'Measure', 'Spend', 'Operate'])
    assert.equal(modules.find((line) => line.module === name)!.state, 'configured', name)
  golden('json-doctor-modules-configured.json', JSON.stringify(modules, null, 2))
})

test('doctor: a malformed config file — every module is could not look, never "not configured"', async () => {
  const { env } = project({ [CONFIG]: '{ not json' })
  const { modules } = await doctorModules(env)
  assert.ok(modules.every((line) => line.state === 'could-not-look'))
  golden(
    'json-doctor-modules-could-not-look.json',
    JSON.stringify(
      // The path is a temp dir and the parser's wording is Node's, so neither is part of the contract.
      modules.map((line) => ({
        ...line,
        detail: line.detail
          .replace(/\/[^\s]*gf-config-[^/\s]+/g, '<project>')
          .replace(/not valid JSON.*$/, 'not valid JSON …'),
      })),
      null,
      2
    )
  )
})

test("⚠️ D13: module states never change doctor's exit code", async () => {
  const fresh = await doctorModules(project().env)
  const broken = await doctorModules(project({ [CONFIG]: '{ not json' }).env)
  const answered = await doctorModules(
    project({ [CONFIG]: JSON.stringify({ project: { mode: 'new' } }) }).env
  )
  assert.equal(fresh.code, EXIT.AUTH, 'no credential — the checks decide')
  assert.equal(broken.code, fresh.code)
  assert.equal(answered.code, fresh.code)
})

test('moduleLines: no core is could not look, with the reason', async () => {
  const lines = moduleLines(null, { root: null, hasCredential: false, unavailable: 'kit missing' })
  assert.ok(lines.every((line) => line.state === 'could-not-look' && line.detail === 'kit missing'))
  // and the real core loads (the dependency is installed), so the other two states above are not vacuous
  assert.ok((await loadConfigCore()).REGISTRY.length > 0)
})

test('gf config list and gf setup refuse stray arguments, writing nothing (cross-review of #164)', async () => {
  const { root, env } = project()
  assert.equal((await gf(['config', 'list', 'review'], env)).code, EXIT.USAGE)
  assert.equal((await gf(['setup', 'now', '--yes'], env)).code, EXIT.USAGE)
  assert.equal(existsSync(join(root, CONFIG)), false)
})

test('gf config set refuses a token hidden behind whitespace (security lens on #164; kit 0.5.1)', async () => {
  const { root, env } = project()
  const set = await gf(['config', 'set', 'reporting.destination', ` sk-${'a'.repeat(20)}`], env)
  assert.equal(set.code, EXIT.USAGE)
  assert.equal(existsSync(join(root, CONFIG)), false)
})

test('gf config list and get redact a secret a legacy file still holds (kit 0.5.2)', async () => {
  const token = `123456789:${'A'.repeat(35)}`
  const { env } = project({
    'reporting.config.json': JSON.stringify({ telegram: { botToken: token, chatId: '42' } }),
  })
  const list = await gf(['config', 'list', '--json'], env)
  assert.equal(list.code, EXIT.OK)
  assert.ok(!list.out.includes(token))
  assert.equal(JSON.parse(list.out).sections.reporting.telegram.chatId, '42', 'non-secrets still print')
  const get = await gf(['config', 'get', 'reporting.telegram.botToken', '--json'], env)
  assert.equal(get.code, EXIT.OK)
  assert.match(JSON.parse(get.out).value, /^<redacted/)
  assert.ok(!get.out.includes(token))
})
