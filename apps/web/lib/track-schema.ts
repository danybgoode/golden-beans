import { z } from 'zod'

// The wire schema for POST /v1/track. `tags`/`metadata` are deliberately open
// records (not a fixed shape) — v2 friction/chaos tagging (PRD-G) is additive, never
// a breaking change to this schema (Roadmap/01-growth-engine/growth-engine-v1/sprint-1.md).
export const trackEventSchema = z.object({
  userId: z.string().min(1),
  event: z.string().min(1),
  featureId: z.string().min(1).optional(),
  tags: z.record(z.unknown()).optional().default({}),
  metadata: z.record(z.unknown()).optional().default({}),

  // event-destination-router · Story 1.1 — the versioned actor/subject context.
  //
  // `userId` above stays REQUIRED. Making it optional the moment a richer identity model arrived
  // was the tempting move and it would have been a breaking change dressed as an addition: every
  // shipped TARS funnel and A/B comparison counts DISTINCT userId, so a payload that omitted it
  // would ingest happily and then be invisible to every existing read (Roadmap/LEARNINGS.md — the
  // "honest-looking zero" failure this repo has now hit three times). Actor/subject ADD dimensions
  // alongside userId; they do not replace it until a deliberate contract version says so.
  //
  // Typed as a passthrough object here, then validated by lib/event-context.ts. The rules live
  // there rather than in zod because that module is zero-import and therefore branch-testable
  // directly — an HTTP spec can only reach the branches a well-formed request happens to walk.
  context: z.object({}).passthrough().optional(),
})

export type TrackEventInput = z.infer<typeof trackEventSchema>
