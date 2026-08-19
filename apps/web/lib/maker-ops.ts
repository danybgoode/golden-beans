import type { IconName } from '@/components/ui/Icon'

// landing-maker-ops · Sprint 1, Story 1.3 — the four operating surfaces, as data.
//
// ── Why this is a module and not four blocks of JSX ───────────────────────────────────────────
// The Ops panel shows one surface at a time out of four with identical structure. Written inline
// that is four near-copies of the same markup, and the fourth one drifts — a different heading
// level, a missing badge, a capability list that grew a fifth item nobody styled. One shape, one
// renderer, four rows.
//
// ── Why STATUS is not in the data ─────────────────────────────────────────────────────────────
// CODE-QUALITY #2 and #9, and this repo has paid for both. A landing section stating a flag
// position it does not read goes stale the moment someone flips the flag, and the page then makes
// a checkable claim that is false — the worst kind, because it is the kind a reader can verify.
//
// So a surface declares its `availability` — what KIND of thing it is — and the position is
// resolved at render time from the live gates by `resolveSurfaceStatus` below:
//
//   • 'shipped'  — serving, no gate qualifies it.
//   • 'gated'    — built, but part of it sits behind named flags. Says WHICH part, and reads them.
//   • 'unbuilt'  — does not exist. Cannot be made 'live' by editing this file, because there is no
//                  flag to read; the type has no field that would let a string say otherwise.
//
// That last one is the structural half of epic D4. The obvious mistake for a future contributor is
// to flip FinOps to "live" in a hurry when the first cost dashboard ships; they will have to add an
// `availability: 'gated'` with a real gate to do it, which is exactly the moment to notice the
// claim needs a flag behind it.

export type SurfaceAvailability =
  | { kind: 'shipped' }
  | {
      kind: 'gated'
      /** The env-var names, for the doc comment and for a reviewer to grep. Not read at runtime. */
      gates: readonly string[]
    }
  | { kind: 'unbuilt' }

export interface OpsCapability {
  name: string
  detail: string
  icon: IconName
}

export interface OpsSurface {
  id: 'product' | 'dev' | 'sec' | 'fin'
  /** Tab label. */
  tab: string
  /**
   * The three-or-four-word contents line, as it appears on the hero's kraft bag label.
   *
   * It lives HERE rather than in the hero because the bag and the Ops panel are two views of one
   * list, and they were briefly two hand-written lists instead. That cost three review findings in
   * a row — the same "a gated capability is listed unqualified" defect, found once per surface,
   * because fixing it in one list never reached the other. One source, and a row cannot be
   * qualified in one place and bare in the other.
   */
  bagContents: string
  eyebrow: string
  /**
   * Renders as an `<h3>`. No terminal full stop — headings are titles, not sentences (the D7 rule
   * `scripts/check-design-drift.mjs` enforces on literals). The guard cannot see through this
   * indirection, so `maker-ops.test.ts` asserts it here instead of trusting that it cannot happen.
   */
  title: string
  description: string
  /** The questions this surface answers, in the reader's words, not the product's. */
  questions: readonly string[]
  capabilities: readonly OpsCapability[]
  availability: SurfaceAvailability
}

