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
      /** What a reader is told is not currently reachable. Plain language, not a flag name. */
      gatedPart: string
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
    eyebrow: 'PRODUCT OPS',
    title: 'Make the right product better',
    description:
      'Connect strategy to what people actually do, then turn that evidence into the next thing worth making.',
    questions: [
      'What is moving our North Star?',
      'Where are people getting stuck?',
      'What did the experiment actually change?',
    ],
    capabilities: [
      { name: 'North Star + inputs', detail: 'Keep the product pointed at value.', icon: 'star' },
      { name: 'Journeys + TARS', detail: 'See how people move through the product.', icon: 'map-pin' },
      { name: 'Signals', detail: 'Turn behaviour into evidence you can act on.', icon: 'gauge' },
      { name: 'Experiments', detail: 'Compare what changed against what mattered.', icon: 'flask' },
    ],
    availability: { kind: 'shipped' },
  },
  {
    id: 'dev',
    tab: 'DevOps',
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
    availability: { kind: 'shipped' },
  },
  {
    id: 'sec',
    tab: 'SecOps',
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
      gatedPart: 'Running a drill is switched off in this deployment',
    },
  },
  {
    id: 'fin',
    tab: 'FinOps',
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
        name: 'Provider-normalised usage',
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

/** The live positions of every gate any surface names. Supplied by the caller, from `lib/flags`. */
export interface OpsGateReadings {
  resilienceScenariosEnabled: boolean
  securitySimulationsEnabled: boolean
}

export type SurfaceStatus =
  { status: 'live' } | { status: 'gated'; note: string } | { status: 'next'; note: string }

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
      const allOn = gates.resilienceScenariosEnabled && gates.securitySimulationsEnabled
      return allOn ? { status: 'live' } : { status: 'gated', note: surface.availability.gatedPart }
    }
  }
}

export function getSurface(id: OpsSurface['id']): OpsSurface {
  const surface = MAKER_OPS_SURFACES.find((s) => s.id === id)
  if (!surface) throw new Error(`Unknown ops surface id: ${id}`)
  return surface
}
