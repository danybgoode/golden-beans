// golden-frijoles-cli · Sprint 1, Story 1.4 — `gf init`. The whole onboarding in one verb.
//
// ── What it does, in order, and why that order ────────────────────────────────────────────────
//   1. make sure the account has a project (idempotent — D9)
//   2. make sure `.env.local` is ignored by git, or REFUSE
//   3. mint a `flag_read` key for the chosen environment, unless the file already has a live one
//   4. write `.env.local` at 0600
//   5. print the snippet that reads exactly the names it just wrote
//
// Step 2 comes before step 3 on purpose. Minting first and then discovering the file would be
// committed leaves a live credential on disk in a tracked file, and "we minted it but could not
// protect it" is not a state a tool should be able to reach. The shaping named this as a rabbit
// hole: *"`init` must add the env file to `.gitignore` or refuse."*
//
// ── D6: the names are `GOLDEN_FRIJOLES_*`, and the snippet is generated WITH the file ─────────
// The SDK reads no environment variable at all — `createFlagProvider` takes `flagReadKey` as an
// argument, and the `GOLDEN_BEANS_*` names appear only in README examples. They are caller-owned
// addresses, so there is no compatibility to preserve and nothing in shipped code resolves either
// name. What matters is that the file and its reader agree, so both come out of `ENV_KEYS` below.

import { execFileSync } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isFlagEnvironment } from '@golden-frijoles/sdk'
import { flagValue } from '../args'
import type { Command, CommandContext } from '../command'
import { EXIT, exitForServerCode, type ExitCode } from '../exit-codes'

/** The env-var names `gf init` writes AND the snippet reads. One definition (D6). */
export const ENV_KEYS = {
  url: 'GOLDEN_FRIJOLES_URL',
  flagRead: 'GOLDEN_FRIJOLES_FLAG_READ_KEY',
  environment: 'GOLDEN_FRIJOLES_ENVIRONMENT',
} as const

const ENV_FILE = '.env.local'
const GITIGNORE = '.gitignore'

/** Does `.gitignore` already cover `.env.local`? */
export function gitignoreCovers(contents: string): boolean {
  return contents
    .split('\n')
    .map((line) => line.trim())
    .some((line) => ['.env.local', '.env*.local', '.env*', '*.local'].includes(line))
}

/**
 * The value of `name` in a dotenv file, or null. Quotes stripped; no interpolation, deliberately.
 *
 * ⚠️ **The LAST assignment wins, and this returned the FIRST** (cross-family review, Codex,
 * round 3). `dotenv` assigns in file order, so a later line overrides an earlier one — which meant
 * `gf init` could probe and rewrite one key while the generated app actually resolved a different
 * one. Two duplicate lines is not exotic: it is what a hand-edit plus a re-run produces.
 */
export function readEnvValue(contents: string, name: string): string | null {
  let found: string | null = null
  for (const line of contents.split('\n')) {
    const match = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`).exec(line)
    if (!match) continue
    const raw = match[1].trim().replace(/^(['"])(.*)\1$/, '$2')
    found = raw === '' ? null : raw
  }
  return found
}

/**
 * Set `name` to `value`, leaving EXACTLY ONE assignment of it in the file.
 *
 * ⚠️ **Rewritten to remove the first/last ambiguity rather than to pick a side** (cross-family
 * review, Codex, round 3). The previous version replaced the FIRST match and left any later
 * duplicate in place — and since `dotenv` resolves the LAST one, the file could end up saying
 * something this function believed it had just changed.
 *
 * Every existing assignment is dropped and one is written where the first of them was (or appended
 * if there were none). The failure is then unrepresentable rather than handled: there is no second
 * occurrence for the two functions to disagree about (CODE-QUALITY #2).
 */
export function upsertEnvValue(contents: string, name: string, value: string): string {
  const line = `${name}=${value}`
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=.*$`)
  const lines = contents === '' ? [] : contents.split('\n')
  const firstIndex = lines.findIndex((candidate) => pattern.test(candidate))
  const kept = lines.filter((candidate) => !pattern.test(candidate))
  if (firstIndex === -1) {
    const prefix = contents === '' || contents.endsWith('\n') ? contents : `${contents}\n`
    return `${prefix}${line}\n`
  }
  kept.splice(firstIndex, 0, line)
  const rebuilt = kept.join('\n')
  return rebuilt.endsWith('\n') ? rebuilt : `${rebuilt}\n`
}

