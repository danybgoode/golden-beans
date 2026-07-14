import { z } from 'zod'

// The wire schema for POST /v1/features/sync (Sprint 2, Story 2.1). A sync payload is
// literally a forwarded `platform_flags` row (key/enabled/description) plus OPTIONAL
// event-name mapping fields a caller may set for a feature it knows the shape of — see
// Roadmap/01-growth-engine/growth-engine-v1/sprint-2.md's design note. Unset mapping
// fields fall back to the sprint doc's literal Targeted/Adopted reading in lib/tars.ts.
const featureSyncEntrySchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean(),
  targetEvent: z.string().min(1).optional(),
  adoptedEvent: z.string().min(1).optional(),
  retainedEvent: z.string().min(1).optional(),
  retentionDays: z.number().int().positive().optional(),
  description: z.string().optional(),
})

export const featureSyncSchema = z.object({
  features: z.array(featureSyncEntrySchema).min(1),
})

export type FeatureSyncEntry = z.infer<typeof featureSyncEntrySchema>
export type FeatureSyncInput = z.infer<typeof featureSyncSchema>
