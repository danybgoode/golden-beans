// golden-frijoles-cli · D4 — the shared command core. One function per verb, ZERO I/O.
//
// ── What this module is, and what it deliberately is not ──────────────────────────────────────
// It is a PLANNER. Each `plan*` function takes already-parsed input plus (for the verbs that
// change an existing flag) the definition currently being served, and returns the definition that
// should be written next and the environments it should be activated in. It never fetches, never
// reads an environment variable, never touches disk, and never talks to a database. The I/O lives
// in `packages/cli/src/api.ts` and in the route handlers.
//
// ── Why it lives in the SDK and not in packages/cli (the whole of D4) ─────────────────────────
// The CLI and the MCP write tools must not drift. The MCP tools live in `apps/web`, which already
// depends on `@golden-frijoles/sdk` and must not start depending on the CLI; the CLI cannot import
// from `apps/web` at all. The SDK is the one place both sides can reach, so putting the planners
// here is what makes parity STRUCTURAL rather than a review checklist: `gf flags kill` and the
// `kill_flag` MCP tool call the same function, so they cannot disagree about what killing a flag
// means. A spec in Sprint 3 asserts plan equality for the same input, and it is only meaningful
// because there is one implementation to compare against itself.
//
// ── Why every plan re-runs the parser (D2's rule, restated) ───────────────────────────────────
// `parseFlagDefinition` is the authority on what is valid, server-side, on every write. These
// planners run it too — not as a second validator, but so a caller gets the parser's own errors
// BEFORE a network call, and so a plan can never emit a definition the backend would reject. Where
// the two could drift this side is stricter, which is the safe direction.
//
// ── The caps are READ, never retyped ─────────────────────────────────────────────────────────
// MAX_FLAG_RULES / MAX_FLAG_CLAUSES / MAX_FLAG_VARIANTS come from ./flags. The SDK's own header
// says why: a client that caps at a literal 20 disagrees with the parser the first time the parser
// changes, and it disagrees SILENTLY, by refusing input the backend would have accepted.

import {
  FLAG_ENVIRONMENTS,
  MAX_FLAG_RULES,
  parseFlagDefinition,
  validateFlagKey,
  type FlagDefinition,
  type FlagEnvironment,
  type FlagRule,
  type FlagValueType,
  type FlagVariant,
  type JsonValue,
} from './flags'
import { percentToBasisPoints } from './rollout-percent'

/**
 * The two variant keys every CLI-created boolean flag has.
 *
 * Named constants rather than string literals at eight call sites, because `kill` has to find the
 * "off" variant in a definition `create` wrote, and a typo in either place would produce a `kill`
 * that silently does nothing to a flag that looks killed.
 */
export const ON_VARIANT_KEY = 'on'
export const OFF_VARIANT_KEY = 'off'

/**
 * D3. The polarity a flag is born with, and the ONLY way a caller expresses its initial state.
 *
 * `kill-switch` ⇒ default `on`, serving `true` everywhere on day one. That is the shape of a switch
 * you reach for to turn something OFF during an incident: it is on until you kill it.
 * `enablement` ⇒ default `off`, serving `false` everywhere. That is the shape of a gate you open
 * deliberately later.
 *
 * ⚠️ **Both polarities ACTIVATE in every requested environment**, and that is a correction to the
 * scope doc's "created DISABLED" wording. In this control plane a definition with no activation is
 * ABSENT from the environment's snapshot, so a consumer resolving it gets `FLAG_NOT_FOUND` and
 * falls back to its own literal — which is exactly the "a flag is invisible until it exists in the
 * provider" failure this epic exists to end. "Disabled" therefore means **serving `false`**, not
 * **not serving**. See the epic README, D3.
 */
export const FLAG_POLARITIES = ['kill-switch', 'enablement'] as const
export type FlagPolarity = (typeof FLAG_POLARITIES)[number]

export type FlagPlan = {
  /** The definition to write as the next immutable version. */
  definition: FlagDefinition
  /**
   * The environments this plan activates the new version in, in `FLAG_ENVIRONMENTS` order.
   *
   * Ordered, and deliberately so: D2's per-environment report is rendered in this order, and a
   * report whose row order varies between runs is one an agent cannot diff.
   */
  environments: FlagEnvironment[]
}

export type FlagPlanResult = { ok: true; plan: FlagPlan } | { ok: false; errors: string[] }

function failure(...errors: string[]): FlagPlanResult {
  return { ok: false, errors }
}

/**
 * The one exit from every planner.
 *
 * Nothing in this module returns a definition that has not been through the real parser. A planner
 * that emitted an unparsed definition would move the failure from "the CLI told me, before it sent
 * anything" to "the server rejected it", which is the round-trip D2 exists to avoid.
 */
function planned(definition: FlagDefinition, environments: FlagEnvironment[]): FlagPlanResult {
  const parsed = parseFlagDefinition(definition)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  return { ok: true, plan: { definition: parsed.definition, environments } }
}

