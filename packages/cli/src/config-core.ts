// golden-frijoles-plugin · S5.2 (D10) — the ONE config core, loaded from `@golden-frijoles/kit`.
//
// ── Why this CLI does not have its own config code ────────────────────────────────────────────
// `gf config`, `gf setup` and `gf doctor`'s module lines read and write the same
// golden-frijoles.config.json the kit's `gf-kit config` does, and an agent's skill writes it too.
// Two implementations of "which file wins, what counts as a secret, where the project root is"
// would drift, and the drift would show up as a setting one front end saved and the other ignored.
// So every rule lives in the kit (`@golden-frijoles/kit/config`), and this file only loads it.
//
// ── Why `new Function('return import(u)')` and a file URL ─────────────────────────────────────
// The kit is ESM and this CLI builds to CommonJS. TypeScript compiles a literal `import()` in a
// CommonJS build into `require()`, which cannot load ESM on every Node this CLI supports
// (engines >=20). A dynamic import the compiler cannot see survives into the build as a real
// `import()`. It is handed an ABSOLUTE file URL (resolved through the kit's exported
// package.json), so where that import resolves from never matters.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export type RegistryEntry = {
  key: string
  module: 'Plan' | 'Build' | 'Ship' | 'Measure' | 'Spend' | 'Operate'
  askWhen: string
  default: unknown
  question: string
  required?: boolean
  choices?: readonly unknown[]
  store?: 'env'
}

type Io = { root?: string }

/** The subset of the kit's `lib/config.mjs` this CLI calls. The kit ships the full types (config.d.mts). */
export type ConfigCore = {
  CONFIG_FILENAME: string
  LEGACY: Readonly<Record<string, string>>
  REGISTRY: readonly RegistryEntry[]
  MODULES: readonly RegistryEntry['module'][]
  ConfigError: new (message: string) => Error
  projectRoot(opts?: { env?: NodeJS.ProcessEnv; cwd?: string }): string
  readSection(name: string, opts?: Io): { raw: unknown; present: boolean; sources: string[] }
  loadConfig(opts?: Io): {
    sections: Record<string, unknown>
    sources: Record<string, string[]>
    duplicates: string[]
    unknown: string[]
  }
  getKey(key: string, opts?: Io): unknown
  setKey(key: string, value: unknown, opts?: Io): Record<string, unknown>
}

const importEsm = new Function('url', 'return import(url)') as (url: string) => Promise<unknown>

let cached: Promise<ConfigCore> | null = null

/** The kit's package.json, resolved the way Node resolves this CLI's own dependency. */
function kitPackageJson(): string {
  // `require` exists in the CommonJS build; the unit tests run this source as ESM, where it does not.
  const req = typeof require === 'function' ? require : createRequire(join(process.cwd(), 'noop.js'))
  return req.resolve('@golden-frijoles/kit/package.json')
}

/** The installed kit's version, so a printed `npx @golden-frijoles/kit@<v>` runs the same code this CLI uses. */
export function kitVersion(): string | null {
  try {
    return (JSON.parse(readFileSync(kitPackageJson(), 'utf8')) as { version?: string }).version ?? null
  } catch {
    return null
  }
}

/** Load the kit's config core once per process. Rejects when the kit is not installed or not loadable. */
export function loadConfigCore(): Promise<ConfigCore> {
  if (!cached) {
    cached = (async () => {
      const pkg = kitPackageJson()
      return (await importEsm(
        pathToFileURL(join(dirname(pkg), 'dist', 'lib', 'config.mjs')).href
      )) as ConfigCore
    })()
    // A failed load is not cached: the next call tries again rather than repeating a stale error.
    cached.catch(() => {
      cached = null
    })
  }
  return cached
}

/** Pure — a command-line value: JSON when it parses (true, 3, ["a"], null), otherwise the literal string. Same rule as `gf-kit config set`. */
export function parseValue(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * The value a key has in the FILES — `undefined` when nothing sets it, never the registry default.
 *
 * `getKey` answers "what will a rail use", which falls back to the default; doctor and setup need
 * "did anyone answer this", which must not. Same section resolution as the kit's `getKey`
 * (a dotted sub-section with its own legacy file, like `smoke.triage`, is read as that sub-section).
 */
export function answeredValue(core: ConfigCore, key: string, root: string): unknown {
  const [head, ...rest] = key.split('.')
  const section = rest.length > 0 && core.LEGACY[`${head}.${rest[0]}`] ? `${head}.${rest.shift()}` : head
  const { raw } = core.readSection(section, { root })
  let value: unknown = raw ?? undefined
  for (const part of rest) {
    if (value === null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value === null ? undefined : value
}
