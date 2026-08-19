'use client'

import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import type { OpsSurface, SurfaceStatus } from '@/lib/maker-ops'

// landing-maker-ops · Sprint 2, Story 2.4 — the four surfaces, one panel.
//
// ── Why this is a real tablist and not four divs with onClick ─────────────────────────────────
// The mockup ships `<button class="opstab" data-op="product">` plus a click handler that swaps
// `textContent`, with no roles, no `aria-selected`, no arrow keys and no focus management. That is
// a control a keyboard user can tab to and press, and then cannot tell what it did — the state it
// changed is announced nowhere, and the panel it changed is not associated with it.
//
// `references/ux-guidelines.md` sets the floor: "every focusable element has a visible focus
// state", "colour is never the only signal", and — the one this pattern most often fails —
// "anything that updates without a page load should be announced, not just visually swapped".
// So: `role="tablist"` / `role="tab"` / `role="tabpanel"`, `aria-selected`, `aria-controls`, a
// roving `tabindex` (only the selected tab is in the tab order; arrows move between them, which is
// the APG pattern and what a screen-reader user will expect), and Home/End.
//
// ── Why the STATUS arrives as a prop rather than being read here ──────────────────────────────
// This is a client component; `lib/flags.ts` reads `process.env` and belongs on the server. The
// parent resolves each surface's status per request and passes the answer down, so the badge is
// still computed from the live gate (epic D3) rather than written down — it is just computed one
// component higher up.

export type ResolvedSurface = OpsSurface & { resolved: SurfaceStatus }

export function OpsTabs({ surfaces }: { surfaces: ResolvedSurface[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const active = surfaces[activeIndex]

  function focusTab(index: number) {
    const bounded = (index + surfaces.length) % surfaces.length
    setActiveIndex(bounded)
    tabRefs.current[bounded]?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    // Only the keys the pattern owns are intercepted. Tab, Shift+Tab and every shortcut the
    // browser or an assistive technology uses must keep working — a tablist that swallows keys it
    // does not handle is worse than one that handles none.
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        focusTab(index + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        focusTab(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusTab(0)
        break
      case 'End':
        event.preventDefault()
        focusTab(surfaces.length - 1)
        break
      default:
        break
    }
  }

  return (
    <>
      <div className="ops-tabs" role="tablist" aria-label="Operating surfaces">
        {surfaces.map((surface, index) => {
          const selected = index === activeIndex
          return (
            <button
              key={surface.id}
              ref={(node) => {
                tabRefs.current[index] = node
              }}
              type="button"
              role="tab"
              id={`ops-tab-${surface.id}`}
              className="ops-tab"
              aria-selected={selected}
              aria-controls={`ops-panel-${surface.id}`}
              // Roving tabindex: one stop for the whole group, arrows move within it.
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {surface.tab}
              {/* The unbuilt surface is labelled on the TAB, not only inside the panel a reader
                  has to open first. Epic D4: the one section describing something that does not
                  exist says so everywhere it appears. */}
              {surface.resolved.status === 'next' ? <Badge status="next">Next</Badge> : null}
            </button>
          )
        })}
      </div>

      <div
        className="ops-panel"
        role="tabpanel"
        id={`ops-panel-${active.id}`}
        aria-labelledby={`ops-tab-${active.id}`}
        tabIndex={0}
      >
        <div className="ops-copy panel">
          <p className="kicker">{active.eyebrow}</p>
          <h3>{active.title}</h3>
          <p>{active.description}</p>

          {active.resolved.status !== 'live' ? (
            <p className="ops-status">
              <Badge status="next">{active.resolved.status === 'next' ? 'Next build' : 'Partly gated'}</Badge>
              <span>{active.resolved.note}</span>
            </p>
          ) : null}

          <ul className="ops-questions">
            {active.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>

        <div className="ops-caps panel">
          {active.capabilities.map((capability) => (
            <div className="ops-cap" key={capability.name}>
              <b>
                <Icon name={capability.icon} size={15} />
                {capability.name}
              </b>
              <span>{capability.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
