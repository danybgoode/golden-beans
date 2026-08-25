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
} from '@golden-frijoles/sdk'
import { formatRolloutPercent, rolloutBarPercent } from './rollout-percent'
import { resolveActivationState } from './flag-list-view'

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

/**
 * Ask the evaluator the one question a definition alone can answer, and let its verdict on the
 * definition stand as this seam's readability check.
 *
 * ── Why this is ONE call and not a parse plus a call ──────────────────────────────────────────
 * `evaluateFlag` already runs `parseFlagDefinition` internally and reports `INVALID_DEFINITION` when
 * it refuses — so calling the parser separately would validate the same bytes twice, per
 * environment, on a render path (raised in review). Reading the errorCode is the same authority for
 * half the work, and it is strictly broader in the right direction: it also refuses a version whose
 * `defaultVariantKey` names a variant that does not exist, or whose variant value disagrees with the
 * declared type. Every one of those is a version that will serve nothing, which is exactly what the
 * bar must not look confident about.
 *
 * ── Why `valueType` is read with an optional chain, and why that is not a fifth shape guard ────
 * Asking the authority still requires reading ONE field first: `evaluateFlag` needs an
 * `expectedType`, and the only place to get it is the definition. So a `null` JSONB column — or any
 * non-object corruption — threw on the dereference, before the graceful path could run (cross-review,
 * Codex, round 6). The fix is not a validator: an absent or unrecognised `valueType` makes
 * `PROBE_VALUE[…]` `undefined`, which `evaluateFlag` refuses as `TYPE_MISMATCH` before it touches
 * the definition at all. The corruption still gets its verdict from the SDK; this only stops us
 * crashing on the way to asking.
 */
function evaluateBaseline(flagKey: string, version: FlagVersionView) {
  const expectedType = (version.definition as FlagDefinition | null | undefined)?.valueType as FlagValueType
  const resolved = evaluateFlag({
    flag: { key: flagKey, definitionVersion: version.version, definition: version.definition },
    context: {},
    defaultValue: PROBE_VALUE[expectedType],
    expectedType,
  })
  return { readable: resolved.errorCode === undefined, variantKey: resolved.variant ?? null }
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
 *
 * ── This runs on PARSER-CHECKED rules, which is why it holds no shape guards ───────────────────
 * `summarise` puts every stored definition through `parseFlagDefinition` before anything reaches
 * here, so `clauses` is an array, `rollout` is absent or an integer 0–10000, and priorities are
 * unique. Three rounds of review each found one more hand-rolled guard this file was missing — a
 * corrupt basis-points value below a catch-all, a rule with no `clauses` array, a `rollout: null`,
 * a missing `rules` array — which is the shape of a problem that wants one answer, not four. D2
 * already names the authority on what a valid definition is; the read path now asks it, instead of
 * growing a second validator one review finding at a time.
 */
function reachOf(rules: FlagRule[]): { reach: FlagRolloutReach; deadAfter: number | null } {
  // No rules at all. There is no rollout to draw, and drawing a FULL bar here — as an earlier
  // version did — reads as "fully rolled out" on a flag that targets nobody and serves its default.
  if (rules.length === 0) return { reach: { kind: 'no-rules' }, deadAfter: null }

  const { reachable, deadAfter } = reachableRules(rules)
  const bounded: number[] = []
  let unbounded = 0
  for (const rule of reachable) {
    if (!rule.rollout) unbounded += 1
    else bounded.push(rule.rollout.basisPoints)
  }

  if (bounded.length === 0) return { reach: { kind: 'everyone' }, deadAfter }
  if (unbounded === 0 && new Set(bounded).size === 1) {
    return { reach: { kind: 'rollout', basisPoints: bounded[0] }, deadAfter }
  }
  return {
    reach: {
      kind: 'several',
      highestBasisPoints: Math.max(...bounded),
      includesUnbounded: unbounded > 0,
      ruleCount: reachable.length,
    },
    deadAfter,
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

  // ── Story 2.3 / Amendment 2: "turned off" and "never turned on here" are DIFFERENT ────────────
  // This used to be `activations.find(…)?.versionId ?? null`, which mapped BOTH "no activation row
  // has ever existed" and "a row exists holding NULL" to the same value, and rendered both as
  // "Nothing is activated here."
  //
  // They are not the same fact. `deactivate_flag` keeps the row and nulls its version, so a row
  // holding NULL is the fingerprint of a deliberate act by a named actor with a stated reason,
  // recorded in the lifecycle audit. No row at all means nobody has ever switched this on or off
  // here — there is nothing in the audit because nothing happened.
  //
  // At this project's live scale the collapse was not a small imprecision: 40 of 42 flags have no
  // activation row in ANY environment, so the old wording described forty untouched features and
  // one deliberate kill with one sentence.
  //
  // `resolveActivationState` is imported rather than reimplemented — it is exported from
  // `flag-list-view` for exactly this, so the list and this seam cannot drift about what "on" means.
  const { state, versionId } = resolveActivationState(flag.activations, environment)
  if (state === 'never') return inactive('No one has switched this on or off in this environment.')
  if (state === 'off') return inactive('Switched off here.')
  const version = flag.versions.find((row) => row.id === versionId)
  // An activation pointing at a version this view does not carry. Not reachable through the app's
  // own write path, and named rather than crashed on: an environment whose activation cannot be
  // resolved is precisely the state a PM needs told, not the one to render as "off".
  if (!version) return inactive('Activated version could not be read.')

  // ── The read path asks D2's authority, rather than growing a second validator ──────────────────
  // `definition` is a JSONB column. Its TypeScript type is a promise the database does not make, and
  // four review findings across three rounds were each one more shape this file failed to guard —
  // a corrupt basis-points value, a rule with no `clauses` array, a `rollout: null`, a missing
  // `rules` array. Guarding them one at a time builds exactly the second validator D2 forbids, and
  // it would still be one finding behind. The evaluator is the authority on whether a version can
  // serve anything; a version it refuses is described as unreadable and draws no bar, rather than a
  // confident percentage over rules nothing will ever consult.
  const baseline = evaluateBaseline(flag.key, version)
  if (!baseline.readable) {
    return {
      environment,
      active: true,
      version: version.version,
      baselineVariantKey: null,
      reach: { kind: 'unreadable' },
      fillPercent: null,
      label: labelOf({ kind: 'unreadable' }),
      detail: `v${version.version} · this version cannot be evaluated`,
    }
  }

  // Safe by the gate above, not by the type: a definition the evaluator accepted has parsed, so
  // every rule has a `clauses` array, a unique integer priority and a rollout of 0–10000 or none.
  const { reach, deadAfter } = reachOf(version.definition.rules)
  const variantKey = baseline.variantKey
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
