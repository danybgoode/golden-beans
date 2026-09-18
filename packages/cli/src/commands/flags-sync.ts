// golden-frijoles-cli · Sprint 2, Story 2.5 — `gf flags sync`, the catalog bridge.
//
// ── It uses a DIFFERENT credential, and that is the whole design of this verb ─────────────────
// Every other write verb rides the CLI's PAT. This one rides a `flag_sync` key, because the thing
// it is bridging is a CI job publishing a catalog out of source control — a job that must not hold
// a credential that can also roll out or kill a flag. `lib/credential-inventory.ts` models exactly
// that difference: "create flag definitions from an outside catalog; CANNOT turn a flag on or off
// in any environment."
//
// So the key comes from `--sync-key` or `GOLDEN_FRIJOLES_FLAG_SYNC_KEY`, and the PAT is not a
// fallback. Falling back would quietly hand a pipeline the wider credential the moment someone
// forgot to set the narrower one — which is the failure mode the split exists to prevent.
//
// ── It wraps the SHIPPED client, it does not reimplement the protocol ─────────────────────────
// `createFlagDefinitionSyncClient` from `@golden-frijoles/sdk` owns the request shape, the entry
// cap and the body limit. A second implementation here would drift from the route the first time
// either changed.
//
// ── Sync NEVER activates, and this verb says so ───────────────────────────────────────────────
// The route does not activate, by design — a catalog import creates immutable definition versions
// and nothing else. A CLI that printed "synced" and left the reader assuming production had changed
// would be papering over that, so the output names it.

import { readFileSync } from 'node:fs'
import { createFlagDefinitionSyncClient } from '@golden-frijoles/sdk'
import { boolFlag, flagValue } from '../args'
import type { Command } from '../command'
import { EXIT, type ExitCode } from '../exit-codes'
import { table } from '../output'

export const flagsSyncCommand: Command = {
  path: ['flags', 'sync'],
  summary: 'publish a flag catalog from source control',
  usage: 'gf flags sync --file flags.json [--dry-run]',
  needsAuth: false,
  detail: `Uses a flag_sync key — NOT your CLI token — from --sync-key or
  GOLDEN_FRIJOLES_FLAG_SYNC_KEY. There is deliberately no fallback to the CLI token: a
  pipeline that forgot to set the narrow credential must fail, not quietly get the wide one.

  Mint one with: gf keys create --type flag_sync --source <name> --label <text>

  ⚠️ Sync NEVER activates, deactivates or deletes a flag. It creates immutable definition
  versions. A key that already exists with an identical definition reports created: false;
  semantic drift from an existing version is a conflict for an owner to resolve through the
  normal version lifecycle.`,
  flags: [
    { name: 'file', value: '<path>', describe: 'a JSON array of { key, definition } entries' },
    { name: 'sync-key', value: '<key>', describe: 'the flag_sync credential (or set the env var)' },
    { name: 'dry-run', describe: 'parse and report, send nothing' },
  ],
  async run(context): Promise<ExitCode> {
    const path = flagValue(context.args, 'file')
    if (!path) {
      context.emit.fail('invalid', 'Usage: `gf flags sync --file flags.json`.')
      return EXIT.USAGE
    }

    let catalog: unknown
    try {
      catalog = JSON.parse(readFileSync(path, 'utf8'))
    } catch (err) {
      context.emit.fail(
        'invalid',
        `Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`
      )
      return EXIT.USAGE
    }
    if (!Array.isArray(catalog)) {
      context.emit.fail('invalid', `${path} must contain a JSON ARRAY of { key, definition } entries.`)
      return EXIT.USAGE
    }

    if (boolFlag(context.args, 'dry-run')) {
      // Reports what WOULD be sent and sends nothing — including no credential, which is why the
      // key check is below this branch: a dry run is useful precisely when you have not wired the
      // credential up yet.
      context.emit.ok(
        {
          dryRun: true,
          file: path,
          entries: catalog.length,
          keys: catalog.map((entry) => (entry as { key?: string }).key ?? null),
        },
        `${catalog.length} entr${catalog.length === 1 ? 'y' : 'ies'} in ${path}. Nothing was sent.`
      )
      return EXIT.OK
    }

    const syncKey =
      flagValue(context.args, 'sync-key')?.trim() || context.env.GOLDEN_FRIJOLES_FLAG_SYNC_KEY?.trim()
    if (!syncKey) {
      context.emit.fail(
        'unauthorized',
        'A flag_sync credential is required — pass --sync-key or set GOLDEN_FRIJOLES_FLAG_SYNC_KEY. ' +
          'Your CLI token is deliberately NOT accepted here: catalog publishing gets the narrower key.'
      )
      return EXIT.AUTH
    }

    const client = createFlagDefinitionSyncClient({ baseUrl: context.auth.apiUrl, flagSyncKey: syncKey })
    const result = await client.syncFlagDefinitions(
      catalog as Parameters<typeof client.syncFlagDefinitions>[0]
    )

    if (!result.ok) {
      // `kind` is the SDK's own vocabulary for what went wrong, and it is deliberately NOT the same
      // vocabulary as this CLI's exit codes — mapping between them is this file's job.
      //
      // The mapping turns on the HTTP status for `kind: 'http'`, because that is where the two
      // outcomes an agent can act on differently live: a 409 is catalog DRIFT (an existing immutable
      // version disagrees with the file — resolvable by the caller, exit 4), and a 401 is the sync
      // credential (exit 2). Everything else is exit 6. `validation` is the caller's file and never
      // reached the network at all, so it is a usage error.
      const code =
        result.kind === 'validation'
          ? EXIT.USAGE
          : result.kind === 'http' && result.status === 409
            ? EXIT.CONFLICT
            : result.kind === 'http' && result.status === 401
              ? EXIT.AUTH
              : EXIT.SERVER
      context.emit.fail(
        result.kind,
        result.error,
        // The parser's own messages, verbatim, when it has any. An agent branches on these; folding
        // them into the sentence would turn a list into prose.
        'issues' in result && result.issues !== undefined ? { issues: result.issues } : undefined
      )
      return code
    }

    const created = result.entries.filter((entry) => entry.created)
    context.emit.ok(
      { file: path, entries: result.entries },
      [
        `${created.length} new definition version${created.length === 1 ? '' : 's'} from ${result.entries.length} entr${result.entries.length === 1 ? 'y' : 'ies'}.`,
        '',
        table(
          ['FLAG', 'VERSION', 'RESULT'],
          result.entries.map((entry) => [
            entry.key,
            `v${entry.definitionVersion}`,
            // `created: false` is an identical no-op, NOT a failure — the route is idempotent by
            // design and re-running a pipeline must not read as "nothing worked".
            entry.created ? 'created' : 'unchanged',
          ])
        ),
        '',
        // Said every time, not only when something changed. The absence of this line is how someone
        // concludes a sync turned a flag on.
        'Sync creates definitions only. Nothing was activated — use `gf flags set` or `gf flags create --all-envs` for that.',
      ].join('\n')
    )
    return EXIT.OK
  },
}
