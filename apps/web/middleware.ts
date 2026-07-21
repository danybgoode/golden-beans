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
  // Auth not configured (e.g. a preview built before the envs land) — degrade to a no-op rather
  // than 500 every /app request; the page's own getSessionUser() will send the user to /login.
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
