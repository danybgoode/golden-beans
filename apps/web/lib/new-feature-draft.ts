// console-ia-overhaul · Sprint 3, Story 3.3 — what "New feature" composes, decided outside the DOM.
//
// ── Why this module exists ────────────────────────────────────────────────────────────────────
// Story 3.3 deletes the two free-key creation paths on the features list (A3/A21) and lands their
// replacement in the same commit. The replacement is a client island, and a client island in a
// credential-gated route is reachable only from a signed-in browser — which this repo's blocking
// gate does not have. So the composition, the normalisation and the per-step completeness rules
// live here, where `npm run test:unit` IS the gate for them, and the component is left with
// keystrokes and markup.
//
// Same argument and same shape as `lib/console-palette.ts`, `lib/console-shell.ts` and
// `lib/flag-console-copy.ts` (CODE-QUALITY rule 5). **This module imports nothing at all** — that
// is what lets `node --test` load it without module aliasing.
//
// ── It is NOT a second validator ──────────────────────────────────────────────────────────────
// `flags-visual-rule-builder` A1 locked "one write path, one validator": every creation posts
// through `createFlagDefinitionVersionAction`, which calls the SDK's `validateFlagKey` and
// `parseFlagDefinition` server-side. Nothing here re-implements either. What this module does is
// COMPOSE a key and a definition that those two accept, and refuse to submit an obviously empty
// draft — the difference is that a bug here produces a rejection from the server, never an
// unvalidated write.

/**
 * The fixed ending, from the approved design.
 *
 * > *"The area comes from a list and the ending is fixed — the middle is the only thing anyone
 * > types in this whole console, because it is the word the code will import."*
 *
 * It matches the live convention: every one of `miyagisanchez`'s 42 keys ends `_enabled`
 * (`checkout.stripe_enabled`, `catalog.owned_shop_only_enabled`, …). A key of any other shape is
 * still creatable through catalog sync, which is where a key the console did not author comes from.
 */
export const NEW_FEATURE_KEY_SUFFIX = '_enabled'

/** The value that means "no area" in the area picker. Empty string, so it cannot collide with one. */
export const NO_FEATURE_AREA = ''

export type NewFeatureKind = 'killswitch' | 'enablement'
export type NewFeatureRisk = 'high' | 'medium' | 'low'

export type NewFeatureDraft = {
  /** A namespace from `featureAreas()`, or `NO_FEATURE_AREA`. */
  area: string
  /** The one thing a person types. Already normalised by `normaliseFeatureName`. */
  name: string
  /** One sentence. Required — `parseFlagDefinition` rejects a blank description. */
  description: string
  kind: NewFeatureKind | null
  risk: NewFeatureRisk | null
}

export const EMPTY_NEW_FEATURE_DRAFT: NewFeatureDraft = {
  area: NO_FEATURE_AREA,
  name: '',
  description: '',
  kind: null,
  risk: null,
}

/**
 * The areas this project already uses, derived from its own keys.
 *
 * ⚠️ **Derived, not listed.** The prototype hardcodes sixteen namespaces, which are exactly
 * `miyagisanchez`'s — a mock's fixture, not a product decision. A hardcoded list would be wrong for
 * every other tenant and would go stale for this one the first time the catalog sync introduced a
 * seventeenth. Reading them off the existing keys produces the prototype's own list for the tenant
 * it was drawn from, and the right list for everybody else.
 *
 * A key with no dot contributes no area. Sorted, so the picker's order does not depend on the
 * registry's.
 */
export function featureAreas(keys: readonly string[]): string[] {
  const areas = new Set<string>()
  for (const key of keys) {
    const dot = key.indexOf('.')
    if (dot > 0) areas.add(key.slice(0, dot))
  }
  return [...areas].sort()
}

/**
 * What a keystroke is allowed to leave in the name field.
 *
 * Lowercased, and anything outside `[a-z0-9_]` dropped — the prototype does the same, and for the
 * same reason: the composed key has to satisfy the SDK's `FLAG_KEY` pattern, and a person typing a
 * space or a capital should see it corrected as they type rather than be told afterwards.
 *
 * ⚠️ A dot is deliberately NOT allowed here even though `FLAG_KEY` permits one. The area picker is
 * where a namespace comes from; letting the name field smuggle a second one in would make the
 * preview line ("Code will import …") stop describing what gets created.
 */
