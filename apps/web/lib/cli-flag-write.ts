import 'server-only'
import {
  FLAG_ENVIRONMENTS,
  defaultServedValue,
  normalizeEnvironments,
  planFlagCreate,
  planFlagKill,
  planFlagRollout,
  planFlagRules,
  planFlagSet,
  planTypedFlagCreate,
  type FlagDefinition,
  type FlagEnvironment,
  type FlagPlanResult,
  type FlagPolarity,
  type FlagRule,
  type FlagValueType,
  type FlagVariant,
} from '@golden-frijoles/sdk'
import { createFlagDefinitionVersion, getFlagRegistryView, setFlagActivation } from './flag-registry'
import { resolveActivationState } from './flag-list-view'

// golden-frijoles-cli · Sprint 2 — the write executor. The I/O half of D4.
//
// ── The division of labour, and why it is the whole of D4 ─────────────────────────────────────
// `@golden-frijoles/sdk`'s `plan*` functions decide WHAT to write — the definition and the
// environments — with zero I/O. This module does the writing. The CLI and (Sprint 3.4) the MCP
// write tools both arrive here through the same planners, so a verb and its tool cannot disagree
// about what "kill" means: there is one implementation of that decision and it is not in this file.
//
// Grep this module for a variant lookup, a rollout calculation or a polarity branch. There is none.
//
// ── D2: the partial-failure contract, implemented ─────────────────────────────────────────────
// Three environments, three writes, NO TRANSACTION — `set_flag_activation` is one RPC per
// environment and Supabase speaks REST, not sessions. So:
//
//   • each environment is attempted INDEPENDENTLY; one failing does not stop the others,
//   • each gets a row in the report with its own status and its own error,
//   • the caller is told `partial` when some succeeded and some did not,
//   • and there is NO ROLLBACK ATTEMPT. "Undo the two that worked" is a fourth non-transactional
//     write that can itself half-fail, turning one legible partial state into an illegible one.
//
// ── D10: nothing new touches flag state ───────────────────────────────────────────────────────
// Every write below goes through `lib/flag-registry.ts` — the same `create_flag_definition_version`
// and `set_flag_activation` the console's own server actions call, carrying the same
// `expected_snapshot_version`, writing the same audit rows, and re-checking project OWNERSHIP
// inside the SECURITY DEFINER function regardless of what this application code believes.

export type CliWriteCommand =
  | { command: 'create'; polarity: FlagPolarity; description: string }
  | {
      command: 'create'
      valueType: Exclude<FlagValueType, 'boolean'>
      description: string
      variants: FlagVariant[]
      defaultVariantKey: string
    }
  | { command: 'set'; variantKey: string }
  | { command: 'rollout'; percent: number; variantKey?: string }
  | { command: 'rules'; rules: FlagRule[] }
  | { command: 'kill' }

export type EnvironmentOutcome = {
  environment: FlagEnvironment
  /**
   * `applied` — the environment now serves the new version.
   * `unchanged` — it already served exactly this version; nothing was written and no audit row
   *   exists, because `set_flag_activation` returns `changed: false` without touching anything.
   * `conflict` — someone else changed this environment between the read and the write.
   * `failed` — anything else.
   */
  status: 'applied' | 'unchanged' | 'conflict' | 'failed'
  snapshotVersion: number | null
  error?: string
}

export type CliWriteResult =
  | {
      ok: true
      /** `partial` when some environments changed and some did not — the caller exits 5 (D2). */
      outcome: 'applied' | 'partial'
      flagKey: string
      version: number
      versionId: string
      /** False when an identical definition already existed and was reused rather than re-written. */
      versionCreated: boolean
      serving: unknown
      environments: EnvironmentOutcome[]
    }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string; issues?: string[] }

/**
 * The definition a change is computed FROM.
 *
 * ⚠️ **What `production` serves, when it serves something — not the newest version.** The same rule
 * `projectFlagRows` and `cli-flag-view.ts` apply, and here it is not cosmetic: computing a rollout
 * from an unactivated draft would silently publish that draft's rules alongside the rollout. An
 * operator who ran `gf flags rollout` expecting to change one number would have shipped someone
 * else's unreviewed targeting with it.
 *
 * When several environments are being written at once and they serve DIFFERENT versions, this still
 * picks one base — see `baseDisagreement` below, which refuses rather than picking quietly.
 */
