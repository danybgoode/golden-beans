import type { ReactNode } from 'react'

// landing-frijoles-rebrand · Sprint 1, Story 1.5 (epic D4) — the numbered kraft divider.
//
// ── Why `number` is a number ──────────────────────────────────────────────────────────────────
// It used to be a string, and every call site passed an enclosed-numeral character: `①`, `②`, …
// That is a single glyph rendered at 12px inside a 14px-tall kraft band, and it is illegible at
// any size a text run tolerates — the ring eats most of the em box, so the digit inside it lands
// at roughly a third of the nominal size. Making it larger does not help either, because the glyph
// scales the ring with the digit.
//
// So the divider now draws the stamp itself: a real disc, in the packaging material family the
// brand already owns (`--kraft` ground, `--stamp` ink, the fibre texture), with the numeral set in
// mono at a size that reads. Typing the prop as `number` is the load-bearing half — a `string`
// prop is an open invitation to paste the glyph back in, and `scripts/check-design-drift.mjs`
// would then be the only thing standing between that and production.
export function SectionDivider({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children?: ReactNode
}) {
  return (
    <div className="divider">
      <div className="wrap">
        {/* The disc is decoration for a screen reader: the heading below it already carries the
            section's name, and "1" announced before every title is noise, not navigation. */}
        <span className="divider__stamp" aria-hidden="true">
          {number}
        </span>
        <span className="stamp-title">{title}</span>
        {children}
      </div>
    </div>
  )
}
