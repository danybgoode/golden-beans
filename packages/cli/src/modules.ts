// golden-frijoles-plugin · S5.3 (D13) — one line per product module, for `gf doctor`.
//
// ── Three states, never two ───────────────────────────────────────────────────────────────────
// *configured*, *not configured* (with the command that fixes it) and *could not look*. The last is
// its own state because "the config file is malformed" or "the kit is not installed" is a different
// fact, with a different remedy, from "you have not answered this yet" (LEARNINGS: could not look is
// never the failure outcome, and never silently the success one).
//
// ── Read from the registry, not a list kept here ──────────────────────────────────────────────
// The questions a module needs answered are the kit registry's rows for that module, minus the
// `never-yet` ones (declared, but nothing asks them this release). A new setting in the kit shows up
// here with no change to this file.
//
// ── Never changes doctor's exit code (D13) ────────────────────────────────────────────────────
// Doctor's exit code answers "can this CLI reach your project". An unanswered setting is normal on a
// fresh repo; a CI step running `gf doctor` must not start failing because nobody chose reviewers.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ENV_KEYS, readEnvValue } from './commands/init'
import { answeredValue, type ConfigCore, type RegistryEntry } from './config-core'

export type ModuleState = 'configured' | 'not-configured' | 'could-not-look'
export type ModuleLine = {
  module: RegistryEntry['module']
  state: ModuleState
  /** One sentence. For not-configured it names what is missing; for could-not-look, why. */
  detail: string
  /** The command that fixes a not-configured module. `null` in the other two states. */
  fix: string | null
}

export const MODULE_ORDER: readonly RegistryEntry['module'][] = ['Plan', 'Build', 'Ship', 'Measure', 'Spend', 'Operate']

/** `.env.local` carries a Golden Frijoles project (what `gf init` writes). Where a `store: 'env'` answer lives. */
function accountConnected(root: string, hasCredential: boolean): boolean {
  if (hasCredential) return true
  const path = join(root, '.env.local')
  if (!existsSync(path)) return false
  return readEnvValue(readFileSync(path, 'utf8'), ENV_KEYS.flagRead) !== null
}

function fixFor(entry: RegistryEntry): string {
  if (entry.store === 'env') return '`gf login`, then `gf init`'
  if (entry.askWhen === 'setup') return '`gf setup`'
  return `\`gf config set ${entry.key} <value>\``
}

/**
 * Pure given the core — one line per module. `core === null` (or a core that throws while reading)
 * makes every line could-not-look, with the reason.
 */
export function moduleLines(
  core: ConfigCore | null,
  opts: { root: string | null; hasCredential: boolean; unavailable?: string }
): ModuleLine[] {
  const couldNotLook = (why: string): ModuleLine[] =>
    MODULE_ORDER.map((module) => ({ module, state: 'could-not-look' as const, detail: why, fix: null }))
  if (!core || !opts.root) return couldNotLook(opts.unavailable ?? 'the config core is not available.')
  const root = opts.root
  try {
    return MODULE_ORDER.map((module): ModuleLine => {
      const asked = core.REGISTRY.filter((row) => row.module === module && row.askWhen !== 'never-yet')
      // Nothing to answer is not "not configured": that state promises a fix, and there is none to give.
      if (asked.length === 0)
        return { module, state: 'configured', detail: 'nothing to set in this release.', fix: null }
      // Missing = needs an answer to work: an account not connected, or a setting that is required or
      // has no safe default (`null`: "unanswered", which a rail treats as its safest choice — jev.egress
      // never sends). A setting with a real default is not missing; the rail already uses the default.
      const missing = asked.filter((entry) =>
        entry.store === 'env'
          ? !accountConnected(root, opts.hasCredential)
          : (entry.required || entry.default === null) && answeredValue(core, entry.key, root) === undefined
      )
      if (missing.length === 0) {
        const answered = asked.filter((entry) => entry.store !== 'env' && answeredValue(core, entry.key, root) !== undefined)
        return {
          module,
          state: 'configured',
          detail: `${answered.length} of ${asked.length} settings answered; the rest use their defaults.`,
          fix: null,
        }
      }
      return {
        module,
        state: 'not-configured',
        detail: `not answered: ${missing.map((entry) => entry.key).join(', ')}.`,
        fix: [...new Set(missing.map(fixFor))].join(' · '),
      }
    })
  } catch (err) {
    return couldNotLook(
      `could not read the project's settings: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}