function baseDefinition(
  flag: Awaited<ReturnType<typeof getFlagRegistryView>>['flags'][number],
  environments: readonly FlagEnvironment[]
): { definition: FlagDefinition; versionId: string } | null {
  const preferred = environments.includes('production') ? 'production' : environments[0]
  const activation = resolveActivationState(flag.activations, preferred)
  if (activation.versionId) {
    const served = flag.versions.find((version) => version.id === activation.versionId)
    if (served) return { definition: served.definition, versionId: served.id }
  }
  const newest = flag.versions.reduce<(typeof flag.versions)[number] | undefined>(
    (highest, candidate) =>
      highest === undefined || candidate.version > highest.version ? candidate : highest,
    undefined
  )
  return newest ? { definition: newest.definition, versionId: newest.id } : null
}

/**
 * Do the named environments disagree about which version they serve?
 *
 * ⚠️ **This refuses rather than picking one, and that is a deliberate cost.** `gf flags rollout
 * <key> --all-envs --percent 25` across environments serving v3, v3 and v7 has no single correct
 * answer: whichever base is chosen, two environments get a definition they were not on, and the
 * command reports success. Silently flattening a deliberate divergence — a canary held back in
 * production, say — is exactly the confident-and-wrong write this product keeps finding.
 *
 * The remedy is in the message: name one environment at a time.
 */
function baseDisagreement(
  flag: Awaited<ReturnType<typeof getFlagRegistryView>>['flags'][number],
  environments: readonly FlagEnvironment[]
): string | null {
  const served = environments
    .map((environment) => resolveActivationState(flag.activations, environment).versionId)
    .filter((versionId): versionId is string => versionId !== null)
  const distinct = new Set(served)
  if (distinct.size <= 1) return null
  const detail = environments
    .map((environment) => {
      const activation = resolveActivationState(flag.activations, environment)
      const version = flag.versions.find((candidate) => candidate.id === activation.versionId)
      return `${environment}=${version ? `v${version.version}` : 'nothing'}`
    })
    .join(', ')
  return (
    `These environments do not serve the same version (${detail}), so there is no single definition ` +
    `to change. Name one environment at a time with --env.`
  )
}

