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
})

export type TrackEventInput = z.infer<typeof trackEventSchema>
