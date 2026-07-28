import { Badge } from '@/components/ui/Badge'

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
    <section className={`${band ? 'band ' : ''}section-compact`.trim()}>
      <div className="wrap">
        <div className="teaser">
          <div className="teaser__copy">
            <h2>{title}</h2>
            <p>{body}</p>
            {footnote && <p className="note">{footnote}</p>}
          </div>
          <Badge status="next">LIGHTS UP · {epic}</Badge>
        </div>
      </div>
    </section>
  )
}