export function snippetFor(environment: string): string {
  // ⚠️ **`environment` is READ from the variable, not inlined as a literal** — and the first version
  // of this function inlined it, which the "every name it writes is read" test caught immediately.
  // An inlined literal means `gf init` writes GOLDEN_FRIJOLES_ENVIRONMENT into the file and then
  // hands over code that ignores it: change the file, and the app keeps resolving the old
  // environment with nothing to say so. That is precisely the file-and-its-reader drift D6 exists
  // to prevent, so the snippet reads every variable the file carries.
  //
  // The parameter survives as the DEFAULT in the fallback, so the snippet still runs unchanged in a
  // process where the variable is missing — and says which environment it would assume.
  return `import { createFlagProvider } from '@golden-frijoles/sdk'

const flags = createFlagProvider({
  baseUrl: process.env.${ENV_KEYS.url}!,
  flagReadKey: process.env.${ENV_KEYS.flagRead}!,
  environment: (process.env.${ENV_KEYS.environment} ?? '${environment}') as 'development' | 'preview' | 'production',
})

await flags.initialize()
const enabled = flags.resolveBooleanEvaluation('checkout.demo_enabled', false, {
  targetingKey: 'opaque-subject-id',
}).value`
}

export const initCommand: Command = {
  path: ['init'],
  summary: 'project, key, .env.local and the snippet — in one verb',
  usage: 'gf init [--env <environment>] [--json] [--yes]',
  needsAuth: true,
  detail: `Idempotent. Re-running it does not mint a second key when ${ENV_FILE} already
  carries one; it says so and leaves the file alone.

  ⚠️ It REFUSES if it cannot get ${ENV_FILE} into ${GITIGNORE}. A live credential in a
  tracked file is the failure this verb exists to prevent, so it will not create one and
  then warn about it.`,
  flags: [
    { name: 'env', value: '<environment>', describe: 'development | preview | production (default: development)' },
    { name: 'project', value: '<slug>', describe: 'the project (default: the remembered one)' },
    // ⚠️ Accepted and INERT, described as such. This verb never prompts — there is nothing for a
    // --yes to skip — and a flag whose help implies it suppresses a question that does not exist is
    // a small lie in the one document an agent reads to learn the tool. It stays accepted so a
    // script that passes it defensively does not hit "unknown flag".
    { name: 'yes', describe: 'accepted and ignored — this verb never prompts' },
  ],
  async run(context): Promise<ExitCode> {
    const environment = (flagValue(context.args, 'env') ?? 'development').trim()
    if (!isFlagEnvironment(environment)) {
      context.emit.fail('invalid', '--env must be development, preview or production.')
      return EXIT.USAGE
    }

    // ── 1. a project ──────────────────────────────────────────────────────────────────────────
    const chosen = flagValue(context.args, 'project')?.trim() || context.auth.activeProject || null
    let project = chosen
    if (!project) {
      const ensured = await context.api!.post<{ created: boolean; slug: string }>('api/v1/cli/projects', {})
      if (ensured.kind === 'network') {
        context.emit.fail('server_error', ensured.message)
        return EXIT.SERVER
      }
      if (ensured.kind === 'error') {
        context.emit.fail(ensured.code, ensured.message)
        return exitForServerCode(ensured.code)
      }
      project = ensured.body.slug
    }

    // ── 2. the file must be ignorable BEFORE anything is minted ───────────────────────────────
    const gitignorePath = join(context.cwd, GITIGNORE)
    const envPath = join(context.cwd, ENV_FILE)
    const symlinkResult = refuseSymlink(envPath, context)
    if (symlinkResult !== null) return symlinkResult
    const ignoreResult = ensureIgnored(gitignorePath, context)
    if (ignoreResult !== null) return ignoreResult
    // ⚠️ **Writability is checked BEFORE anything is minted** (cross-family review, Codex, round 3).
    // Minting first and discovering a read-only `.env.local` afterwards leaves a LIVE credential
    // nobody holds — unrevokable by the caller, because they never saw it — and a retry mints
    // another. Same ordering rule as the `.gitignore` check above, for the same reason: this verb
    // will not create a credential it cannot then protect or hand over.
    const writableResult = ensureWritable(envPath, context)
    if (writableResult !== null) return writableResult

    // ── 3. mint, unless the file already carries a key that STILL WORKS ───────────────────────
    const existingEnv = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
    const existingKey = readEnvValue(existingEnv, ENV_KEYS.flagRead)
    let minted: { id: string; key: string; expiresAt: string | null } | null = null

    // ⚠️ **"There is a key" is not "the key works", and treating them as the same shipped a real
    // defect** (cross-family review, Codex, PR #149). `flag_read` keys are minted with an expiry and
    // can be revoked from the console, so a rerun of `gf init` after either event reported
    // `reusedExistingKey: true` and left the project unable to read a flag — the CLI cheerfully
    // confirming a setup that no longer works, which is worse than not checking at all.
    //
    // So the key is EXERCISED, against the route that actually serves it.
    const existingKeyState =
      existingKey === null ? 'absent' : await probeFlagReadKey(context, existingKey, environment)
    if (existingKeyState === 'dead') {
      context.emit.note(`The ${ENV_KEYS.flagRead} in ${ENV_FILE} is revoked or expired — minting a replacement.`)
    }
    if (existingKeyState === 'wrong-environment') {
      context.emit.note(
        `The ${ENV_KEYS.flagRead} in ${ENV_FILE} reads a DIFFERENT environment — minting a ${environment} key.`
      )
    }

    if (existingKey === null || existingKeyState === 'dead' || existingKeyState === 'wrong-environment') {
      const result = await context.api!.post<{ id: string; key: string; expiresAt: string | null }>(
        'api/v1/cli/keys',
        { project, type: 'flag_read', label: `gf init (${environment})`, environment }
      )
      if (result.kind === 'network') {
        context.emit.fail('server_error', result.message)
        return EXIT.SERVER
      }
      if (result.kind === 'error') {
        context.emit.fail(result.code, result.message)
        return exitForServerCode(result.code)
      }
      minted = result.body
    }

    // ── 4. write it ───────────────────────────────────────────────────────────────────────────
    let next = existingEnv
    next = upsertEnvValue(next, ENV_KEYS.url, context.api!.baseUrl)
    next = upsertEnvValue(next, ENV_KEYS.environment, environment)
    if (minted) next = upsertEnvValue(next, ENV_KEYS.flagRead, minted.key)
    // 0600 on every write, not only at creation: `writeFileSync`'s mode is ignored for an existing
    // file, which is how a credential file stays world-readable after the second run.
    writeFileSync(envPath, next, { mode: 0o600 })
    try {
      // chmod separately for the same reason. Best-effort: a filesystem without POSIX modes (a
      // Windows checkout) must not fail an otherwise-correct init.
      chmodSync(envPath, 0o600)
    } catch {
      /* not every filesystem has modes; the write above is still correct */
    }

    // ── 5. say what happened, and hand over the snippet ───────────────────────────────────────
    context.emit.ok(
      {
        project,
        environment,
        envFile: envPath,
        // ⚠️ The KEY ID, never the key. Under --json this output is captured by CI and by agents,
        // and a credential in a captured stdout is a credential in a log. It is in the file the
        // command just wrote; that is where it belongs.
        mintedKeyId: minted?.id ?? null,
        reusedExistingKey: minted === null,
        // `live`, `unverified` or `absent` — never a bare boolean. "We could not check" and "we
        // checked and it works" lead to different actions, and an agent handed only `true` cannot
        // tell them apart.
        existingKeyState,
        variables: Object.values(ENV_KEYS),
        snippet: snippetFor(environment),
      },
      [
        minted
          ? `Minted a flag_read key for ${project} (${environment}) and wrote ${ENV_FILE}.`
          : existingKeyState === 'live'
            ? `${ENV_FILE} already has a working ${ENV_KEYS.flagRead}; left it alone and refreshed the other variables.`
            : `${ENV_FILE} already has a ${ENV_KEYS.flagRead}. It could not be verified against ${context.api!.baseUrl}, so it was left alone rather than replaced — check it if flags do not resolve.`,
        `${ENV_FILE} is ignored by git and set to mode 0600.`,
        '',
        'Read them like this:',
        '',
        snippetFor(environment),
      ].join('\n')
    )
    return EXIT.OK
  },
}

