import { z } from 'zod'

// The wire schema for POST /v1/north-star/sync (Sprint 3, Story 3.1). An input's
// `sourceEvent` is required when `valueSource: 'telemetry_event'` (the value is computed
// on the fly from the events table) and must be absent for `external_push` (its values
// arrive later via POST /v1/inputs/:key/values, Story 3.3) — enforced with `.refine`
// since zod's base object schema can't express a conditional-required field.
const leadingInputSyncEntrySchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1),
    valueSource: z.enum(['telemetry_event', 'external_push']),
    sourceEvent: z.string().min(1).optional(),
  })
  .refine((input) => (input.valueSource === 'telemetry_event' ? !!input.sourceEvent : !input.sourceEvent), {
    message: "sourceEvent is required for 'telemetry_event' inputs and must be omitted for 'external_push' inputs",
    path: ['sourceEvent'],
  })

export const northStarSyncSchema = z.object({
  metric: z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
  }),
  inputs: z.array(leadingInputSyncEntrySchema).min(1),
})

export type NorthStarSyncInput = z.infer<typeof northStarSyncSchema>
export type LeadingInputSyncEntry = z.infer<typeof leadingInputSyncEntrySchema>

// The wire schema for POST /v1/inputs/:key/values (Story 3.3) — an append batch of
// daily values for an 'external_push' input. `occurredOn` is a plain YYYY-MM-DD date
// (no time-of-day — this is a daily rollup, not an event stream). The regex alone would
// accept a shape-valid but impossible calendar date (e.g. 2026-99-99) — re-checking via
// Date parsing + a round-trip back to the same string catches that (money-touching data
// deserves the stricter check, not just a shape check).
function isValidCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const inputValuesSchema = z.object({
  values: z
    .array(
      z.object({
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'occurredOn must be YYYY-MM-DD')
          .refine(isValidCalendarDate, { message: 'occurredOn must be a real calendar date' }),
        value: z.number().finite(),
      }),
    )
    .min(1),
})

export type InputValuesInput = z.infer<typeof inputValuesSchema>

// The wire schema for POST /v1/features/:key/link-input (Story 3.2).
export const linkInputSchema = z.object({
  inputKey: z.string().min(1),
})

export type LinkInputInput = z.infer<typeof linkInputSchema>
