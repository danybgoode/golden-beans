// Flag-definition catalog sync — a bounded, versioned write contract for application catalogs.
//
// This module deliberately does not share GrowthEngineClient's ingest credential. Registering a
// definition is a control-plane write, while telemetry ingest is a data-plane write; using one
// credential for both would make an accidental SDK call materially more powerful than it looks.
// The Golden route repeats every validation and derives the tenant from the dedicated credential.
import { parseFlagDefinition, validateFlagKey, type FlagDefinition } from './flags'

export const FLAG_DEFINITION_SYNC_CONTRACT_VERSION = 1 as const
export const MAX_FLAG_DEFINITION_SYNC_ENTRIES = 100
// Keep an explicit envelope cap in addition to the per-definition cap in flags.ts. A route can
// reject this before JSON parsing, so a malicious payload cannot turn catalog validation into an
// unbounded allocation. The 4 MiB limit still comfortably fits 100 max-sized definitions.
export const MAX_FLAG_DEFINITION_SYNC_BODY_BYTES = 4 * 1024 * 1024

export type FlagDefinitionSyncEntry = {
  key: string
  definition: FlagDefinition
}

export type FlagDefinitionSyncRequest = {
  contractVersion: typeof FLAG_DEFINITION_SYNC_CONTRACT_VERSION
  entries: FlagDefinitionSyncEntry[]
}

export type FlagDefinitionSyncRequestResult =
  { ok: true; request: FlagDefinitionSyncRequest } | { ok: false; errors: string[] }

export type FlagDefinitionSyncEntryResult = {
  key: string
  definitionVersion: number
  /** True only when this sync created immutable version 1; false is an identical no-op. */
  created: boolean
}

export type FlagDefinitionSyncSuccess = {
  ok: true
  contractVersion: typeof FLAG_DEFINITION_SYNC_CONTRACT_VERSION
  entries: FlagDefinitionSyncEntryResult[]
}

export type FlagDefinitionSyncFailure =
  | { ok: false; kind: 'validation'; error: string; issues: string[] }
  | { ok: false; kind: 'network'; error: string }
  | { ok: false; kind: 'http'; error: string; status: number; issues?: unknown }
  | { ok: false; kind: 'response'; error: string }

export type FlagDefinitionSyncResult = FlagDefinitionSyncSuccess | FlagDefinitionSyncFailure

export interface FlagDefinitionSyncClientConfig {
  /** Golden Beans base URL, for example https://growth.example.com. */
  baseUrl: string
  /** Dedicated revocable `flag_sync` credential. Keep it in server-only/operator configuration. */
  flagSyncKey: string
  /** Test seam; defaults to the runtime global fetch. */
  fetchImpl?: typeof fetch
}

export interface FlagDefinitionSyncClient {
  syncFlagDefinitions(entries: readonly FlagDefinitionSyncEntry[]): Promise<FlagDefinitionSyncResult>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], errors: string[]) {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) errors.push(`${key} is not allowed`)
  }
}

/** True when a raw JSON request body is small enough to parse as a catalog command. */
export function isFlagDefinitionSyncBodyWithinLimit(body: string): boolean {
  return new TextEncoder().encode(body).byteLength <= MAX_FLAG_DEFINITION_SYNC_BODY_BYTES
}

/**
 * Parses the exact request envelope accepted by `POST /api/v1/flags/sync`.
 *
 * This is intentionally exported so Golden's route uses the same key, definition and duplicate
 * semantics as SDK callers. The route must still enforce credential scope and body-size limits.
 */
