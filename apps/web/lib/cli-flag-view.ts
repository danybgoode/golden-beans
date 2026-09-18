import { FLAG_ENVIRONMENTS, type FlagDefinition, type FlagEnvironment } from '@golden-frijoles/sdk'
import { evaluateVersionDefault } from './flag-environment-view'
import { resolveActivationState, type FlagActivationState } from './flag-list-view'
import type { FlagLifecycleAuditRow, FlagRegistryRow } from './flag-registry'

// golden-frijoles-cli · Sprint 1, Story 1.5 — the agent-facing projection of the flag registry.
//
// ── This file derives NOTHING it could ask for ────────────────────────────────────────────────
// "Is production serving this?" is answered by `resolveActivationState`, and "what does it serve?"
// by `evaluateVersionDefault`, both lifted straight from the console's own view layer. That is not
// tidiness; it is the same argument D4 makes about the command core. The console learned the hard
// way that an activation row pointing at a version does NOT mean "on" — 34 of one project's 42
// flags have a latest version that evaluates to `false` — and a CLI that re-derived "on" from the
// presence of an activation row would print the exact wrong word for most flags in production,
// confidently, in a format an agent is meant to trust.
//
// So: zero clause comparisons, zero activation arithmetic, zero variant lookups in this file. Grep
// it. It reshapes answers other modules give.
//
// ── The shape is a CONTRACT (D5) ──────────────────────────────────────────────────────────────
// Everything below is pinned by a golden file in `packages/cli`. Renaming a field here is a
// breaking change to every agent scraping `--json`, and the golden file is what makes that fact
// arrive in review instead of in someone's pipeline.

/** What one environment is doing with one flag. */
export type CliFlagEnvironmentView = {
  environment: FlagEnvironment
  /**
   * `on` — an activation row points at a version, and that version is what this environment serves.
   * `off` — an activation row exists but holds no version: someone turned this off deliberately.
   * `never` — no activation row has ever existed here.
   *
   * ⚠️ `state: 'on'` says a version is BEING SERVED. It does not say the flag resolves to `true` —
   * read `serving` for that. Conflating the two is the defect described in this file's header.
   */
  state: FlagActivationState
  /** The definition version this environment serves, or null when it serves nothing. */
  version: number | null
  /**
   * What a context with no attributes actually gets — the answer `evaluateFlag` gives, which is the
   * answer production gives. `null` when nothing is served here; `undefined` never appears in JSON,
   * so an unreadable stored row is reported as `readable: false` rather than as a missing key.
   */
  serving: boolean | string | number | unknown | null
  readable: boolean
  updatedAt: string | null
}

export type CliFlagView = {
  key: string
  valueType: FlagDefinition['valueType'] | null
  description: string | null
  /** Highest version number that exists, whether or not any environment serves it. */
  latestVersion: number | null
  environments: CliFlagEnvironmentView[]
}

export type CliFlagVersionView = {
  version: number
  versionId: string
  createdAt: string
  definition: FlagDefinition
  /** The environments currently serving this exact version, in canonical order. */
  servedBy: FlagEnvironment[]
}

export type CliFlagDetailView = CliFlagView & {
  versions: CliFlagVersionView[]
  audit: CliFlagAuditView[]
}

export type CliFlagAuditView = {
  action: FlagLifecycleAuditRow['action']
  environment: FlagEnvironment | null
  reason: string
  createdAt: string
  /**
   * Who did it — the external control-plane identity when one acted, otherwise the Supabase user id.
   *
   * Deliberately not an email: `flag_lifecycle_audit` stores ids, and resolving them to addresses
   * would put one account's email in another member's terminal for no operational gain.
   */
  actor: string
}

/**
 * The version a flag is best DESCRIBED by: what production serves if anything does, else the newest.
 *
 * Same rule `projectFlagRows` applies and for the same reason — describing production with a draft
 * production has never seen is a confident false statement, which is the class of line this whole
 * area of the product exists to stop making.
 */
function describingVersion(flag: FlagRegistryRow) {
  const production = resolveActivationState(flag.activations, 'production')
  if (production.versionId) {
    const served = flag.versions.find((version) => version.id === production.versionId)
    if (served) return served
  }
  return flag.versions.reduce<FlagRegistryRow['versions'][number] | undefined>(
    (highest, candidate) =>
      highest === undefined || candidate.version > highest.version ? candidate : highest,
    undefined
  )
}

function environmentViews(flag: FlagRegistryRow): CliFlagEnvironmentView[] {
  return FLAG_ENVIRONMENTS.map((environment) => {
    const activation = resolveActivationState(flag.activations, environment)
    const version = activation.versionId
      ? flag.versions.find((candidate) => candidate.id === activation.versionId)
      : undefined
    if (!version) {
      return {
        environment,
        state: activation.state,
        version: null,
        serving: null,
        // Nothing is served, which is a fully readable fact — not a corrupt row. Reporting
        // `readable: false` here would make "this environment is off" indistinguishable from
        // "this row is broken", the exact confusion CODE-QUALITY #8 is about.
        readable: true,
        updatedAt: activation.updatedAt,
      }
    }
    const resolved = evaluateVersionDefault(flag.key, version)
    return {
      environment,
      state: activation.state,
      version: version.version,
      serving: resolved.readable ? (resolved.value ?? null) : null,
      readable: resolved.readable,
      updatedAt: activation.updatedAt,
    }
  })
}

export function toCliFlagView(flag: FlagRegistryRow): CliFlagView {
  const describing = describingVersion(flag)
  return {
    key: flag.key,
    valueType: describing?.definition.valueType ?? null,
    description: describing?.definition.description ?? null,
    latestVersion:
      flag.versions.length === 0 ? null : Math.max(...flag.versions.map((version) => version.version)),
    environments: environmentViews(flag),
  }
}

export function toCliFlagDetailView(
  flag: FlagRegistryRow,
  audit: readonly FlagLifecycleAuditRow[]
): CliFlagDetailView {
  const servingByVersionId = new Map<string, FlagEnvironment[]>()
  for (const environment of FLAG_ENVIRONMENTS) {
    const activation = resolveActivationState(flag.activations, environment)
    if (!activation.versionId) continue
    servingByVersionId.set(activation.versionId, [
      ...(servingByVersionId.get(activation.versionId) ?? []),
      environment,
    ])
  }

  return {
    ...toCliFlagView(flag),
    versions: [...flag.versions]
      // Newest first: `gf flags get` is read top-down, and the question being asked is almost always
      // "what changed most recently". The registry returns them ascending for the console's history.
      .sort((left, right) => right.version - left.version)
      .map((version) => ({
        version: version.version,
        versionId: version.id,
        createdAt: version.createdAt,
        definition: version.definition,
        servedBy: servingByVersionId.get(version.id) ?? [],
      })),
    audit: audit
      .filter((row) => row.flagId === flag.id)
      .map((row) => ({
        action: row.action,
        environment: row.environment,
        reason: row.reason,
        createdAt: row.createdAt,
        actor: row.externalActorId ?? row.actorUserId,
      })),
  }
}