/**
 * Environments in canonical order, de-duplicated.
 *
 * `--env production --env production` is a caller mistake that must not produce two writes to the
 * same environment: the second would fail the optimistic-concurrency check the first advanced, and
 * D2 would then report a partial failure for a request that actually succeeded.
 */
export function normalizeEnvironments(requested: readonly FlagEnvironment[]): FlagEnvironment[] {
  const wanted = new Set(requested)
  return FLAG_ENVIRONMENTS.filter((environment) => wanted.has(environment))
}

/**
 * A description the parser will accept, when the caller gave none.
 *
 * ⚠️ **Without this, the epic's HEADLINE COMMAND failed.** `parseFlagDefinition` requires a
 * NON-BLANK description, and `--description` is optional — so `gf flags create <key>
 * --kill-switch --all-envs`, the exact line the epic exists to make work, returned a 400. Every
 * planner unit test happened to pass a description, and the CLI's own tests stubbed the network, so
 * nothing ran the real parser against the real default until an end-to-end spec against the write
 * route did (PR #150).
 *
 * It lives HERE, in the shared planner, so the MCP `create_flag` tool — whose `description` argument
 * also defaults to '' — is fixed by the same line (D4).
 *
 * The default says what is known and nothing more: the key, what kind of flag it is, and that it was
 * created without a description. It does not invent a purpose.
 */
function describeOrDefault(description: string, key: string, kind: string): string {
  const trimmed = description.trim()
  return trimmed === '' ? `${key} (${kind}) — created without a description` : trimmed
}

export type FlagCreateInput = {
  key: string
  polarity: FlagPolarity
  description: string
  environments: readonly FlagEnvironment[]
}

/**
 * D3 — `gf flags create <key> --kill-switch|--enablement`.
 *
 * The caller supplies the polarity; this derives the variants, the default variant AND the
 * activation. There is no parameter for "what value should it serve", which is the point: a caller
 * cannot express `--kill-switch` with a default of `false`, because the combination is not
 * representable in the input type.
 */
export function planFlagCreate(input: FlagCreateInput): FlagPlanResult {
  if (!validateFlagKey(input.key)) return failure(`\`${input.key}\` is not a valid flag key.`)
  const environments = normalizeEnvironments(input.environments)
  if (environments.length === 0) return failure('Name at least one environment, or use --all-envs.')

  return planned(
    {
      valueType: 'boolean',
      description: describeOrDefault(input.description, input.key, input.polarity),
      defaultVariantKey: input.polarity === 'kill-switch' ? ON_VARIANT_KEY : OFF_VARIANT_KEY,
      variants: [
        { key: OFF_VARIANT_KEY, value: false },
        { key: ON_VARIANT_KEY, value: true },
      ],
      rules: [],
    },
    environments
  )
}

export type FlagTypedCreateInput = {
  key: string
  valueType: FlagValueType
  description: string
  variants: readonly FlagVariant[]
  defaultVariantKey: string
  environments: readonly FlagEnvironment[]
}

/**
 * `gf flags create --type string|number|json`, for the flags polarity does not describe.
 *
 * Polarity is a *boolean* concept — "which way is off?" has no answer for a string flag — so this is
 * a separate entry point rather than an optional branch inside `planFlagCreate`. Keeping them apart
 * is what stops `--kill-switch --type string` being representable.
 */
export function planTypedFlagCreate(input: FlagTypedCreateInput): FlagPlanResult {
  if (!validateFlagKey(input.key)) return failure(`\`${input.key}\` is not a valid flag key.`)
  const environments = normalizeEnvironments(input.environments)
  if (environments.length === 0) return failure('Name at least one environment, or use --all-envs.')
  if (!input.variants.some((variant) => variant.key === input.defaultVariantKey))
    return failure(`The default variant \`${input.defaultVariantKey}\` is not one of the variants.`)

  return planned(
    {
      valueType: input.valueType,
      description: describeOrDefault(input.description, input.key, input.valueType),
      defaultVariantKey: input.defaultVariantKey,
      variants: [...input.variants],
      rules: [],
    },
    environments
  )
}

/**
 * `gf flags set <key> --value <v>` — change which variant is served by default.
 *
 * Takes the CURRENT definition and returns the next one. Variants and rules are carried over
 * untouched: `set` changes the default, and a `set` that quietly dropped a targeting rule would be
 * the worst kind of surprise on a flag someone is mid-rollout on.
 */
export function planFlagSet(input: {
  current: FlagDefinition
  variantKey: string
  environments: readonly FlagEnvironment[]
}): FlagPlanResult {
  const environments = normalizeEnvironments(input.environments)
  if (environments.length === 0) return failure('Name at least one environment, or use --all-envs.')
  if (!input.current.variants.some((variant) => variant.key === input.variantKey))
    return failure(
      `\`${input.variantKey}\` is not a variant of this flag. It has: ${input.current.variants
        .map((variant) => variant.key)
        .join(', ')}.`
    )
  return planned({ ...input.current, defaultVariantKey: input.variantKey }, environments)
}

