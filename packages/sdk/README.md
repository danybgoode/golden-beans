# @golden-frijoles/sdk

The framework-agnostic client for Golden Frijoles telemetry, governed experiment assignment, and
typed local feature-flag evaluation.

## Install

```bash
npm install @golden-frijoles/sdk
```

## 0.6.0 — experiments report their own exposures

**Additive only; nothing existing changes.** An experiment started from the Golden Frijoles
experiment builder names itself in the flag version it serves, so your app no longer hard-codes an
experiment key or version. Wire this ONCE, beside the flag check you already have:

```ts
import { experimentForResolution } from '@golden-frijoles/sdk'

const context = { targetingKey: merchant.id, region: merchant.country, channel: 'web' }
const details = flags.resolveBooleanEvaluation('growth.founding_merchants_enabled', false, context)

await growth.trackFlagEvaluation({
  flagKey: 'growth.founding_merchants_enabled',
  flagVersion: details.flagVersion!,
  variant: details.variant!,
  reason: details.reason,
  snapshotVersion,
  environment: 'production',
  subject: { type: 'merchant', id: merchant.id },          // the SAME id as targetingKey
  segments: { region: merchant.country, channel: 'web' },  // the SAME values as the context
  experiment: experimentForResolution(details),            // undefined unless it is an exposure
})
```

- `details.rulePriority` is new: the rule that served this value (only on `TARGETING_MATCH`).
- `experimentForResolution(details)` returns `{ key, definitionVersion }` only when the person was
  served by one of the experiment's own rules. People held out of the test fall through and get
  `undefined`, so they are recorded as an ordinary `flag_evaluated` and never counted in the test.
- `segments` copies the evaluation context's `source · channel · campaign · plan · region` into the
  event's tags. An experiment's eligibility conditions and its breakdowns are read from the
  exposure's tags; without them every exposure of an experiment with a condition is rejected.
- `subject.id` and `targetingKey` must be the same identifier, or one person can be bucketed as two.

A caller that keeps passing `experiment` by hand, with no `segments`, sends exactly the bytes 0.5.0
sent. A pre-1.0 caret does not pick this up automatically; move to `^0.6.0`.

## 0.5.0 — the command core, for the CLI and the MCP tools

**Additive only; nothing existing changes.** 0.5.0 exports the shared, pure command core that
`@golden-frijoles/cli` and the connector's flag write tools both call — `planFlagCreate`,
`planFlagSet`, `planFlagRollout`, `planFlagRules`, `planFlagKill`, `ON_VARIANT_KEY` /
`OFF_VARIANT_KEY` — plus `diffFlagDefinitions` and the percent ↔ basis-points helpers the console
already used. One implementation, so the CLI verb and the MCP tool cannot disagree about what a
flag change means.

A pre-1.0 caret (`^0.4.0`) does not pick this up automatically; move to `^0.5.0` to use them.

## 0.4.0 identity change

The package rename and the OpenFeature provider rename ship together as a breaking pre-1.0 minor
release. `createFlagProvider().metadata.name` is now `golden-frijoles`, and
`createScenarioProvider().metadata.name` is now `golden-frijoles-scenarios`. Consumers that assert
provider identity must update those expectations when moving to `@golden-frijoles/sdk@0.4.0`.

The `GOLDEN_BEANS_FLAG_READ_KEY` and `GOLDEN_BEANS_FLAG_SYNC_KEY` names below are deliberately
retained integration addresses used by existing consumers. They are caller-owned environment
variable names, not SDK lookups or provider identities; renaming them is not required to adopt 0.4.0.

## Environment variable names for a NEW project

This SDK reads **no** environment variable — `createFlagProvider` takes `flagReadKey` as an
argument, and every name in this document is one the *caller* chose. That is why the legacy names
above stay valid: nothing in shipped code resolves either of them.

For a new project, `@golden-frijoles/cli` writes **`GOLDEN_FRIJOLES_URL`**,
**`GOLDEN_FRIJOLES_FLAG_READ_KEY`** and **`GOLDEN_FRIJOLES_ENVIRONMENT`** into `.env.local` and
prints the snippet that reads exactly those names, so the file and its reader are generated
together:

```bash
npx @golden-frijoles/cli init
```

Either set of names works. Pick one per project.

## Telemetry

```ts
import { createGrowthEngineClient } from '@golden-frijoles/sdk'

const growth = createGrowthEngineClient({
  baseUrl: process.env.GROWTH_ENGINE_URL!,
  apiKey: process.env.GROWTH_ENGINE_API_KEY!,
  userId: 'opaque-user-id',
})

await growth.track('checkout_completed', { featureId: 'checkout' })
```

## Server-side flag provider

Keep a project/environment-scoped `flag_read` key in server-only configuration. The provider
fetches a versioned snapshot in the background; request-path resolution stays synchronous and
uses a safe caller-supplied default if no fresh snapshot is available.

