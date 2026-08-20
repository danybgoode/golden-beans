import type { MetadataRoute } from 'next'
import { METHODOLOGY_CHAPTER_IDS } from '@/lib/methodology-chapters'
import { publicRoutes } from '@/lib/public-routes'
import { getSiteUrl } from '@/lib/site-url'

// GET /sitemap.xml — methodology-experience · Sprint 4, Story 4.3 (amendment A6).
//
// There was no sitemap on this site at all; `/sitemap.xml` answered 404 in production. Story 4.3
// said "the routes appear wherever the site tells crawlers what exists" and the answer was nowhere.
//
// `force-dynamic` for the same reason as `app/llms.txt` and `app/page.tsx`: `getSiteUrl()` reads
// `SITE_URL`, Vercel snapshots env vars into a deployment at BUILD time, and a statically generated
// sitemap would freeze the build's URL — which for this repo's `typecheck-build` job is
// `localhost:3000`, since it builds with no env vars at all. A sitemap full of localhost URLs is
// worse than none: it is confidently wrong, and a crawler believes it.
export const dynamic = 'force-dynamic'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl()
  // One `lastModified` for the whole set, taken at request time. Per-route dates would be a claim
  // this app cannot substantiate — nothing here tracks when a given chapter's prose last changed,
  // and inventing per-route timestamps would be a plausible-looking fiction a crawler acts on.
  const lastModified = new Date()

  return publicRoutes(METHODOLOGY_CHAPTER_IDS).map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
