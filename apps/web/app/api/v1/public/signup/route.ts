import { NextRequest, NextResponse, after } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase-auth'
import { getSiteUrl } from '@/lib/site-url'
import { isSignupEnabled } from '@/lib/flags'
import { signupSchema } from '@/lib/signup-schema'
import { checkRateLimit, hashIp } from '@/lib/rate-limit'
import { recordAudit } from '@/lib/audit'
import { trackSelfEvent, SIGNUP_STARTED_EVENT } from '@/lib/self-track'

// POST /api/v1/public/signup — multi-tenant-activation · Sprint 2, Story 2.1.
//
// Account creation only. It does NOT provision a tenant: that happens in the auth callback after
// the email round-trip completes (lib/provisioning.ts), which is what makes "unconfirmed accounts
// own no tenant" structural rather than a check that could be forgotten.
//
// Why a server route at all, when @supabase/ssr can call signUp() straight from the browser: the
// browser path bypasses every guard we own. Routing through here is what lets the enablement gate,
// the honeypot and the IP rate limit actually apply — a client-side signUp() would reach Supabase
// with none of them, so the gate would be decoration.

export async function POST(req: NextRequest) {
  // FIRST, before parsing, rate-limiting, or touching the DB. While the gate is off this route is
  // indistinguishable from one that was never deployed — no 400 on a malformed body, no 429, no
  // timing difference worth reading. Same contract the MCP connector's flag check has.
  if (!isSignupEnabled()) {
    return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = signupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Malformed signup payload', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  // Honeypot: silent success, no account. A bot sees exactly what a real signup sees, so it
  // learns nothing from the response (lifted from the waitlist route, Story 1.3).
  if (parsed.data.company) {
    return NextResponse.json({ ok: true })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  // Tighter than the waitlist's 5-per-10-min: each attempt here can trigger a real outbound
  // confirmation email, so an unguarded route is both an account-spam vector and a way to use us
  // as a mailbomb relay against a third party.
  const rateLimit = await checkRateLimit(`signup:${hashIp(ip)}`, {
    windowMs: 10 * 60 * 1000,
    max: 3,
  })
  if (!rateLimit.ok) {
    return NextResponse.json({ ok: false, error: rateLimit.error }, { status: rateLimit.status })
  }

  const supabase = await createAuthServerClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // AGENTS rule #5 — the redirect base is getSiteUrl(), never the request's Host header.
      // NOTE (Sprint 2 rollout): this URL must be on the Supabase Auth redirect allow-list.
      // Sprint 1 never needed it (signInWithPassword sets cookies directly, no round-trip);
      // signup's confirmation link is the first flow that actually leaves and comes back.
      emailRedirectTo: new URL('/auth/callback', getSiteUrl()).toString(),
    },
  })

  if (error) {
    console.error('[signup] signUp failed:', error.message)
    // Deliberately generic. Supabase's own error text distinguishes "already registered" from
    // "weak password", and echoing it back turns this route into an account-enumeration oracle.
    return NextResponse.json(
      { ok: false, error: 'Could not start signup. Check the address and try again.' },
      { status: 400 },
    )
  }

  // Never branch the RESPONSE on this — with Supabase's existing-user obfuscation on, a repeat
  // signup returns a well-formed user with an empty `identities` array, and treating those two
  // cases differently in the response would re-open the enumeration hole the generic error above
  // just closed. It's used only as the funnel's user id, where a little noise is harmless.
  const funnelUserId = data.user?.id
  if (funnelUserId) {
    after(() => trackSelfEvent(SIGNUP_STARTED_EVENT, funnelUserId))
  }

  // No project_id yet (that's the callback's job) and the email is deliberately absent from the
  // metadata — an audit row records that a signup was attempted from this deployment, not who.
  after(() => recordAudit({ action: 'signup_requested', actorUserId: funnelUserId ?? null }))

  return NextResponse.json({ ok: true })
}