export function normaliseFeatureName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '')
}

/**
 * The key that will be created.
 *
 * `catalog` + `owned_shop` → `catalog.owned_shop_enabled`; no area → `owned_shop_enabled`.
 *
 * The `preview` form substitutes an ellipsis for an empty middle so the reader can see the SHAPE of
 * what they are naming before they have named it — which is what the design's "Code will import"
 * box is for.
 */
export function composeFeatureKey(area: string, name: string): string {
  const middle = normaliseFeatureName(name)
  const stem = middle === '' ? '' : `${middle}${NEW_FEATURE_KEY_SUFFIX}`
  return area === NO_FEATURE_AREA ? stem : `${area}.${stem}`
}

export function previewFeatureKey(area: string, name: string): string {
  const middle = normaliseFeatureName(name)
  const stem = `${middle === '' ? '…' : middle}${NEW_FEATURE_KEY_SUFFIX}`
  return area === NO_FEATURE_AREA ? stem : `${area}.${stem}`
}

/** The wizard's three steps, in order. `check` is a review; it has nothing of its own to fill in. */
export const NEW_FEATURE_STEPS = ['name', 'kind', 'check'] as const
export type NewFeatureStep = (typeof NEW_FEATURE_STEPS)[number]

/**
 * Why this step cannot be left yet — a sentence, or `null` when it can.
 *
 * Returning the REASON rather than a boolean is what lets the footer say why the button is disabled
 * instead of leaving a dead control the reader has to guess at. `landing-frijoles-rebrand` shipped
 * three guards that could not fail; a disabled button with no explanation is the interface version
 * of the same thing.
 *
 * ⚠️ **The `name` rule is not cosmetic.** With no area the composed key IS the name plus the
 * suffix, and the SDK's `FLAG_KEY` pattern requires a leading LETTER — so `2fa` would compose
 * `2fa_enabled` and be rejected server-side after three steps of work. Caught here, at the step
 * that owns the field.
 */
export function stepProblem(draft: NewFeatureDraft, step: NewFeatureStep): string | null {
  if (step === 'name') {
    const name = normaliseFeatureName(draft.name)
    if (name.length < 3) return 'Give it a name of at least three characters.'
    if (draft.area === NO_FEATURE_AREA && !/^[a-z]/.test(name))
      return 'With no area, the name has to start with a letter.'
    if (draft.description.trim() === '') return 'Say in one sentence what this controls.'
    if (draft.description.trim().length > 500)
      return 'Keep the sentence under 500 characters — this is the line the list shows.'
    return null
  }
  if (step === 'kind') {
    if (draft.kind === null) return 'Pick whether this is a kill switch or a release toggle.'
    if (draft.risk === null) return 'Say how bad it is if this goes the wrong way.'
    return null
  }
  // `check` re-asks both, so a draft edited backwards cannot be submitted from the review step.
  return stepProblem(draft, 'name') ?? stepProblem(draft, 'kind')
}

/**
 * Whether this key already belongs to a feature — a sentence, or `null`.
 *
 * ⚠️ **This is the one guard without which the button's LABEL is wrong.**
 * `createFlagDefinitionVersionAction` creates a new immutable VERSION when the key already exists;
 * it does not fail. So a wizard that reached it with `checkout.stripe_enabled` would quietly write
 * a v-next over a live feature — a plain on/off definition with no rules — under a control that
 * said "New feature". The server is doing the right thing (that action's job is versioning); the
 * mistake would be this surface calling it for something else.
 *
 * **Advisory, and deliberately so.** The authoritative registry is the database, and two operators
 * can create the same key concurrently — this cannot close that window and does not claim to. What
 * it closes is the ordinary case, where the key is already on the list the reader is looking at.
 * The consequence of losing the race is a second version of an existing flag, which is visible,
 * audited and revertible by serving the earlier version.
 */
