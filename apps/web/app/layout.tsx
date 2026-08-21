import type { Metadata } from 'next'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import { getSiteUrl } from '@/lib/site-url'
import { CATEGORY } from '@/lib/positioning'
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
// ── The description names NO capability, and that is the resolution ─────────────────────────
// It has been narrowed twice under review. First it said "AI-spend operations", which was simply
// false — FinOps is unbuilt (round 4). Then it said "product, delivery and security operations",
// and round 8 argued that delivery and security each ride a gate that is closed in production, so
// naming them still implies more than a reader gets.
//
// Only half of that second objection is fair: those capabilities ARE built and deployed, and what
// is gated is one runtime action in each. But the underlying point holds and is the reason this
// line changed anyway — a link preview is the one piece of copy that travels WITHOUT its
// qualification attached, and gate state is per-deployment while this string is not. Any
// capability list here is a claim the preview cannot qualify and a flag flip can falsify.
//
// So it names NO capability, and the third draft is the one that finally holds. Worth recording why
// the second failed, because the failure is instructive: it listed "goals, releases, experiments and
// evidence" under a comment claiming those were ungated. Checking rather than asserting —
// `lib/flags.ts` — releases ride FLAG_SERVING_ENABLED and experiments ride
// EXPERIMENT_GOVERNANCE_ENABLED. The justification was false on its own terms, and I wrote it while
// fixing this exact class of defect elsewhere in the same PR.
//
// The rule, stated so it cannot be argued into a capability list again: a link preview travels
// WITHOUT the qualification the page carries, and gate state is per-deployment while this string is
// baked per-build. Any capability named here is therefore a claim that a flag flip can falsify and
// the preview cannot qualify. Describe the shape; let the page describe the capabilities, where it
// can read the gates. (Codex, rounds 4, 8 and 10 — it took three.)
// ── The category is named here too, from the one module (epic D2, Story 3.2) ─────────────────
// Imported rather than retyped. This is the fifth outward surface carrying it, and a category name
// that five surfaces each spell for themselves is the defect `lib/positioning.ts` exists to make
// unrepresentable — the same shape as the two lists that cost three review rounds in one epic.
//
// It also satisfies the rule above rather than straining against it: "agentic product management"
// names a DISCIPLINE, not a capability. No flag can falsify it and no gate qualifies it, which is
// exactly the test the third draft of DESCRIPTION was written to pass.
const TITLE = `Golden Frijoles — ${CATEGORY}`
const DESCRIPTION =
  'The operating context your product and your agents share — so the next decision starts from what actually happened, not from an empty chat box.'

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
