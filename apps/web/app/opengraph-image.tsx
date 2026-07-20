import { ImageResponse } from 'next/og'
import { ogImageContent } from '@/lib/og-image-content'

// Story 3.2 (commercial-shell/sprint-3.md) — the root route's Open Graph image, via Next's
// file-based `opengraph-image` convention (next/og's ImageResponse renders JSX -> PNG at
// request/build time). Chosen over hand-built <meta property="og:image"> tags in app/layout.tsx
// because there's no existing design asset in this repo (no apps/web/public/ dir yet, confirmed
// at plan time) and this convention is the idiomatic Next 15 App Router way to get a real image
// without one, plus Next wires up og:image:width/height/type automatically from the exports below.
export const alt = 'Golden Beans — the growth engine your agent operates'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(ogImageContent(), { ...size })
}
