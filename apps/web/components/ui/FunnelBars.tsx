// app-shell-and-agent-rail · Sprint 3, Story 3.2 — the funnel, as a funnel.
//
// A thin wrapper over `.funnel` / `.bar`, which have been in
// references/design/assets/tokens.css since the design system landed and are already imported by
// apps/web/app/globals.css (the drift guard asserts that import). The landing has been using these
// exact classes to render a DEMO funnel; this points the same rails at a tenant's real numbers,
// which is the audit's §6.5 point precisely.
//
// ── The charting question stays out of scope, and this is the circuit breaker ─────────────────
// `apps/web/package.json` gains no dependency. If a visual here ever seems to need a chart library,
// that is the signal to stop and hand it back to shaping — `analytics-visualization-layer` is
// already seeded for exactly that decision. Three bars are not a charting problem.
//
// ── Why an inline height is allowed here ──────────────────────────────────────────────────────
// scripts/check-design-drift.mjs bans inline styles in `components/landing` ONLY, deliberately: a
// bar's height is computed geometry, not a colour drifting away from the tokens. (The landing's own
// funnel works around the ban with an SVG rect; it is not worth converting, and D5's one-device rule
// is about the agent's activity line, not about bar rendering.) Every colour here is a token.

import { barHeightPercent, dropOffLabel } from '@/lib/funnel-geometry'

export type FunnelStage = {
  label: string
  /** Null when this stage could not be read. Rendered as unreadable, never as a zero-height bar. */
  value: number | null
}

/**
 * Render Targeted → Adopted → Retained (or any ordered stage list) as labelled bars.
 *
 * Bars are scaled against the LARGEST stage, not against a fixed ceiling, so the shape of the
 * drop-off is what the reader sees. Each stage carries its own count and its retention of the
 * previous stage, because a bar without its number is a picture, not evidence.
 */
export function FunnelBars({ stages, caption }: { stages: FunnelStage[]; caption?: string }) {
  const readable = stages.map((s) => s.value).filter((v): v is number => v !== null)
  const max = readable.length > 0 ? Math.max(...readable) : 0

  return (
    <figure className="funnel-bars">
      <div
        className="funnel"
        role="img"
        aria-label={stages.map((s) => `${s.label} ${s.value ?? 'unreadable'}`).join(', ')}
      >
        {stages.map((stage, index) => {
          const previous = index > 0 ? stages[index - 1].value : null
          const kept = dropOffLabel(previous, stage.value)
          return (
            <div className="bar" key={stage.label}>
              {stage.value === null ? (
                <span className="funnel-bars__unreadable">unreadable</span>
              ) : (
                <div style={{ height: `${barHeightPercent(stage.value, max)}%` }} />
              )}
              <span className="funnel-bars__label">
                {stage.label} · {stage.value === null ? '—' : stage.value.toLocaleString('en-US')}
                {kept ? <small>{kept}</small> : null}
              </span>
            </div>
          )
        })}
      </div>
      {caption ? <figcaption className="note">{caption}</figcaption> : null}
    </figure>
  )
}