export const MAKER_OPS_SURFACES: readonly OpsSurface[] = [
  {
    id: 'product',
    tab: 'Product Ops',
    bagContents: 'North Star · signals · experiments',
    eyebrow: 'PRODUCT OPS',
    title: 'Make the right product better',
    description:
      'Stop guessing what to build next. Connect the goal to what people actually do, and let the evidence pick the next thing worth making.',
    questions: [
      'What is moving our North Star?',
      'Where are people getting stuck?',
      'What did the experiment actually change?',
    ],
    capabilities: [
      { name: 'North Star + inputs', detail: 'Keep the product pointed at value.', icon: 'star' },
      { name: 'Journeys + TARS', detail: 'See how people move through the product.', icon: 'map-pin' },
      { name: 'Signals', detail: 'Turn behavior into evidence you can act on.', icon: 'gauge' },
      { name: 'Experiments', detail: 'Compare what changed against what mattered.', icon: 'flask' },
    ],
    availability: { kind: 'shipped' },
  },
  {
    id: 'dev',
    tab: 'DevOps',
    bagContents: 'flags · rollouts · operations',
    eyebrow: 'DEVOPS',
    title: 'Keep shipping without losing control',
    description:
      'Move quickly with release rails that make change observable, reversible and operable by humans and agents.',
    questions: [
      'What can ship behind a flag?',
      'What happens if this dependency fails?',
      'Can we stop or reverse the change safely?',
    ],
    capabilities: [
      { name: 'Feature flags', detail: 'Decouple deployment from exposure.', icon: 'flag' },
      { name: 'Rollout rules', detail: 'Change who sees what, deliberately.', icon: 'settings' },
      {
        name: 'Destinations + replay',
        detail: 'Keep events moving, and recover the ones that failed.',
        icon: 'cable',
      },
      { name: 'Circuit breakers', detail: 'Stop damage without stopping work.', icon: 'warning-triangle' },
    ],
    // Flags and rollouts are unconditionally live; SCHEDULED DELIVERY to a destination rides
    // `DESTINATION_DELIVERY_ENABLED`, which is born OFF. Listing "destinations + replay" beside three
    // shipped capabilities with no qualification states a capability as live without reading its
    // flag — CODE-QUALITY #9, and the same defect the SecOps surface was already built to avoid.
    // Caught by Codex in cross-family review round 3 of PR #100.
    availability: {
      kind: 'gated',
      gates: ['DESTINATION_DELIVERY_ENABLED'],
    },
  },
  {
    id: 'sec',
    tab: 'SecOps',
    bagContents: 'scenarios · guardrails · evidence',
    eyebrow: 'SECOPS',
    title: 'Find the weak point before reality does',
    description:
      'Exercise security and resilience as part of operating the product, with bounded scenarios and evidence of what protected you.',
    questions: [
      'What are we claiming is protected?',
      'Where must autonomous action stop?',
      'What evidence proves the control held?',
    ],
    capabilities: [
      { name: 'Security scenarios', detail: 'Exercise consequential paths deliberately.', icon: 'shield' },
      { name: 'Resilience drills', detail: 'Test failure without waiting for failure.', icon: 'refresh' },
      { name: 'Guardrails', detail: 'Make the boundaries of autonomy executable.', icon: 'lock' },
      { name: 'Evidence trail', detail: 'Keep the result inspectable afterwards.', icon: 'book' },
    ],
    // Built and deployed, both gates OFF in production — verified 2026-08-19 by exercising the
    // behaviour, not by reading a listing: `GET /api/v1/scenarios/snapshot` answers 404 while
    // `POST` to the same path answers 405. A 405 means the route is deployed; only the gate turns
    // the GET into a 404 rather than the 401 an unauthenticated call would otherwise get.
    availability: {
      kind: 'gated',
      gates: ['RESILIENCE_SCENARIOS_ENABLED', 'SECURITY_SIMULATIONS_ENABLED'],
    },
  },
  {
    id: 'fin',
    tab: 'FinOps',
    bagContents: 'tokens · cost · value',
    eyebrow: 'FINOPS',
    title: 'Spend intelligence where it creates value',
    description:
      'Attribute token consumption across providers, agents and workflows, then connect that cost to the Bet and the North Star movement it was meant to create.',
    questions: [
      'What is this agent workflow costing us?',
      'What useful outcome did those tokens produce?',
      'Is more spend justified by expected value?',
    ],
    capabilities: [
      {
        name: 'Provider-normalized usage',
        detail: 'Input, output, cache, retry and model mix.',
        icon: 'binary',
      },
      {
        name: 'Agent + workflow attribution',
        detail: 'Know exactly what generated the spend.',
        icon: 'group',
      },
      {
        name: 'Budgets + appetite',
        detail: 'Alert, rate-limit or stop at a boundary you set.',
        icon: 'warning',
      },
      {
        name: 'Value-linked unit economics',
        detail: 'Cost per workflow, transaction or outcome.',
        icon: 'trend-up',
      },
    ],
    availability: { kind: 'unbuilt' },
  },
]