/**
 * Prove `.env.local` can be written, before a credential exists to put in it.
 *
 * The check is a real write — appending nothing to the file, creating it if absent — because that is
 * the only thing that answers the question. A mode check would be a guess about the filesystem, the
 * process's user, ACLs and mount options, and the guess is wrong exactly where it matters.
 *
 * Creating an empty file as a side effect is harmless: `gf init` is about to write this path
 * anyway, and an empty `.env.local` in a directory where init failed is not a hazard. A minted
 * credential nobody holds is.
 */
function ensureWritable(envPath: string, context: CommandContext): ExitCode | null {
  try {
    appendFileSync(envPath, '', { mode: 0o600 })
    return null
  } catch (err) {
    context.emit.fail(
      'invalid',
      `Cannot write ${ENV_FILE} (${err instanceof Error ? err.message : String(err)}). ` +
        `Nothing was minted — a credential created now would be live and unheld. Fix the permissions ` +
        `and re-run.`
    )
    return EXIT.USAGE
  }
}

/**
 * Refuse a `.env.local` that is a SYMLINK.
 *
 * ⚠️ **Because the ignore check and the write look at different things** (cross-family review,
 * Codex, round 2). `git check-ignore .env.local` answers about the PATH, and `writeFileSync`
 * FOLLOWS the link — so an ignored `.env.local` pointing at a tracked file elsewhere in the
 * repository passes every check this verb makes and then writes a live credential into a file git
 * is watching. That is the exact outcome `ensureIgnored` exists to prevent, reached around it.
 *
 * `lstatSync`, not `statSync`: `stat` follows the link and would describe the target, which is the
 * very thing being checked for.
 *
 * Refused rather than resolved-and-re-checked. Following the link to check the target would work,
 * and then `gf init` would be a verb that writes credentials to a path the caller did not name —
 * a worse property than the one it fixed.
 */
