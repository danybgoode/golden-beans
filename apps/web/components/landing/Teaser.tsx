// Generic honestly-badged unlit-section component (the `.teaser` class from the design system).
// Story 1.4 wires `epic` from apps/web/lib/landing-sections.ts instead of a hardcoded string —
// this component itself doesn't change, only its caller does.
export function Teaser({
  title,
  body,
  footnote,
  epic,
  band = false,
}: {
  title: React.ReactNode
  body: string
  footnote?: string
  epic: string
  band?: boolean
}) {
  return (
    <section className={band ? 'band' : undefined} style={{ padding: '44px 0' }}>
      <div className="wrap">
        <div className="teaser">
          <div style={{ flex: '1 1 320px', minWidth: 320 }}>
            <h2>{title}</h2>
            <p style={{ margin: '10px 0 0', fontSize: 13.5, maxWidth: 560 }}>{body}</p>
            {footnote && (
              <p className="note" style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--dim-2)' }}>
                {footnote}
              </p>
            )}
          </div>
          <span className="tag tag-next">🔜 LIGHTS UP · {epic}</span>
        </div>
      </div>
    </section>
  )
}