/**
 * Just the two scenario gates.
 *
 * Narrower than `OpsGateReadings` on purpose: `gatedDrillNote` is about drills and nothing else, and
 * `AuthoritySection` calls it while having no business knowing whether destination delivery is on.
 * A helper that demands the whole readings object forces every caller to source flags it does not
 * use — which is how an unrelated gate ends up read (and then rendered) in the wrong component.
 */
export type DrillGateReadings = Pick<
  OpsGateReadings,
  'resilienceScenariosEnabled' | 'securitySimulationsEnabled'
>

/** The live positions of every gate any surface names. Supplied by the caller, from `lib/flags`. */
export interface OpsGateReadings {
  resilienceScenariosEnabled: boolean
  securitySimulationsEnabled: boolean
  destinationDeliveryEnabled: boolean
}

export type SurfaceStatus =
  { status: 'live' } | { status: 'gated'; note: string } | { status: 'next'; note: string }

/**
 * Which drills a reader cannot start right now, in plain language. Empty string = all of them can.
 *
 * ── Why this is computed per gate, and not one fixed sentence ────────────────────────────────
 * The first version carried a constant — "Running a drill is switched off in this deployment" —
 * rendered whenever `resilience && security` was false. That sentence is TRUE today (both gates are
 * off in production) and becomes FALSE the moment either one opens on its own: the page would tell
 * a reader that nothing can run while a resilience drill happily runs.
 *
 * A claim that is only accurate in the state it was written in is exactly what CODE-QUALITY #2 and
 * #9 forbid, and this module exists so that no status is written down. Computing the badge
 * correctly while hardcoding the sentence beside it is the same defect wearing a smaller hat.
 * Caught by Codex in cross-family review of PR #100.
 */
export function gatedDrillNote(gates: DrillGateReadings): string {
  const off: string[] = []
  if (!gates.resilienceScenariosEnabled) off.push('resilience drills')
  if (!gates.securitySimulationsEnabled) off.push('security scenarios')

  if (off.length === 0) return ''
  return `Starting ${off.join(' or ')} is switched off in this deployment`
}

/**
 * The qualification a GATED surface currently needs, or '' when nothing about it is switched off.
 *
 * Keyed by the gate names the surface itself declares, so adding a gated capability means naming
 * its flag in the data — not remembering to come here. A surface naming a gate this function does
 * not know about throws rather than silently rendering as fully live: a missing case in a status
 * resolver fails in the direction of over-claiming, which is the direction that matters.
 */
/**
 * Every gate a surface may name, PAIRED WITH the sentence that describes it being off.
 *
 * The allow-list and the handlers are one structure, not two that currently agree. As a bare list
 * of names it was possible to add a gate, use it on a surface, forget the branch that describes it,
 * and ship — the validation would pass (the name is listed) and the surface would render as fully
 * LIVE with its gate closed. That is the same failure the whole module exists to prevent, one level
 * up. Found by Mistral Vibe in round 9 of PR #100.
 *
 * A handler returns its sentence when the gate is closed, or '' when it is open. Adding a gate here
 * without a handler is now a type error rather than a silent over-claim (CODE-QUALITY #2 — make the
 * failure unrepresentable, not merely caught).
 */
const GATE_NOTES: Record<string, (gates: OpsGateReadings) => string> = {
  DESTINATION_DELIVERY_ENABLED: (gates) =>
    gates.destinationDeliveryEnabled
      ? ''
      : 'Scheduled delivery to a destination is switched off in this deployment',
  // Both scenario gates share one sentence, because they describe one activity to a reader and the
  // sentence names whichever halves are actually closed.
  RESILIENCE_SCENARIOS_ENABLED: (gates) => gatedDrillNote(gates),
  SECURITY_SIMULATIONS_ENABLED: (gates) => gatedDrillNote(gates),
}

