import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// multi-tenant-activation · Sprint 1, Story 1.1 — auth session refresh.
//
// Server Components can't write cookies, so @supabase/ssr needs middleware to rewrite refreshed
// auth cookies onto the response. This is session PLUMBING ONLY — it does NOT gate routes.
// Per-route authorization is a server-side membership check at the DATA boundary
// (lib/membership.ts), never a URL-pattern guard here. Scoped to /app so the shipped public
// surface (landing, /api/v1/*) is untouched and pays no auth cost.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // Auth env missing (e.g. a preview built before the vars land): skip the refresh — there's no
  // session to refresh without a client. This is NOT graceful degradation to a login screen: the
  // page's own getSessionUser() will then throw from requireEnv() and the request 500s. That is
  // deliberate and correct — a misconfigured auth boundary must fail LOUD, never silently render
  // as "logged out" (which could read as an authorization answer). An earlier comment here claimed
  // a /login fallback that the code never provided; cross-review round 2 (Codex, 2026-07-20) caught
  // the mismatch. The fix is the honest comment, not a softer failure.
  if (!url || !anon) return response

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Touch getUser() to refresh a stale access token (and its cookie) before the page runs.
  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: ['/app/:path*'],
}
