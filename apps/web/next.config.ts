import type { NextConfig } from 'next'

// Story 1.1 (commercial-shell/sprint-1.md) — the engine pages (funnel/impact/experiments) moved
// under /app/... to make room for the public landing at `/`. No auth exists yet (out of this
// epic's scope), so "gating" here is physical relocation + a redirect, not a real access check.
// 307 (temporary), not 301: the real auth-gated destination may move again once E2 lands, and a
// 301 would get hard-cached by browsers/search engines against a path that isn't final.
const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/funnel/:projectSlug/:featureKey', destination: '/app/funnel/:projectSlug/:featureKey', permanent: false },
      { source: '/impact/:projectSlug/:featureKey', destination: '/app/impact/:projectSlug/:featureKey', permanent: false },
      { source: '/experiments/:projectSlug/:experimentKey', destination: '/app/experiments/:projectSlug/:experimentKey', permanent: false },
    ]
  },
}

export default nextConfig
