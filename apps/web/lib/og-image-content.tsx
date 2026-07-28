// Story 3.2 (commercial-shell/sprint-3.md) — shared JSX for the generated OG/Twitter card, so
// app/opengraph-image.tsx and app/twitter-image.tsx (two separate Next.js file-convention routes,
// each with its own required default-export shape) don't duplicate the same markup. Colors are
// lifted directly from app/globals.css's design tokens (obsidian garden + ingot gold). Kept to
// next/og's (Satori's) supported CSS subset: solid colors + one linear-gradient, explicit
// `display: flex` on every multi-child node, no external font/image fetch (system sans is fine
// for a generated share card, this isn't a design deliverable).
export function ogImageContent() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0c110a' /* --roast */,
        padding: '72px 88px',
        position: 'relative',
      }}
    >
      {/* foil accent stripe, top edge */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 14,
          display: 'flex',
          background:
            'linear-gradient(90deg, #8b5d00 0%, #ffd700 32%, #fff3a1 48%, #d99d00 70%, #744900 100%)' /* --foil */,
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
        <svg
          width="82"
          height="82"
          viewBox="0 0 24 24"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginBottom: 40, filter: 'drop-shadow(0 5px 4px rgba(0,0,0,.5))' }}
        >
          <path
            d="M10.165 6.598C9.954 7.478 9.64 8.36 9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22c7.732 0 14-6.268 14-14a6 6 0 0 0-11.835-1.402Z"
            fill="#FFD700"
            stroke="#FFF38A"
            strokeWidth="1.35"
          />
          <path d="M5.341 10.62a4 4 0 1 0 5.279-5.28" stroke="#7A5200" strokeWidth="1.55" />
        </svg>
        <div
          style={{
            display: 'flex',
            fontSize: 74,
            fontWeight: 900,
            letterSpacing: '-0.02em',
            color: '#fff9e8' /* --crema */,
          }}
        >
          Golden Beans
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 34,
            fontWeight: 600,
            color: '#ffd700' /* --gold */,
            marginTop: 22,
            maxWidth: 920,
          }}
        >
          Plant signals. Grow outcomes.
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: '#b9c5ae' /* --dim */,
            marginTop: 30,
            letterSpacing: '0.06em',
            fontFamily: 'monospace',
          }}
        >
          INGEST · TARS FUNNELS · NORTH STAR · A/B — OVER MCP
        </div>
      </div>
    </div>
  )
}
