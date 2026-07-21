import { NextResponse, type NextRequest } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase-auth'
import { getSiteUrl } from '@/lib/site-url'

// multi-tenant-activation · Sprint 1, Story 1.1 — the email-confirmation / code-exchange landing.
// Supabase emails a link back here with a `code`; we exchange it for a session (setting the auth
// cookies) and send the user on. Redirect base comes from getSiteUrl() (AGENTS rule #5 — never
// the request Host header), and `next` is constrained to a same-origin relative path so the
// callback can't be turned into an open redirect.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next')
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/app'

  if (code) {
    const supabase = await createAuthServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, getSiteUrl()))
  }
  return NextResponse.redirect(new URL('/login?error=auth', getSiteUrl()))
}
