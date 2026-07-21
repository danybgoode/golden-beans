import { NextResponse, type NextRequest } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase-auth'
import { getSiteUrl } from '@/lib/site-url'
import { safeRedirectPath } from '@/lib/safe-redirect'

// multi-tenant-activation · Sprint 1, Story 1.1 — the code-exchange landing. Supabase links back
// here with a `code`; we exchange it for a session (setting the auth cookies) and send the user on.
// Redirect base comes from getSiteUrl() (AGENTS rule #5 — never the request Host header).
//
// `next` is attacker-controlled — the origin-comparing guard lives in lib/safe-redirect.ts as a
// pure, zero-import function so it can be asserted directly by the e2e suite (this route only
// consults `next` after a successful code exchange, so an HTTP-level spec can't reach that branch).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const target = safeRedirectPath(searchParams.get('next'), getSiteUrl())

  if (code) {
    const supabase = await createAuthServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(target)
  }
  return NextResponse.redirect(new URL('/login?error=auth', getSiteUrl()))
}
