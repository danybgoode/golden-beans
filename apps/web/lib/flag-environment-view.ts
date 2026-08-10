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
  type FlagRule,
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
  /** The version has no rules at all: the default variant, and no rollout to draw. */
  | { kind: 'no-rules' }
  /** Rules exist and none carries a rollout — every matching context is served. */
  | { kind: 'everyone' }
  /** Every rule carries the SAME rollout. */
  | { kind: 'rollout'; basisPoints: number }
  /**
   * The rules disagree. `includesUnbounded` is carried separately from the numbers because a rule
   * with no rollout is not "100%": a 100% rollout still excludes a context with no targeting key
   * (A5) and an absent rollout does not. Folding the two into one maximum told a PM their flag
   * misses anonymous traffic when one of its rules does not.
   */
  | { kind: 'several'; highestBasisPoints: number; includesUnbounded: boolean; ruleCount: number }
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

/**
 * The rules the evaluator can actually reach, and the priority beyond which it never looks.
 *
 * ── Why this exists (cross-review, Codex, round 3) ────────────────────────────────────────────
 * `evaluateFlag` sorts ascending and serves the FIRST match. A rule with no clauses and no rollout
 * matches every context — the clause loop never runs and there is no rollout to exclude anyone — so
 * every rule below it is dead code. Summing rollouts over the whole list therefore let an unreachable
 * rule change the number on the bar: a catch-all at priority 10 plus a 50% rule at 20 read as
 * "up to everyone · 2 rules, not all reaching the same share" when the flag in fact serves one
 * variant to everyone and the second rule never runs.
 *
 * **Only the unambiguous shadow is detected**, and deliberately. A rule shadows a later one whenever
 * its conditions are implied by theirs, and deciding implication in general is a solver — the exact
 * appetite trap D8 refuses for the diff. A clause-less, rollout-less rule needs no solver: it
 * matches everything, always. It is also the shape `flag-rule-draft.ts` already refuses to author,
 * for the same reason, so the two halves of the epic agree about which rule is the dangerous one.
 */
function reachableRules(rules: FlagRule[]): { reachable: FlagRule[]; deadAfter: number | null } {
  const ordered = [...rules].sort((left, right) => left.priority - right.priority)
  const catchAll = ordered.findIndex((rule) => rule.clauses.length === 0 && !rule.rollout)
  if (catchAll === -1 || catchAll === ordered.length - 1) return { reachable: ordered, deadAfter: null }
  return { reachable: ordered.slice(0, catchAll + 1), deadAfter: ordered[catchAll].priority }
}

/**
 * What the active version's reachable rules add up to.
 *
 * ── Two collapses this deliberately does NOT make (both caught in review) ─────────────────────
 * 1. **A rollout-less rule is not "no rollout on the flag".** The first version filtered those
 *    rules out before looking for disagreement, so `[10% rule, unrestricted rule]` reported a
 *    confident "10%" while the second rule served its variant to EVERY context it matched. That
 *    understates the blast radius, which is the dangerous direction to be wrong in.
 * 2. **A rollout-less rule is not "100%" either.** Mapping it to the full 10000 fixed (1) and broke
 *    something subtler: beside a rule that really is at 100%, the two agreed and the bar read a
 *    flat "100%". They are not the same — a 100% rollout still excludes a context with no targeting
 *    key (A5), an absent rollout does not — so a flag one of whose rules reaches anonymous traffic
 *    was labelled as one that does not.
 *
 * So bounded and unbounded rules are counted separately, and `several` carries both facts.
 */
function reachOf(rules: FlagRule[]): FlagRolloutReach {
  // No rules at all. There is no rollout to draw, and drawing a FULL bar here — as an earlier
  // version did — reads as "fully rolled out" on a flag that targets nobody and serves its default.
  if (rules.length === 0) return { kind: 'no-rules' }

  const bounded: number[] = []
  let unbounded = 0
  for (const rule of rules) {
    if (!rule.rollout) {
      unbounded += 1
      continue
    }
    // A stored value the D3 seam refuses is a row that disagrees with the parser that wrote it.
    if (basisPointsToPercent(rule.rollout.basisPoints) === null) return { kind: 'unreadable' }
    bounded.push(rule.rollout.basisPoints)
  }

  if (bounded.length === 0) return { kind: 'everyone' }
  if (unbounded === 0 && new Set(bounded).size === 1) return { kind: 'rollout', basisPoints: bounded[0] }
  return {
    kind: 'several',
    highestBasisPoints: Math.max(...bounded),
    includesUnbounded: unbounded > 0,
    ruleCount: rules.length,
  }
}

function labelOf(reach: FlagRolloutReach): string {
  if (reach.kind === 'inactive') return 'not active'
  if (reach.kind === 'no-rules') return 'default only'
  if (reach.kind === 'unreadable') return 'unreadable'
  if (reach.kind === 'everyone') return formatRolloutPercent(null)
  if (reach.kind === 'rollout') return formatRolloutPercent(reach.basisPoints)
  // An unbounded rule in the mix means the widest reach is "everyone who matches it" — a share no
  // percentage names, so the label does not invent one.
  return reach.includesUnbounded
    ? `up to ${formatRolloutPercent(null)}`
    : `up to ${formatRolloutPercent(reach.highestBasisPoints)}`
}

function fillOf(reach: FlagRolloutReach): number | null {
  // `no-rules` draws NO bar, for the same reason `inactive` does: the caption says the bar is the
  // share of the contexts a rule already matches, and with no rules that set is empty.
  if (reach.kind === 'inactive' || reach.kind === 'no-rules' || reach.kind === 'unreadable') return null
  if (reach.kind === 'everyone') return rolloutBarPercent(null)
  if (reach.kind === 'rollout') return rolloutBarPercent(reach.basisPoints)
  return reach.includesUnbounded ? rolloutBarPercent(null) : rolloutBarPercent(reach.highestBasisPoints)
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

  const { reachable, deadAfter } = reachableRules(version.definition.rules)
  const reach = reachOf(reachable)
  const variantKey = baselineVariantKey(flag.key, version)
  const serves =
    variantKey === null
      ? 'this version cannot be evaluated'
      : `a context with no attributes gets ${JSON.stringify(variantKey)}`
  // The count is of RULES — the number a reader can check against the definition. It said "N
  // different rollouts" while counting distinct percentages, so 10/10/50 read as "2 rules" (Codex).
  // And "N rules reach different shares" was then read as a claim that all N differ, when two of
  // those three reach the same one (fresh review, round 2). "not all reaching the same" is the
  // narrower statement, and it is the true one.
  const spread =
    reach.kind === 'several' ? ` · ${reach.ruleCount} rules, not all reaching the same share` : ''
  // Said out loud rather than only silently excluded: a rule the evaluator never reaches is a rule
  // its author believes is doing something, and this is the one place the page can tell them.
  const dead = deadAfter === null ? '' : ` · rules after priority ${deadAfter} never run`

  return {
    environment,
    active: true,
    version: version.version,
    baselineVariantKey: variantKey,
    reach,
    fillPercent: fillOf(reach),
    label: labelOf(reach),
    detail: `v${version.version} · ${serves}${spread}${dead}`,
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
