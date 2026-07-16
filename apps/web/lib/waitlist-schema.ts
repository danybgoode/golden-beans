import { z } from 'zod'

// The wire schema for POST /v1/public/waitlist (Story 1.3). `company` is a honeypot field — a
// real visitor never sees or fills it (it's visually off-screen in WaitlistForm.tsx); any
// non-empty value here is treated as a bot and gets a silent success with no row inserted.
export const waitlistSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email(),
  company: z.string().optional(),
})

export type WaitlistInput = z.infer<typeof waitlistSchema>