```ts
import { createFlagProvider } from '@golden-frijoles/sdk'

const flags = createFlagProvider({
  baseUrl: process.env.GROWTH_ENGINE_URL!,
  flagReadKey: process.env.GOLDEN_BEANS_FLAG_READ_KEY!,
  environment: 'production',
})

await flags.initialize()
const checkoutEnabled = flags.resolveBooleanEvaluation('checkout.enabled', false, {
  targetingKey: 'opaque-subject-id',
}).value
```

Do not expose `flagReadKey` or telemetry API keys to browser bundles. Golden Frijoles derives tenant
and environment from the credential; callers never send either in a snapshot request.

## Server-side flag-definition catalog sync

Applications declare their typed catalog in source control, then an explicit operator/deployment
command registers new definitions with Golden. This is not a build side effect and does not affect
runtime flag evaluation. Use a dedicated, revocable `flag_sync` credential — never an ingest or
`flag_read` key — and keep it server-side.

```ts
import { createFlagDefinitionSyncClient, type FlagDefinitionSyncEntry } from '@golden-frijoles/sdk'

const catalog: FlagDefinitionSyncEntry[] = [
  {
    key: 'checkout.enabled',
    definition: {
      valueType: 'boolean',
      description: 'Enables the checkout fixture.',
      defaultVariantKey: 'off',
      variants: [{ key: 'off', value: false }, { key: 'on', value: true }],
      rules: [],
    },
  },
]

const sync = createFlagDefinitionSyncClient({
  baseUrl: process.env.GROWTH_ENGINE_URL!,
  flagSyncKey: process.env.GOLDEN_BEANS_FLAG_SYNC_KEY!,
})
const result = await sync.syncFlagDefinitions(catalog)

if (!result.ok) throw new Error(`${result.kind}: ${result.error}`)
```

The v1 request is bounded to 100 definitions and a 4 MiB JSON body. A new key creates immutable
version 1; an identical definition returns `created: false`; semantic drift is an HTTP `409` for an
owner to resolve through the normal version lifecycle. Sync never activates, deactivates or deletes
a flag.

## Bounded scenario provider

Scenario evaluation is also synchronous and local. It returns only the closed `none`, capped
`delay`, or allow-listed synthetic-error payload. Evaluation does not execute the payload: the
application must apply it at an explicitly instrumented server seam.

```ts
import { createScenarioProvider } from '@golden-frijoles/sdk'

const scenarios = createScenarioProvider({
  baseUrl: process.env.GROWTH_ENGINE_URL!,
  flagReadKey: process.env.GOLDEN_BEANS_FLAG_READ_KEY!,
  environment: 'production',
})

await scenarios.initialize()
const resolution = scenarios.resolveScenario('miyagi.internal.probe', {
  targetingKey: 'synthetic:readiness-check',
})

if (resolution.runId && resolution.runRevision) {
  const reservation = await scenarios.reserveExecution(resolution.runId, resolution.runRevision)
  if (reservation.ok && reservation.admitted) {
    let succeeded = false
    try {
      // Apply the closed resolution.value at this one instrumented target seam.
      succeeded = true
    } finally {
      await scenarios.settleExecution(resolution.runId, reservation.leaseId, succeeded)
    }
  }
}
```

After the target reserves and settles a server-issued execution lease, record the canonical
assignment/exposure and execution fact together:

```ts
const entry = scenarios.getSnapshot()?.scenarios.find(
  (candidate) => candidate.runId === resolution.runId,
)
if (!entry || !resolution.runId || !resolution.scenarioKey || !resolution.variant) {
  throw new Error('No active scenario execution')
}

await growth.trackScenarioExecution({
  scenarioKey: resolution.scenarioKey,
  scenarioVersion: resolution.scenarioVersion!,
  runId: resolution.runId,
  runRevision: resolution.runRevision!,
  leaseId: reservedLeaseId,
  targetKey: 'miyagi.internal.probe',
  cohort: resolution.cohort!,
  environment: 'production',
  arm: resolution.value.kind === 'none' ? 'control' : 'fault',
  faultKind: resolution.value.kind,
  failed: false,
  latencyMs: 125,
  subject: { type: 'synthetic_probe', id: 'readiness-check' },
  flag: {
    key: entry.flag.key,
    definitionVersion: entry.flag.definitionVersion,
    variant: resolution.variant,
    reason: resolution.reason,
    snapshotVersion: scenarios.getSnapshot()!.revision,
  },
  experiment: entry.experiment
    ? { key: entry.experiment.key, definitionVersion: entry.experiment.definitionVersion }
    : undefined,
})
```

Never expose scenario credentials to a browser, and never interpret scenario data as arbitrary
code, URLs, headers, queries, or resource-exhaustion instructions.
