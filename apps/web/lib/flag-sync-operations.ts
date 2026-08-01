import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import type { FlagDefinitionSyncEntry } from '@golden-beans/sdk'

type SyncRow = {
  flag_key?: unknown
  version?: unknown
  created?: unknown
}

type SyncEntry = { key: string; definitionVersion: number; created: boolean }

function sameKeys(entries: readonly FlagDefinitionSyncEntry[], rows: SyncEntry[]): boolean {
  if (entries.length !== rows.length) return false
  const expected = new Set(entries.map((entry) => entry.key))
  return expected.size === rows.length && rows.every((row) => expected.has(row.key))
}

function parseRows(rows: SyncRow[] | null, entries: readonly FlagDefinitionSyncEntry[]): SyncEntry[] | null {
  const parsed: SyncEntry[] = []
  for (const row of rows ?? []) {
    if (
      typeof row.flag_key !== 'string' ||
      typeof row.version !== 'number' ||
      !Number.isSafeInteger(row.version) ||
      row.version < 1 ||
      typeof row.created !== 'boolean'
    ) {
      return null
    }
    parsed.push({ key: row.flag_key, definitionVersion: row.version, created: row.created })
  }
  return sameKeys(entries, parsed) ? parsed : null
}

/**
 * Resolves tenant and actor inside sync_flag_definition_catalog. This caller deliberately passes
 * only a credential hash and validated definitions: accepting project/environment/actor here would
 * recreate the cross-project control-plane boundary the credential is intended to remove.
 */
export async function syncFlagDefinitionCatalog(input: {
  keyHash: string
  entries: readonly FlagDefinitionSyncEntry[]
}): Promise<
  | { ok: true; entries: SyncEntry[] }
  | { ok: false; status: 400 | 401 | 409 | 500 }
> {
  const { data, error } = await getSupabaseServiceClient().rpc('sync_flag_definition_catalog', {
    p_key_hash: input.keyHash,
    p_entries: input.entries,
  })
  if (error) {
    // SQLSTATE is sufficient operational context and cannot disclose the credential or catalog.
    if (error.code === 'P0001') return { ok: false, status: 409 }
    if (error.code === '22023') return { ok: false, status: 400 }
    console.error('[flag-sync] catalog mutation failed', { code: error.code ?? 'unknown' })
    return { ok: false, status: 500 }
  }
  const entries = parseRows((data ?? null) as SyncRow[] | null, input.entries)
  // An active sync credential always produces exactly one row per requested entry. An empty result
  // is therefore the intentionally indistinguishable unknown/revoked/wrong-scope credential case.
  if (entries === null) {
    if ((data ?? []).length === 0) return { ok: false, status: 401 }
    console.error('[flag-sync] catalog mutation returned malformed rows')
    return { ok: false, status: 500 }
  }
  return { ok: true, entries }
}