function refuseSymlink(envPath: string, context: CommandContext): ExitCode | null {
  let link = false
  try {
    link = lstatSync(envPath).isSymbolicLink()
  } catch {
    return null // it does not exist yet, which is the ordinary case
  }
  if (!link) return null
  context.emit.fail(
    'invalid',
    `${ENV_FILE} is a symlink. Writing through it would put a live credential wherever it points — ` +
      `possibly into a tracked file — so nothing was minted and nothing was written. Replace it with ` +
      `a real file and re-run.`
  )
  return EXIT.USAGE
}

/**
 * Ask GIT whether it really ignores the file, rather than trusting the line we just wrote.
 *
 * ⚠️ **A line in `.gitignore` does not mean a file is ignored** (fresh reviewer, PR #149). A
 * `.env.local` that is ALREADY TRACKED ignores `.gitignore` entirely, and a later `!.env.local`
 * negation overrides an earlier match. `gf init` printed "ignored by git" on the strength of having
 * appended a line — a checkable claim, asserted rather than checked, on the one property that stops
 * a live credential reaching a public repository.
 *
 * `git check-ignore` is git's own answer, so there is nothing to reimplement and nothing to get
 * subtly wrong about precedence.
 *
 * Outside a git repository — or with no `git` on PATH — this returns `null` (proceed). There is no
 * index to be tracked in, so there is nothing this check protects against, and refusing to init a
 * plain directory because `git` is missing would be a worse answer than the one it prevents.
 */
function gitReallyIgnores(gitignorePath: string, context: CommandContext): ExitCode | null {
  const cwd = dirname(gitignorePath)
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'ignore' })
  } catch {
    return null // not a repository, or no git — nothing to be tracked in
  }
  try {
    execFileSync('git', ['check-ignore', '-q', '--', ENV_FILE], { cwd, stdio: 'ignore' })
    return null // git agrees it is ignored
  } catch {
    context.emit.fail(
      'invalid',
      `git does NOT ignore ${ENV_FILE} here, even though ${GITIGNORE} names it — it is most likely ` +
        `already tracked, or a later rule un-ignores it. Nothing was minted and nothing was written. ` +
        `Run \`git rm --cached ${ENV_FILE}\` (or fix the rule), then re-run.`
    )
    return EXIT.USAGE
  }
}

/**
 * Does this `flag_read` key still resolve a snapshot?
 *
 * Exercised against `/api/v1/flags/snapshot` — the route that actually serves it — because that is
 * the only thing that can answer the question. The key is sent as its own Bearer credential; the
 * CLI's PAT is not involved and must not be, since a PAT authorizes different things entirely.
 *
 * Three answers, and the third is the one that matters:
 *   `live`              — the snapshot resolved AND names the environment being set up.
 *   `dead`              — 401. Unknown, revoked or expired; the caller mints a replacement.
 *   `wrong-environment` — it resolves, but for a DIFFERENT environment. A `flag_read` key is scoped
 *                         to one, so keeping it would pair a production config with a development
 *                         credential and say nothing.
 *   `unverified`  — anything else: a 404 because flag serving is switched off on this deployment,
 *                   a network failure, a proxy. **Reported, never guessed at.** Treating an
 *                   unanswerable question as `dead` would mint a fresh credential on every run of a
 *                   deployment with serving off, which breaks the idempotency this verb promises;
 *                   treating it as `live` silently would repeat the defect this check exists to fix.
 */
