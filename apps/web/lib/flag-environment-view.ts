// flags-visual-rule-builder · Sprint 2, Stories 2.1 and 2.2 — what each environment is actually
// serving, derived once, in a place that can be asserted without a browser.
//
// ── Why this seam exists (it is not in the README's seam table) ────────────────────────────────
// Story 2.2's acceptance is "the state shown matches what the SDK's evaluator would return for that
// environment's snapshot; **a spec asserts the agreement** rather than trusting the render." A claim
// like that can only be asserted where the derivation lives. Left inside the component it would be
// reachable only through a signed-in browser session, which is the "guard behind state the harness
// cannot reach" that CODE-QUALITY rule 5 says to extract. So the arithmetic and the words live here
// and `RolloutBar` renders what it is handed.
//
// ── A4: no query is added ─────────────────────────────────────────────────────────────────────
// Everything below is a pure derivation over props `getFlagRegistryView()` already returns — every
// version with its full definition, plus per-environment activations. A Supabase call in Sprint 2
// is a wrong turn, and this file's signature is what makes that visible: it takes plain data.
//
// ── D4, applied a sprint early ────────────────────────────────────────────────────────────────
// The variant each environment resolves to comes from `evaluateFlag` — the SDK's own evaluator, the
// one production serves from. There is no clause comparison anywhere in this file; grep it. A page
// that re-implemented matching to draw a badge would disagree with production at exactly the moment
// someone trusted the badge, and it would disagree silently.

import {
  FLAG_ENVIRONMENTS,
  evaluateFlag,
  type FlagDefinition,
  type FlagEnvironment,
  type FlagValueType,
} from '@golden-beans/sdk'
import { basisPointsToPercent, formatRolloutPercent, rolloutBarPercent } from './rollout-percent'

/** Only the fields this derivation reads. Structural, so `flag-registry`'s rows satisfy it as-is. */
export type FlagVersionView = { id: string; version: number; definition: FlagDefinition }
export type FlagActivationView = { environment: FlagEnvironment; versionId: string | null }
export type FlagView = {
  key: string
  versions: FlagVersionView[]
  activations: FlagActivationView[]
}

/**
 * How far the active version's rollout reaches — of the contexts that match its conditions.
 *
 * **This is deliberately not "what proportion of your users see the flag".** That number needs a
 * population and this page has none; inventing one would be the most confident wrong number on the
 * screen. What a definition CAN say is how wide its rollouts are, so that is what the bar means and
 * what its caption says.
 *
 * `several` is the honest answer when rules disagree. One bar cannot represent three rollouts, and
 * picking one of them silently is how a PM reads "10%" off a flag that is also serving a second
 * variant to everyone.
 */
export type FlagRolloutReach =
  | { kind: 'inactive' }
  | { kind: 'everyone' }
  | { kind: 'rollout'; basisPoints: number }
  | { kind: 'several'; highestBasisPoints: number; count: number }
  | { kind: 'unreadable' }

export type FlagEnvironmentSummary = {
  environment: FlagEnvironment
  active: boolean
  /** The immutable version number activated here, or `null` when nothing is. */
  version: number | null
  /**
   * The variant an attribute-free context resolves to, **straight from `evaluateFlag`**.
   *
   * "A context with nothing set" is the one question the definition alone can answer, and it is the
   * question behind "is this live in production" — it is what an anonymous visitor gets. `null`
   * means the evaluator refused the version (an unparseable definition, a missing variant), which
   * is rendered as such rather than as a variant name nobody chose.
   */
  baselineVariantKey: string | null
  reach: FlagRolloutReach
  /** 0–100 for the bar, or `null` when there is nothing readable to draw. */
  fillPercent: number | null
  /** The label beside the bar. Always from the D3 seam; never a number formatted here. */
  label: string
  /** The second line — the version and what it resolves to. */
  detail: string
}

/**
 * A `defaultValue` the evaluator will accept for each value type.
 *
 * `evaluateFlag` returns `TYPE_MISMATCH` if the default does not match `expectedType`, so this is
 * required to ask the question at all. The value is never displayed — only `.variant` is read — so
 * these are the smallest valid inhabitants of each type and carry no meaning.
 */
const PROBE_VALUE: Record<FlagValueType, unknown> = {
  boolean: false,
  string: '',
  number: 0,
  json: {},
}

