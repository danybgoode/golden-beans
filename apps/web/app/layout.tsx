import type { Metadata } from 'next'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import { getSiteUrl } from '@/lib/site-url'
import { NavigationLoader } from '@/components/brand/NavigationLoader'
import './globals.css'

const sans = Archivo({ subsets: ['latin'], variable: '--font-sans' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' })

// landing-maker-ops · Sprint 2, Story 2.8 — the metadata follows the repositioning.
//
// The pair this replaces described the primitive set ("Telemetry, TARS funnels, North Star metrics
// and A/B experiments…"). That is what the product IS, and it is the wrong first sentence for a
// reader deciding whether to click: the tab title and the link preview are read by someone who has
// not yet been told what primitives are for. A page that opens on "maker ops" and unfurls as an
// analytics primitive list is two products in one link.
//
// AI-spend is deliberately NOT in this list. It was, for one commit. FinOps is unbuilt and every
// other surface on the site says so — but a link preview is the one piece of copy that travels
// without its qualification attached, so an unbuilt capability named here is a claim nobody can see
// the caveat for. Caught by Codex in round 4 of PR #100.
const TITLE = 'Golden Frijoles — make more, grow what works'
const DESCRIPTION =
  'Product, delivery and security operations in one context your agents can work in — so a single maker can build a product and actually run it.'

// Story 3.2 (commercial-shell/sprint-3.md) — real OG/Twitter metadata, so a pasted landing link
// unfurls with a correct card in a chat app instead of the platform's generic fallback. `async
// generateMetadata` (not a static `metadata` object) deliberately: a static object is evaluated
// once and can bake in whatever SITE_URL happens to be set at build time (this repo's
// typecheck-build CI job runs `npm run build` with NO env vars at all — see app/page.tsx's header
// comment), which would freeze a build-time localhost URL into `openGraph.url`/`metadataBase`
// forever. Every route in this app that needs a real URL already calls `getSiteUrl()` live per
// request (see app/install/page.tsx) instead of at module load — this matches that.
// `metadataBase` is set explicitly (not left to Next's own VERCEL_URL inference) so the resolved
// absolute opengraph-image/twitter-image URLs use the SAME sanctioned URL source as every other
// absolute URL in this app.
export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = getSiteUrl()
  return {
    metadataBase: new URL(siteUrl),
    title: TITLE,
    description: DESCRIPTION,
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: siteUrl,
      siteName: 'Golden Frijoles',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
    },
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <NavigationLoader />
        {children}
      </body>
    </html>
  )
}
