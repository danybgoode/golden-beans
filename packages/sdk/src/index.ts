// Golden Beans Growth Engine — TS SDK.
// Story 1.2 (Roadmap/01-growth-engine/growth-engine-v1/sprint-1.md): `track` + `trackAdoption`,
// auto-appending the configured userId, returning an extensible envelope — never a bare boolean —
// so v2 fault injection (delay_ms, force_error_code) can extend TrackResult without a breaking
// change to callers that already just check `.ok`.

import { resolveVariant, type BucketVariant } from './bucketing'

export type { BucketVariant } from './bucketing'

export interface TrackEventProps {
  featureId?: string
  tags?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type TrackResult =
  | { ok: true; id: string }
  | { ok: false; error: string; code?: string; issues?: unknown }

// Sprint 2, Story 2.1: a feature registry entry pushed from the client's own live
// flag rows (e.g. Miyagi's `platform_flags`). targetEvent/adoptedEvent/retainedEvent
// are optional — see Roadmap/01-growth-engine/growth-engine-v1/sprint-2.md.
export interface FeatureSyncEntry {
  key: string
  enabled: boolean
  targetEvent?: string
  adoptedEvent?: string
  retainedEvent?: string
  retentionDays?: number
  description?: string
}

export type SyncResult =
  | { ok: true; synced: number }
  | { ok: false; error: string; code?: string; issues?: unknown }

// Sprint 4, Story 4.1 (Roadmap/01-growth-engine/growth-engine-v1/sprint-4.md): deterministic
// client-side bucketing — same envelope shape as TrackResult/SyncResult (never a bare string), so
// v2 can extend it (e.g. a `reason` field) without a breaking change to callers.
export type BucketResult =
  | { ok: true; variant: string }
  | { ok: false; error: string; code?: string }

export interface GrowthEngineClientConfig {
  /** e.g. "https://growth.example.com" or "http://localhost:3000" for local dev. */
  baseUrl: string
  /** The project's per-project API key (Bearer token) — see Roadmap 01-growth-engine's Story 1.1. */
  apiKey: string
  /** The acting user's id, auto-appended to every event this client sends. */
  userId: string
  /** Override for testing; defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

export interface GrowthEngineClient {
  track(event: string, props?: TrackEventProps): Promise<TrackResult>
  trackAdoption(featureKey: string, props?: Omit<TrackEventProps, 'featureId'>): Promise<TrackResult>
  syncFeatures(features: FeatureSyncEntry[]): Promise<SyncResult>
  /**
   * Deterministically resolves the configured userId into a variant for `experimentKey`, given
   * the caller's own variant list. Synchronous — no network call, no resolve endpoint (Story 4.1).
   */
  bucket(experimentKey: string, variants: BucketVariant[]): BucketResult
  /**
   * Fires an exposure event for a bucketed variant — the denominator for variant comparison
   * (Story 4.2). Thin wrapper around track(), same as trackAdoption(): 'experiment_exposed' with
   * `featureId` set to the experiment key and the variant carried in `tags.variant`.
   */
  trackExposure(
    experimentKey: string,
    variant: string,
    props?: Omit<TrackEventProps, 'featureId'>
  ): Promise<TrackResult>
}

/**
 * const growth = createGrowthEngineClient({ baseUrl, apiKey, userId })
 * await growth.track('signup')
 */
export function createGrowthEngineClient(config: GrowthEngineClientConfig): GrowthEngineClient {
  const fetchFn = config.fetchImpl ?? fetch

  async function track(event: string, props: TrackEventProps = {}): Promise<TrackResult> {
    let res: Response
    try {
      res = await fetchFn(`${config.baseUrl}/api/v1/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ userId: config.userId, event, ...props }),
      })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown network error', code: 'NETWORK_ERROR' }
    }

    const body = await res.json().catch(() => null)
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `HTTP ${res.status}`, code: String(res.status), issues: body?.issues }
    }
    return { ok: true, id: body.id }
  }

  async function syncFeatures(features: FeatureSyncEntry[]): Promise<SyncResult> {
    let res: Response
    try {
      res = await fetchFn(`${config.baseUrl}/api/v1/features/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ features }),
      })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown network error', code: 'NETWORK_ERROR' }
    }

    const body = await res.json().catch(() => null)
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `HTTP ${res.status}`, code: String(res.status), issues: body?.issues }
    }
    return { ok: true, synced: body.synced }
  }

  function bucket(experimentKey: string, variants: BucketVariant[]): BucketResult {
    const variant = resolveVariant(config.userId, experimentKey, variants)
    if (variant === null) {
      return { ok: false, error: 'No valid variants provided', code: 'INVALID_VARIANTS' }
    }
    return { ok: true, variant }
  }

  return {
    track,
    trackAdoption: (featureKey, props) => track('feature_adopted', { ...props, featureId: featureKey }),
    syncFeatures,
    bucket,
    trackExposure: (experimentKey, variant, props) =>
      track('experiment_exposed', { ...props, featureId: experimentKey, tags: { ...props?.tags, variant } }),
  }
}
