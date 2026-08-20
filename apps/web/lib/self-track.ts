import 'server-only'
import { createGrowthEngineClient } from '@golden-frijoles/sdk'
import { getSiteUrl } from './site-url'

// Story 3.1 (commercial-shell/sprint-3.md) — the landing dogfoods the engine: Golden Frijoles is its
// OWN tenant (a THIRD project, separate from the marketing demo and from Miyagi), and its
// visitor→waitlist funnel is measured by the engine itself, through the real customer-facing SDK
// (AGENTS.md rule #1 — no parallel telemetry pipeline, no direct events insert from app code).
//
// This helper is the one seam that fires those two funnel events. It is deliberately total: it
// NEVER throws into a request path and NEVER breaks the page/route if it can't send. CI's
// `typecheck-build` job runs `npm run build` with zero Supabase/tracking env vars, and the `e2e`
// job may not have this new project seeded — so an unset key or a failed call must degrade to a
// clean no-op, not a 500 on the landing or the waitlist route.

import { EVENT_FEATURE, type SelfTrackEvent } from './self-track-events'

// Re-exported so every existing caller keeps importing the vocabulary from here — the split is an
// implementation detail of making the constants testable, not a new seam for callers to learn.
export {
  LANDING_VISITED_EVENT,
  WAITLIST_JOINED_EVENT,
  SIGNUP_STARTED_EVENT,
  ACCOUNT_CONFIRMED_EVENT,
  FIRST_EVENT_INGESTED_EVENT,
  REPORT_VIEWED_EVENT,
  SHARE_VIEWED_EVENT,
  METHODOLOGY_VISITED_EVENT,
  METHODOLOGY_CHAPTER_OPENED_EVENT,
  WAITLIST_SIGNAL_KEY,
  ACTIVATION_SIGNAL_KEY,
  HUB_ENGAGEMENT_SIGNAL_KEY,
  METHODOLOGY_SIGNAL_KEY,
  type SelfTrackEvent,
} from './self-track-events'

// The self tenant's slug — a SEPARATE project from DEMO_PROJECT_SLUG (public-demo.ts). Named after
// SITE_URL's / DEMO_PROJECT_SLUG's env-override pattern. Nothing here reads or writes the demo
// project; the tenant is chosen entirely by SELF_PROJECT_API_KEY, resolved server-side from the
// Authorization header (lib/auth.ts) — so events physically cannot land against another project.
export const SELF_PROJECT_SLUG = process.env.SELF_PROJECT_SLUG?.trim() || 'golden-beans'

// The per-visitor identity cookie. A visit (Server Components can't set cookies, so the visited
// beacon is a Route Handler — see app/api/v1/public/self-visit/route.ts) mints/returns this id;
// the waitlist route reads the SAME cookie on the client's later join, so one visitor's visit and
// conversion count as the same user progressing through the funnel (TARS counts DISTINCT users per
// event — lib/tars.ts), not two disconnected anonymous events.
export const VISITOR_COOKIE = 'gb_vid'

function selfApiKey(): string | undefined {
  return process.env.SELF_PROJECT_API_KEY?.trim() || undefined
}

/** Whether self-tracking is wired (a key is present). Callers use this only to decide whether to
 *  bother minting a visitor id — never to gate correctness; trackSelfEvent no-ops safely anyway. */
export function isSelfTrackingConfigured(): boolean {
  return !!selfApiKey()
}

// A cross-review catch (commercial-shell Sprint 3 PR): the SDK's own fetch has no timeout, so a
// slow/hung self-call could otherwise hold this promise open indefinitely. Callers already run
// this via `after()` (never inline-awaited before a response), but a bounded timeout here is
// cheap, load-bearing defense-in-depth against a genuinely hung request.
const TRACK_TIMEOUT_MS = 3000

function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(TRACK_TIMEOUT_MS) })
}

// Fire one funnel event for `userId` through the REAL SDK (POST /api/v1/track, Bearer=self key).
// Total by construction: no key -> no-op; the SDK returns {ok:false} on any HTTP/network error (it
// never throws) and we swallow+log; the surrounding try/catch is belt-and-suspenders for anything
// unexpected (including an AbortSignal.timeout() abort). Returns nothing meaningful — callers must
// not branch on success in the request path.
//
// Callers must invoke this via `next/server`'s `after()`, never inline-`await`ed before building a
// response — a cross-review catch: the SDK call is a real network round-trip (this app calling its
// own public URL), and awaiting it directly in a route handler would delay that route's response
// (and, for self-visit specifically, delay delivering the Set-Cookie the waitlist route depends on
// for a shared visitor identity) by however long the call takes, timeout included.
// Returns whether the event actually LANDED. Callers that use the send as a one-shot state
// transition (the ingest route stamping projects.first_event_at) must branch on this: committing
// the "already sent" marker on a send that silently failed loses that funnel stage permanently,
// because no later event ever retries it (cross-review, Codex 2026-07-20).
export async function trackSelfEvent(
  event: SelfTrackEvent,
  userId: string,
  /**
   * Optional non-identifying detail, e.g. which chapter was opened (Story 4.1).
   *
   * Deliberately `tags` and not `metadata`: tags are the dimension the query layer can group by,
   * which is the whole reason to carry the chapter at all. Callers must pass only values that are
   * already public route segments — the story's rule is "an id and a route segment", never PII and
   * never the chapter's CONTENT, and nothing here would stop a caller ignoring that, so the check
   * lives at the call site where the value is chosen.
   */
  tags?: Record<string, string>
): Promise<boolean> {
  const apiKey = selfApiKey()
  if (!apiKey) return false // unset in CI/local-without-config — dogfooding is a prod-config concern

  try {
    const engine = createGrowthEngineClient({
      baseUrl: getSiteUrl(),
      apiKey,
      userId,
      fetchImpl: timeoutFetch,
    })
    // featureId is REQUIRED for this event to appear in any funnel — see EVENT_FEATURE above.
    const result = await engine.track(event, {
      featureId: EVENT_FEATURE[event],
      ...(tags ? { tags } : {}),
    })
    if (!result.ok) {
      console.warn(`[self-track] ${event} for ${userId} did not land: ${result.error}`)
      return false
    }
    return true
  } catch (err) {
    // Should be unreachable (the SDK catches its own network errors), but the request path must
    // survive even a programming/config error here — log, never rethrow.
    console.warn(`[self-track] ${event} threw unexpectedly:`, err)
    return false
  }
}
