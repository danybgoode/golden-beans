# @golden-beans/sdk

The framework-agnostic client for Golden Beans telemetry, governed experiment assignment, and
typed local feature-flag evaluation.

## Install

```bash
npm install @golden-beans/sdk
```

## Telemetry

```ts
import { createGrowthEngineClient } from '@golden-beans/sdk'

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
import { createFlagProvider } from '@golden-beans/sdk'

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

Do not expose `flagReadKey` or telemetry API keys to browser bundles. Golden Beans derives tenant
and environment from the credential; callers never send either in a snapshot request.

## Server-side flag-definition catalog sync

Applications declare their typed catalog in source control, then an explicit operator/deployment
command registers new definitions with Golden. This is not a build side effect and does not affect
runtime flag evaluation. Use a dedicated, revocable `flag_sync` credential — never an ingest or
`flag_read` key — and keep it server-side.

```ts
import { createFlagDefinitionSyncClient, type FlagDefinitionSyncEntry } from '@golden-beans/sdk'

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
import { createScenarioProvider } from '@golden-beans/sdk'

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