async function probeFlagReadKey(
  context: CommandContext,
  key: string,
  wanted: string
): Promise<'live' | 'dead' | 'wrong-environment' | 'unverified'> {
  // ⚠️ **Through `clientFor`, NOT a bare `fetch`.** The first version called the global `fetch`
  // directly — it was the obvious way to send a different credential — and that quietly opened a
  // second HTTP path in a package whose whole point is that there is one: it skipped the timeout,
  // the status-to-`code` mapping and the injected `fetchImpl`, so two tests reached the real
  // network and the run took half a second per case.
  //
  // `clientFor(key)` is exactly the right seam: same base URL, same timeouts, same error mapping,
  // a DIFFERENT credential. The CLI's PAT is not involved and must not be — a PAT authorizes
  // something else entirely, and sending it here would tell us nothing about the key in the file.
  const result = await context.clientFor(key).get<{ environment?: string }>('api/v1/flags/snapshot')
  if (result.kind === 'ok') {
    // ⚠️ **A live key is not necessarily the RIGHT key** (cross-family review, Codex, round 4). A
    // `flag_read` credential is scoped to ONE environment, and the snapshot names which — so a
    // rerun as `gf init --env production` over a file holding a working DEVELOPMENT key found it
    // live, kept it, and then wrote `GOLDEN_FRIJOLES_ENVIRONMENT=production` beside it. The result
    // is an app that believes it is reading production flags and is reading development's, with
    // nothing anywhere saying so. That is the worst shape a flag bug has.
    //
    // The answer is in the response already; it only had to be looked at.
    return result.body.environment === wanted ? 'live' : 'wrong-environment'
  }
  // A network failure, a 404 from a deployment with flag serving switched off, a proxy's HTML —
  // all "could not tell", which is a third answer and not a synonym for either of the others.
  if (result.kind === 'network') return 'unverified'
  return result.code === 'unauthorized' ? 'dead' : 'unverified'
}

/**
 * Get `.env.local` into `.gitignore`, or refuse.
 *
 * Returns `null` when it is now covered, or an exit code when the caller must stop. Refusing is the
 * whole point: a credential in a tracked file is worse than no credential, and a warning printed
 * beside one is a warning nobody reads until the repository is public.
 */
function ensureIgnored(gitignorePath: string, context: CommandContext): ExitCode | null {
  let contents: string | null = null
  try {
    contents = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : null
  } catch (err) {
    // ⚠️ **The READ is inside the try too, and it was not.** `existsSync` is true for a directory
    // named `.gitignore`, and for a file the process cannot read — `readFileSync` then throws out of
    // the handler, `run()` catches it as an unexpected failure, and the caller gets EXIT.SERVER and
    // "gf init failed unexpectedly" for a condition this verb has a precise refusal for. Found by
    // the test that makes `.gitignore` a directory.
    context.emit.fail(
      'invalid',
      `Could not read ${GITIGNORE} (${err instanceof Error ? err.message : String(err)}). ` +
        `Nothing was minted and nothing was written. Make ${GITIGNORE} a readable file containing ` +
        `${ENV_FILE}, then re-run.`
    )
    return EXIT.USAGE
  }

  if (contents !== null && gitignoreCovers(contents)) return gitReallyIgnores(gitignorePath, context)

  try {
    if (contents === null) {
      writeFileSync(gitignorePath, `${ENV_FILE}\n`)
    } else {
      const prefix = contents.endsWith('\n') || contents === '' ? '' : '\n'
      appendFileSync(gitignorePath, `${prefix}${ENV_FILE}\n`)
    }
    context.emit.note(`Added ${ENV_FILE} to ${GITIGNORE}.`)
    return gitReallyIgnores(gitignorePath, context)
  } catch (err) {
    context.emit.fail(
      'invalid',
      `Could not add ${ENV_FILE} to ${GITIGNORE} (${err instanceof Error ? err.message : String(err)}). ` +
        `Nothing was minted and nothing was written — a credential in a tracked file is the one ` +
        `outcome this command will not produce. Add the line yourself and re-run.`
    )
    return EXIT.USAGE
  }
}