function baselineVariantKey(flagKey: string, version: FlagVersionView): string | null {
  const expectedType = version.definition.valueType
  const resolved = evaluateFlag({
    flag: { key: flagKey, definitionVersion: version.version, definition: version.definition },
    context: {},
    defaultValue: PROBE_VALUE[expectedType],
    expectedType,
  })
  return resolved.variant ?? null
}

function reachOf(definition: FlagDefinition): FlagRolloutReach {
  const basisPoints = definition.rules
    .map((rule) => rule.rollout?.basisPoints)
    .filter((points): points is number => points !== undefined)

  // No rule carries a rollout: every context that matches is served. A full bar, and the label says
  // so — an empty bar reading as 0% is the exact failure Story 2.1 names.
  if (basisPoints.length === 0) return { kind: 'everyone' }
  // A stored value the D3 seam refuses is a row that disagrees with the parser that wrote it.
  if (basisPoints.some((points) => basisPointsToPercent(points) === null)) return { kind: 'unreadable' }

  const distinct = [...new Set(basisPoints)]
  if (distinct.length === 1) return { kind: 'rollout', basisPoints: distinct[0] }
  return { kind: 'several', highestBasisPoints: Math.max(...distinct), count: distinct.length }
}

function labelOf(reach: FlagRolloutReach): string {
  if (reach.kind === 'inactive') return 'not active'
  if (reach.kind === 'unreadable') return 'unreadable'
  if (reach.kind === 'everyone') return formatRolloutPercent(null)
  if (reach.kind === 'rollout') return formatRolloutPercent(reach.basisPoints)
  return `up to ${formatRolloutPercent(reach.highestBasisPoints)}`
}

function fillOf(reach: FlagRolloutReach): number | null {
  if (reach.kind === 'inactive' || reach.kind === 'unreadable') return null
  if (reach.kind === 'everyone') return rolloutBarPercent(null)
  if (reach.kind === 'rollout') return rolloutBarPercent(reach.basisPoints)
  return rolloutBarPercent(reach.highestBasisPoints)
}

function summarise(flag: FlagView, environment: FlagEnvironment): FlagEnvironmentSummary {
  const inactive = (detail: string): FlagEnvironmentSummary => ({
    environment,
    active: false,
    version: null,
    baselineVariantKey: null,
    reach: { kind: 'inactive' },
    fillPercent: null,
    label: labelOf({ kind: 'inactive' }),
    detail,
  })

  const versionId = flag.activations.find((row) => row.environment === environment)?.versionId ?? null
  if (versionId === null) return inactive('Nothing is activated here.')
  const version = flag.versions.find((row) => row.id === versionId)
  // An activation pointing at a version this view does not carry. Not reachable through the app's
  // own write path, and named rather than crashed on: an environment whose activation cannot be
  // resolved is precisely the state a PM needs told, not the one to render as "off".
  if (!version) return inactive('Activated version could not be read.')

  const reach = reachOf(version.definition)
  const variantKey = baselineVariantKey(flag.key, version)
  const serves =
    variantKey === null
      ? 'this version cannot be evaluated'
      : `a context with no attributes gets ${JSON.stringify(variantKey)}`
  const spread = reach.kind === 'several' ? ` · ${reach.count} rules carry different rollouts` : ''

  return {
    environment,
    active: true,
    version: version.version,
    baselineVariantKey: variantKey,
    reach,
    fillPercent: fillOf(reach),
    label: labelOf(reach),
    detail: `v${version.version} · ${serves}${spread}`,
  }
}

/**
 * Every environment's state for one flag, in the SDK's own environment order.
 *
 * Total by construction — one entry per `FLAG_ENVIRONMENTS` value, so `RolloutBar` can require the
 * complete record and the type system rules out a page that quietly renders two bars instead of
 * three. The seed is cast because the record is only total once the loop below has run; the loop is
 * driven by the constant, which is the part D5 is about.
 */
export function summariseFlagEnvironments(flag: FlagView): Record<FlagEnvironment, FlagEnvironmentSummary> {
  const summaries = {} as Record<FlagEnvironment, FlagEnvironmentSummary>
  for (const environment of FLAG_ENVIRONMENTS) summaries[environment] = summarise(flag, environment)
  return summaries
}