export function parseFlagDefinitionSyncRequest(input: unknown): FlagDefinitionSyncRequestResult {
  if (!isRecord(input)) return { ok: false, errors: ['flag definition sync request must be an object'] }

  const errors: string[] = []
  rejectUnknownKeys(input, ['contractVersion', 'entries'], errors)
  if (input.contractVersion !== FLAG_DEFINITION_SYNC_CONTRACT_VERSION) {
    errors.push(`contractVersion must be ${FLAG_DEFINITION_SYNC_CONTRACT_VERSION}`)
  }
  if (
    !Array.isArray(input.entries) ||
    input.entries.length < 1 ||
    input.entries.length > MAX_FLAG_DEFINITION_SYNC_ENTRIES
  ) {
    errors.push(`entries must contain 1-${MAX_FLAG_DEFINITION_SYNC_ENTRIES} definitions`)
    return { ok: false, errors }
  }

  const keys = new Set<string>()
  const entries: FlagDefinitionSyncEntry[] = []
  input.entries.forEach((rawEntry, index) => {
    const path = `entries[${index}]`
    if (!isRecord(rawEntry)) {
      errors.push(`${path} must be an object`)
      return
    }
    const entryErrors: string[] = []
    rejectUnknownKeys(rawEntry, ['key', 'definition'], entryErrors)
    if (!validateFlagKey(rawEntry.key)) {
      entryErrors.push('key must be a valid flag key')
    } else {
      // Record a syntactically valid key even if its definition has another error. Otherwise an
      // invalid first duplicate would conceal the duplicate from the operator trying to repair it.
      if (keys.has(rawEntry.key)) entryErrors.push(`key duplicates ${rawEntry.key}`)
      keys.add(rawEntry.key)
    }

    const parsedDefinition = parseFlagDefinition(rawEntry.definition)
    let definition: FlagDefinition | undefined
    if (!parsedDefinition.ok) {
      entryErrors.push(...parsedDefinition.errors.map((error) => `definition: ${error}`))
    } else {
      definition = parsedDefinition.definition
    }
    if (entryErrors.length > 0) {
      errors.push(...entryErrors.map((error) => `${path}.${error}`))
      return
    }

    const key = rawEntry.key as string
    // A successful parse is the only path that reaches this line. Keeping the guard explicit
    // also prevents an impossible future parser result from becoming an undefined definition.
    if (!definition) {
      errors.push(`${path}.definition could not be parsed`)
      return
    }
    entries.push({ key, definition })
  })

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    request: { contractVersion: FLAG_DEFINITION_SYNC_CONTRACT_VERSION, entries },
  }
}

function parseSuccess(input: unknown): FlagDefinitionSyncSuccess | null {
  if (
    !isRecord(input) ||
    input.ok !== true ||
    input.contractVersion !== FLAG_DEFINITION_SYNC_CONTRACT_VERSION
  ) {
    return null
  }
  if (!Array.isArray(input.entries)) return null
  const keys = new Set<string>()
  const entries: FlagDefinitionSyncEntryResult[] = []
  for (const entry of input.entries) {
    const definitionVersion = isRecord(entry) ? entry.definitionVersion : undefined
    if (
      !isRecord(entry) ||
      !validateFlagKey(entry.key) ||
      keys.has(entry.key) ||
      typeof definitionVersion !== 'number' ||
      !Number.isSafeInteger(definitionVersion) ||
      definitionVersion < 1 ||
      typeof entry.created !== 'boolean'
    ) {
      return null
    }
    keys.add(entry.key)
    entries.push({ key: entry.key, definitionVersion, created: entry.created })
  }
  return { ok: true, contractVersion: FLAG_DEFINITION_SYNC_CONTRACT_VERSION, entries }
}

/**
 * Creates the narrow client used by deployment/operator catalog-publish commands.
 *
 * It does not retry writes: the server operation is idempotent, but a caller that loses a response
 * must decide when to retry rather than silently extending a control-plane mutation window.
 */
export function createFlagDefinitionSyncClient(
  config: FlagDefinitionSyncClientConfig
): FlagDefinitionSyncClient {
  const fetchFn = config.fetchImpl ?? fetch

  return {
    async syncFlagDefinitions(
      entries: readonly FlagDefinitionSyncEntry[]
    ): Promise<FlagDefinitionSyncResult> {
      const checked = parseFlagDefinitionSyncRequest({
        contractVersion: FLAG_DEFINITION_SYNC_CONTRACT_VERSION,
        entries: [...entries],
      })
      if (!checked.ok) {
        return {
          ok: false,
          kind: 'validation',
          error: 'Invalid flag definition sync request',
          issues: checked.errors,
        }
      }

      let response: Response
      try {
        response = await fetchFn(`${config.baseUrl.replace(/\/+$/, '')}/api/v1/flags/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.flagSyncKey}`,
          },
          body: JSON.stringify(checked.request),
        })
      } catch (error) {
        return {
          ok: false,
          kind: 'network',
          error: error instanceof Error ? error.message : 'Unknown network error',
        }
      }

      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
      if (!response.ok) {
        return {
          ok: false,
          kind: 'http',
          error: typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`,
          status: response.status,
          ...(body?.issues === undefined ? {} : { issues: body.issues }),
        }
      }
      const success = parseSuccess(body)
      if (!success) {
        return { ok: false, kind: 'response', error: 'Malformed flag definition sync response' }
      }
      return success
    },
  }
}
