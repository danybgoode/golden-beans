// golden-frijoles-cli · Sprint 1, Story 1.2 — where the token lives on disk.
//
// ── `0600`, and the directory `0700` ──────────────────────────────────────────────────────────
// This file holds a credential that signs its holder in to every project they belong to. The
// shaping named the failure: "key material on disk — 0600, never in the repo, never echoed by
// doctor". The mode is applied at WRITE time on every write, not only at creation, so a file whose
// permissions were loosened by hand is tightened the next time `gf login` runs.
//
// ── Precedence: env var, then flag, then file ─────────────────────────────────────────────────
// `GOLDEN_FRIJOLES_TOKEN` wins, because CI has no credentials file and must not be made to write
// one — a CI job that writes a token to `$HOME` leaves it in whatever the runner caches. The file
// is the interactive path.
//
// ⚠️ `--token` on the command line is accepted and deliberately NOT documented as the way to log
// in: `argv` is visible to every process on the machine and lands in shell history. `gf login` with
// no flag reads stdin instead, which does neither.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const DEFAULT_API_URL = 'https://goldenfrijoles.com'

/**
 * What a CLI token looks like.
 *
 * ⚠️ **A SECOND copy of a regex that also lives in `apps/web/lib/cli-tokens.ts`, and the duplication
 * is deliberate.** This package is published to npm and cannot import from the app; the alternative
 * — no local check at all — costs a network round-trip to tell someone their paste was truncated,
 * which is `gf doctor`'s single most useful answer.
 *
 * It is safe to duplicate because of what it is used FOR on each side. Here it is a HINT: a
 * malformed token is reported early, and a token this rejects would have been rejected by the
 * server anyway. There it is the lookup's own shape guard. The failure mode of drift is that this
 * copy becomes stricter than the server (a valid token refused locally, which `gf --token` bypasses
 * and `doctor` names) — never that an invalid one is accepted, because this side grants nothing.
 */
export const CLI_TOKEN_FORMAT = /^gf_pat_[A-Za-z0-9_-]{20,64}$/

export type Credentials = {
  token: string
  /** The deployment this token belongs to. A token is not portable between deployments. */
  apiUrl: string
  /** `gf projects use` writes this. Absent until someone chooses. */
  activeProject?: string
}

/**
 * `$XDG_CONFIG_HOME/golden-frijoles/credentials.json`, falling back to `~/.config/…`.
 *
 * XDG first because a machine that sets it means it — putting the file in `~/.config` anyway is how
 * a credential ends up outside whatever the operator has arranged to protect or to exclude from
 * backups.
 */
export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME?.trim() || join(env.HOME || homedir(), '.config')
  return join(base, 'golden-frijoles', 'credentials.json')
}

export function readCredentials(env: NodeJS.ProcessEnv = process.env): Credentials | null {
  const path = credentialsPath(env)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Credentials>
    if (typeof parsed.token !== 'string' || parsed.token === '') return null
    return {
      token: parsed.token,
      apiUrl: typeof parsed.apiUrl === 'string' && parsed.apiUrl !== '' ? parsed.apiUrl : DEFAULT_API_URL,
      activeProject: typeof parsed.activeProject === 'string' ? parsed.activeProject : undefined,
    }
  } catch {
    // A corrupt file reads as "not logged in" rather than throwing. `gf doctor` is the verb that
    // explains WHY — it re-reads the file itself and reports it as unreadable — so the ordinary
    // commands can treat every "no usable credential" the same way and print one remedy.
    return null
  }
}

export function writeCredentials(next: Credentials, env: NodeJS.ProcessEnv = process.env): string {
  const path = credentialsPath(env)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  // ⚠️ chmod AFTER the write, every time. `writeFileSync`'s `mode` is only applied when the file is
  // CREATED — an existing file keeps whatever mode it had, so a re-login into a world-readable file
  // left it world-readable. This is the line that makes the 0600 claim true on the second run.
  chmodSync(path, 0o600)
  return path
}

export type ResolvedAuth = {
  token: string | null
  apiUrl: string
  activeProject: string | null
  /** Where the token came from — `gf doctor` and `gf whoami` say so, and never print the token. */
  source: 'env' | 'flag' | 'file' | 'none'
}

/**
 * The single resolution every command uses.
 *
 * Returns `token: null` rather than throwing, because "not logged in" is a normal state with its own
 * exit code and its own sentence — and because `gf doctor` has to be able to describe it rather than
 * die of it.
 */
export function resolveAuth(options: {
  tokenFlag?: string
  apiFlag?: string
  env?: NodeJS.ProcessEnv
}): ResolvedAuth {
  const env = options.env ?? process.env
  const file = readCredentials(env)
  const envToken = env.GOLDEN_FRIJOLES_TOKEN?.trim()
  const apiUrl = normalizeApiUrl(
    options.apiFlag?.trim() || env.GOLDEN_FRIJOLES_URL?.trim() || file?.apiUrl || DEFAULT_API_URL
  )
  const activeProject = env.GOLDEN_FRIJOLES_PROJECT?.trim() || file?.activeProject || null

  if (envToken) return { token: envToken, apiUrl, activeProject, source: 'env' }
  if (options.tokenFlag?.trim())
    return { token: options.tokenFlag.trim(), apiUrl, activeProject, source: 'flag' }
  if (file) return { token: file.token, apiUrl, activeProject, source: 'file' }
  return { token: null, apiUrl, activeProject, source: 'none' }
}

/**
 * Trim a trailing slash and add a scheme if one is missing.
 *
 * A bare `localhost:3000` becomes `http://localhost:3000` and anything else becomes `https://…`.
 * Guessing `http` for a public hostname would downgrade a credential-bearing request to plaintext,
 * so the guess only goes that way for a loopback address.
 */
export function normalizeApiUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const loopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(trimmed)
  return `${loopback ? 'http' : 'https'}://${trimmed}`
}