export async function executeCliFlagWrite(input: {
  projectId: string
  actorUserId: string
  flagKey: string
  environments: readonly FlagEnvironment[]
  reason: string
  command: CliWriteCommand
}): Promise<CliWriteResult> {
  const environments = normalizeEnvironments(input.environments)
  if (environments.length === 0)
    return { ok: false, status: 400, error: 'Name at least one environment, or use --all-envs.' }

  let registry: Awaited<ReturnType<typeof getFlagRegistryView>>
  try {
    registry = await getFlagRegistryView(input.projectId)
  } catch (err) {
    console.error('[cli-flag-write] registry read failed:', err)
    return { ok: false, status: 500, error: 'Could not read this project’s flags right now.' }
  }

  const flag = registry.flags.find((candidate) => candidate.key === input.flagKey)

  // ── plan ───────────────────────────────────────────────────────────────────────────────────
  let plan: FlagPlanResult
  if (input.command.command === 'create') {
    // A `create` on an existing key is allowed and means "a new version of it". The RPC already
    // reuses the registry row and increments the version, so refusing here would break the
    // idempotent re-run `gf init` and every CI pipeline depends on.
    plan =
      'polarity' in input.command
        ? planFlagCreate({
            key: input.flagKey,
            polarity: input.command.polarity,
            description: input.command.description,
            environments,
          })
        : planTypedFlagCreate({
            key: input.flagKey,
            valueType: input.command.valueType,
            description: input.command.description,
            variants: input.command.variants,
            defaultVariantKey: input.command.defaultVariantKey,
            environments,
          })
  } else {
    if (!flag) return { ok: false, status: 404, error: `No flag \`${input.flagKey}\` in this project.` }
    const disagreement = baseDisagreement(flag, environments)
    if (disagreement) return { ok: false, status: 400, error: disagreement }
    const base = baseDefinition(flag, environments)
    if (!base)
      return {
        ok: false,
        status: 404,
        error: `\`${input.flagKey}\` has no definition version to change. Create one first.`,
      }

    plan =
      input.command.command === 'set'
        ? planFlagSet({ current: base.definition, variantKey: input.command.variantKey, environments })
        : input.command.command === 'rollout'
          ? planFlagRollout({
              current: base.definition,
              percent: input.command.percent,
              variantKey: input.command.variantKey,
              environments,
            })
          : input.command.command === 'rules'
            ? planFlagRules({ current: base.definition, rules: input.command.rules, environments })
            : planFlagKill({ current: base.definition, environments })
  }

  if (!plan.ok)
    return { ok: false, status: 400, error: plan.errors[0] ?? 'Invalid flag command.', issues: plan.errors }

  // ── reuse an identical version rather than writing a new one ───────────────────────────────
  //
  // ⚠️ **`create_flag_definition_version` ALWAYS creates a version** — it takes `max(version)+1` and
  // inserts. So without this, re-running `gf flags create … --all-envs` produced v1, v2, v3… of a
  // definition that never changed, and every re-run rewrote the activation and wrote an audit row
  // saying something had happened. An agent re-running its own setup script is the ordinary case,
  // not an edge one, and the epic's acceptance says re-running is idempotent.
  //
  // Found by auditing that acceptance criterion against the RPC rather than ticking it.
  //
  // The semantics match `import_flag_definition_catalog`, which the catalog-sync path already has:
  // an identical definition is a no-op that reports itself as one. Matching on the PARSED shape, not
  // on raw JSON text, so key order and whitespace cannot make two identical definitions look
  // different — `parseFlagDefinition` has already normalised both sides.
  const identical = flag?.versions.find(
    (version) => JSON.stringify(version.definition) === JSON.stringify(plan.plan.definition)
  )

  const created = identical
    ? { ok: true as const, flagId: flag!.id, versionId: identical.id, version: identical.version }
    : await createFlagDefinitionVersion({
        projectId: input.projectId,
        flagKey: input.flagKey,
        definition: plan.plan.definition,
        reason: input.reason,
        actorUserId: input.actorUserId,
      })
  if (!created.ok) return { ok: false, status: 500, error: created.error }

  // ── activate, per environment, independently (D2) ──────────────────────────────────────────
  const snapshotByEnvironment = new Map(
    registry.environments.map((row) => [row.environment, row.snapshotVersion] as const)
  )
  const outcomes: EnvironmentOutcome[] = []
  for (const environment of environments) {
    // A project that has never served in this environment has no state row yet. `0` is what the RPC
    // creates it at, and passing it is how a first activation succeeds rather than conflicting with
    // a row that does not exist.
    const expected = snapshotByEnvironment.get(environment) ?? 0
    const result = await setFlagActivation({
      projectId: input.projectId,
      environment,
      flagId: created.flagId,
      versionId: created.versionId,
      expectedSnapshotVersion: expected,
      reason: input.reason,
      actorUserId: input.actorUserId,
    })
    if (!result.ok) {
      // The RPC raises `40001` for a snapshot conflict and `lib/flag-registry.ts` turns it into the
      // "someone else changed this" message; anything else is a real failure. Matching on the
      // MESSAGE would be fragile, so the shape of the distinction is carried by that module and
      // this one reads only whether it is the reload-and-retry case.
      const conflict = /changed this environment/i.test(result.error)
      outcomes.push({
        environment,
        status: conflict ? 'conflict' : 'failed',
        snapshotVersion: null,
        error: result.error,
      })
      continue
    }
    outcomes.push({
      environment,
      // `changed: false` means the environment already served exactly this version — no row was
      // written and no audit row exists. Reporting it as `applied` would claim a change that left
      // no trace, which is the kind of small lie an incident timeline is reconstructed from.
      status: result.changed ? 'applied' : 'unchanged',
      snapshotVersion: result.snapshotVersion,
    })
  }

  const failed = outcomes.filter((row) => row.status === 'conflict' || row.status === 'failed')
  return {
    ok: true,
    // ⚠️ `partial` whenever ANY environment failed — including when ALL of them did. A definition
    // version may have been created either way, so "everything failed" is not the same as "nothing
    // happened", and reporting it as a clean failure would hide a new version in the registry.
    outcome: failed.length === 0 ? 'applied' : 'partial',
    flagKey: input.flagKey,
    version: created.version,
    versionId: created.versionId,
    // Whether this run added to the version history. `false` means an identical definition already
    // existed and was reused — the honest answer to "did anything change?", which the per-environment
    // rows alone cannot give (they describe activation, not authorship).
    versionCreated: identical === undefined,
    serving: defaultServedValue(plan.plan.definition) ?? null,
    environments: outcomes,
  }
}

/** Every environment, for `--all-envs`. Exported so the route never retypes the list. */
export const ALL_ENVIRONMENTS: readonly FlagEnvironment[] = FLAG_ENVIRONMENTS
