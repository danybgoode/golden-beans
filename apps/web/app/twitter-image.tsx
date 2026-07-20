import { ImageResponse } from 'next/og'
import { ogImageContent } from '@/lib/og-image-content'

// Story 3.2 (commercial-shell/sprint-3.md) — a separate `twitter-image` file convention (rather
// than relying on X/Twitter's own og:image fallback) so `metadata.twitter.card` in app/layout.tsx
// (summary_large_image) has an explicit twitter:image tag to point at, matching the same visual
// as opengraph-image.tsx via the shared lib/og-image-content.tsx JSX.
export const alt = 'Golden Beans — the growth engine your agent operates'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(ogImageContent(), { ...size })
}