export function takenKeyProblem(key: string, existingKeys: readonly string[]): string | null {
  if (!existingKeys.includes(key)) return null
  return `${key} already exists. Open it from the list to change it, or pick another name.`
}

/**
 * The definition the create action receives.
 *
 * **Plain on/off, and nothing else.** The design is explicit: *"This feature is a plain on/off
 * switch, like all 42 of them. If the code ever gives it something to choose between, the choices
 * appear here as buttons — never as a box to type in."* Rules stay empty — targeting is the rule
 * builder's subject, and this control creates the key, it does not target it.
 *
 * ⚠️ **`defaultVariantKey` is `on` for BOTH kinds, and that is a decision, not an oversight.**
 *
 * The obvious reading of the design — *"a kill switch is on by default, a release toggle is off by
 * default"* — maps `enablement` to `defaultVariantKey: 'off'`. In this control plane that would
 * create a feature you cannot turn on. Golden separates two things the prototype does not:
 * **activation** (does this environment serve a version) and **what the served version
 * EVALUATES to** (its default variant). A definition defaulting to `off` serves `false` while the
 * console reports the feature as on — the "activated ≠ on" trap, and the latest version of 34 of 42
 * live flags is in exactly that state.
 *
 * `describeActivationSurprise` exists to warn about it: turning on a version whose default is
 * `false` raises a confirm reading *"the feature it guards still will NOT appear"*. So a wizard that
 * created release toggles defaulting to `off` would manufacture features whose own switch warns
 * about them, every time, forever. The default variant answers *"what does this serve once it is
 * on"*, and the answer for something a person just created is `on`.
 *
 * **What the KIND actually decides, then:** `metadata.polarity`, which drives how loudly the console
 * warns before a flip and how the list sorts and filters. That is what the design's own words claim
 * for it — *"the difference decides how loudly this screen warns you before flipping it"* — so
 * nothing is lost by not overloading the default variant with it.
 *
 * `metadata.polarity` / `metadata.criticality` are the STORED spellings `lib/flag-list-view.ts`
 * reads — `killswitch`, one word. `flag-vocabulary.ts` owns what a person reads; this owns what is
 * written, and they are deliberately not the same strings.
 */
export function buildNewFeatureDefinition(draft: NewFeatureDraft): {
  valueType: 'boolean'
  description: string
  defaultVariantKey: 'on'
  variants: Array<{ key: 'off' | 'on'; value: boolean }>
  rules: never[]
  metadata: { polarity: NewFeatureKind; criticality: NewFeatureRisk }
} {
  if (draft.kind === null || draft.risk === null) {
    throw new Error('a new feature needs a kind and a risk before it can be built')
  }
  return {
    valueType: 'boolean',
    description: draft.description.trim(),
    defaultVariantKey: 'on',
    variants: [
      { key: 'off', value: false },
      { key: 'on', value: true },
    ],
    rules: [],
    metadata: { polarity: draft.kind, criticality: draft.risk },
  }
}

/**
 * What the lifecycle audit records for this creation.
 *
 * Every write to this control plane carries a non-blank reason (the RPC rejects an empty one), and
 * the sentence names the SURFACE — same rule and same shape as `flag-switch.tsx`'s `reasonFor`, so
 * an incident responder reading `flag_lifecycle_audit` can tell a console creation from a catalog
 * sync without joining anything.
 */
export function newFeatureReason(key: string): string {
  return `Created ${key} from the features list.`
}

/**
 * What the review step says the feature will do on the day it is created.
 *
 * Stated as a SENTENCE rather than a field, because "it exists but is switched on nowhere" is the
 * thing a reader most reliably gets wrong about this control plane — a definition is not an
 * activation, and creating one changes nothing for anybody until somebody turns it on somewhere.
 *
 * It says the SECOND half too ("and when you do, everyone there gets it"), because a control that
 * only says what it will not do leaves the reader to guess at the part that matters.
 */
export function describeNewFeatureArrival(): string {
  return (
    'Nothing is switched on yet, so nothing changes for anyone today. ' +
    'Turn it on in an environment and everyone there gets it.'
  )
}
