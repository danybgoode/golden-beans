import { z } from 'zod'

// multi-tenant-activation · Sprint 2, Story 2.1 — the wire schema for POST /v1/public/signup.
// Mirrors lib/waitlist-schema.ts (same honeypot field name, same normalization) so the two public
// write routes are shaped alike and the guards lift cleanly from one to the other.

// Supabase Auth enforces its own project-level minimum; this is the floor WE guarantee regardless
// of how that project is configured. 8 is deliberately a floor and not a composition rule (no
// "must contain a symbol") — length beats character-class theatre, and rejecting a passphrase for
// lacking punctuation pushes people toward weaker, more memorable passwords.
const MIN_PASSWORD_LENGTH = 8
// Bcrypt-family hashers silently truncate very long inputs, and an unbounded password field is a
// free CPU-burn vector on a public route. 72 is the classic bcrypt boundary; 200 is comfortably
// past any real passphrase while still bounded.
const MAX_PASSWORD_LENGTH = 200

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  // Honeypot — visually off-screen in the form, never filled by a real visitor. Any non-empty
  // value gets a silent success with no account created (same contract as the waitlist route).
  company: z.string().optional(),
})

export type SignupInput = z.infer<typeof signupSchema>
