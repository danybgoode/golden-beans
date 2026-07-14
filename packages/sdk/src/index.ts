// Golden Beans Growth Engine — TS SDK.
// Story 1.2 (Roadmap/01-growth-engine/growth-engine-v1/sprint-1.md): `track` + `trackAdoption`,
// auto-appending the configured userId, returning an extensible envelope — never a bare boolean —
// so v2 fault injection (delay_ms, force_error_code) can extend TrackResult without a breaking
// change to callers that already just check `.ok`.

export interface TrackEventProps {
  featureId?: string
  tags?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type TrackResult =
  | { ok: true; id: string }
  | { ok: false; error: string; code?: string; issues?: unknown }

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

  return {
    track,
    trackAdoption: (featureKey, props) => track('feature_adopted', { ...props, featureId: featureKey }),
  }
}