function gatedNoteFor(surface: OpsSurface, gates: OpsGateReadings): string {
  if (surface.availability.kind !== 'gated') return ''

  const named = surface.availability.gates

  // ── Validate FIRST, resolve second ──────────────────────────────────────────────────────────
  // This check used to sit at the BOTTOM, after the per-gate branches, which made it unreachable
  // in exactly the case it exists for: a surface naming ['RESILIENCE_SCENARIOS_ENABLED',
  // 'SOME_NEW_GATE'] matched the drill branch, returned the drill note and never validated. A
  // newly-gated capability would then render under a sentence that says nothing about it — or as
  // fully live. The comment promised fail-closed and the control flow did not deliver it, which is
  // the same "prose asserts a property the code lacks" defect this epic has now hit three times.
  // Caught by Codex in round 8 of PR #100.
  const unknown = named.filter((gate) => !(gate in GATE_NOTES))
  if (unknown.length > 0) {
    throw new Error(
      `No note is defined for gate(s): ${unknown.join(', ')}. Add one to GATE_NOTES before ` +
        'shipping a surface that names it — a gated capability with no sentence renders as live.'
    )
  }

  // First closed gate wins. Deduplicated because the two scenario gates share a sentence and a
  // surface naming both must not say it twice.
  const notes = [...new Set(named.map((gate) => GATE_NOTES[gate](gates)).filter((note) => note !== ''))]
  return notes.join(' · ')
}

/**
 * What this surface's badge says right now.
 *
 * Pure, and takes the readings as an argument rather than importing `lib/flags` — so a spec can
 * assert every branch without setting environment variables, which is the difference between a
 * test that checks the logic and a test that checks `process.env`.
 *
 * A 'gated' surface only reports gated while a gate it names is actually off. Flip both on and the
 * badge disappears by itself, with no edit here and none in the component.
 */
export function resolveSurfaceStatus(surface: OpsSurface, gates: OpsGateReadings): SurfaceStatus {
  switch (surface.availability.kind) {
    case 'shipped':
      return { status: 'live' }
    case 'unbuilt':
      return { status: 'next', note: 'Next build — not a shipped capability' }
    case 'gated': {
      const note = gatedNoteFor(surface, gates)
      return note === '' ? { status: 'live' } : { status: 'gated', note }
    }
  }
}

/**
 * The badge text for a resolved status — ONE label per state, for every view that shows it.
 *
 * Three surfaces render this: the hero's bag label, the Ops tab, and the Ops panel. They drifted
 * immediately — the bag said "Next" while the panel said "Next build", and the tab showed nothing
 * at all for a gated surface, so a reader scanning the tabs saw no qualification until they opened
 * the panel. Same root cause as the bag rows: several views deciding independently how to say one
 * thing. This is the third time in this epic, so it gets the same treatment as the second — one
 * function, no room for a fourth opinion.
 *
 * Returns null for a live surface: nothing to qualify, and a badge on every row is decoration that
 * empties the badge of meaning for the rows that need it.
 */
// Both qualified states render through `Badge status="next"` — the amber treatment — and that is
// deliberate rather than a shortcut. `Badge` speaks live/next/blocked; `blocked` is red and means
// "this is broken", which is wrong for a capability that is merely unbuilt or switched off. So the
// COLOUR says "not fully available" for both and the TEXT carries the distinction, which is the
// same division of labour the honesty badges have used since the design system landed. Raised by
// Mistral Vibe in round 7 of PR #100 and answered here rather than by adding a fourth badge status.
export function surfaceBadgeLabel(status: SurfaceStatus['status']): string | null {
  switch (status) {
    case 'live':
      return null
    case 'next':
      return 'Next build'
    case 'gated':
      return 'Partly gated'
  }
}

export function getSurface(id: OpsSurface['id']): OpsSurface {
  const surface = MAKER_OPS_SURFACES.find((s) => s.id === id)
  if (!surface) throw new Error(`Unknown ops surface id: ${id}`)
  return surface
}