/**
 * `gf flags rollout <key> --percent <0-100>` — serve the `on` variant to a fraction of contexts.
 *
 * The percent goes through `percentToBasisPoints`, the one conversion seam, which REJECTS rather
 * than clamps. That matters more from a CLI than from a form: `--percent 150` from a script is a
 * typo, and clamping it to 100 would silently agree with something the caller did not mean.
 *
 * ⚠️ **This REPLACES the rule list with a single unconditional rollout rule**, and says so in its
 * name and in `--help`. An unconditional rollout beside existing clause rules would be ambiguous
 * about which one wins at a glance, and "ambiguous at a glance" is what an operator reaches for at
 * 3am. `gf flags rules --rules-file` is the verb for composing several.
 */
export function planFlagRollout(input: {
  current: FlagDefinition
  percent: number
  variantKey?: string
  environments: readonly FlagEnvironment[]
}): FlagPlanResult {
  const environments = normalizeEnvironments(input.environments)
  if (environments.length === 0) return failure('Name at least one environment, or use --all-envs.')

  const basisPoints = percentToBasisPoints(input.percent)
  if (basisPoints === null) return failure('--percent takes a number from 0 to 100.')

  const variantKey = input.variantKey ?? ON_VARIANT_KEY
  if (!input.current.variants.some((variant) => variant.key === variantKey))
    return failure(`\`${variantKey}\` is not a variant of this flag.`)

  return planned(
    {
      ...input.current,
      rules: [{ priority: 1, clauses: [], rollout: { basisPoints }, variantKey }],
    },
    environments
  )
}

/**
 * `gf flags rules <key> --rules-file rules.json` — replace the rule list wholesale.
 *
 * A FILE, never a command-line DSL. The shaping named a rule-expression DSL as the appetite trap
 * that would eat this sprint, and a file has a second property that matters more: rules live in
 * source control, reviewed, next to the code they target.
 *
 * The cap is read from `MAX_FLAG_RULES` and reported before the request, so a caller learns the
 * limit from the CLI rather than from a 400.
 */
export function planFlagRules(input: {
  current: FlagDefinition
  rules: readonly FlagRule[]
  environments: readonly FlagEnvironment[]
}): FlagPlanResult {
  const environments = normalizeEnvironments(input.environments)
  if (environments.length === 0) return failure('Name at least one environment, or use --all-envs.')
  if (input.rules.length > MAX_FLAG_RULES)
    return failure(`A flag takes at most ${MAX_FLAG_RULES} rules; this file has ${input.rules.length}.`)
  return planned({ ...input.current, rules: [...input.rules] }, environments)
}

/**
 * `gf flags kill <key>` — the verb you reach for at 3am.
 *
 * Two things happen, and the second is the one a hand-composed `set --value false` forgets:
 *   1. the default variant becomes the one whose value is `false`, and
 *   2. **every rule is cleared.**
 *
 * Without (2) a flag can read as "off" on the flags page while a 10% rollout rule is still serving
 * `true` to one caller in ten — which is precisely the state an operator is killing the flag to
 * escape. `kill` means nobody, not "nobody except the rule I forgot about".
 *
 * Refuses a non-boolean flag rather than guessing. There is no defensible "off" for a string flag,
 * and picking one would be a silent substitution (CODE-QUALITY #7).
 */
export function planFlagKill(input: {
  current: FlagDefinition
  environments: readonly FlagEnvironment[]
}): FlagPlanResult {
  const environments = normalizeEnvironments(input.environments)
  if (environments.length === 0) return failure('Name at least one environment, or use --all-envs.')
  if (input.current.valueType !== 'boolean')
    return failure(
      `kill only applies to a boolean flag; this one is \`${input.current.valueType}\`. Use \`gf flags set\` and name the variant you want.`
    )

  const off = input.current.variants.find((variant) => variant.value === false)
  if (!off)
    return failure(
      'This flag has no variant whose value is false, so there is nothing to kill it to. Use `gf flags set`.'
    )

  return planned({ ...input.current, defaultVariantKey: off.key, rules: [] }, environments)
}

/**
 * The value a definition serves when no rule matches — what `gf flags ls` prints in the
 * "serving" column.
 *
 * Returns `undefined` when the default variant is missing from the variant list, which the parser
 * forbids; a stored row in that state is corrupt, and the caller renders "unreadable" rather than
 * inventing a value (CODE-QUALITY #8 — a broken read must not look like a legitimate value).
 */
export function defaultServedValue(
  definition: FlagDefinition
): boolean | string | number | JsonValue | undefined {
  return definition.variants.find((variant) => variant.key === definition.defaultVariantKey)?.value
}
