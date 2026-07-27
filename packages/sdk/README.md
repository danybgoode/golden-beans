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
