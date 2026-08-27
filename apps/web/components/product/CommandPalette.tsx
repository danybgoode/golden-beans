'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildPaletteEntries,
  filterPaletteEntries,
  movePaletteCursor,
  type PaletteEntry,
} from '@/lib/console-palette'
import type { ProjectSurfaceLink } from '@/lib/project-route-inventory'

/**
 * console-ia-overhaul · Sprint 1, Story 1.5 — ⌘K over every surface you are entitled to.
 *
 * ── The only client island in the shell, and it holds no logic ────────────────────────────────
 * What to show, in what order, and where the cursor goes all live in `lib/console-palette.ts`,
 * where `npm run test:unit` can reach them. This file is keystrokes and markup. That split is not
 * tidiness: `ProductShell` wraps every signed-in route, so anything asserted only from inside this
 * component is asserted only in a browser with a real session — which the blocking gate has neither
 * of.
 *
 * It is wrapped in `ShellErrorBoundary` by its caller, so a throw during RENDER removes the palette
 * and leaves the page (A9). That net does not extend to event handlers or to the native keydown
 * listener — see the boundary's own comment — so the listener guards its input directly.
 *
 * ── No new query, no new route ────────────────────────────────────────────────────────────────
 * `links` are the ones `getShellNav()` already resolved server-side for the header and the rail.
 * The palette is a second VIEW of that list, never a second READ of it — and it therefore inherits
 * the entitlement filtering rather than re-implementing it, which is the only reason a client
 * component may hold this list at all.
 */
export function CommandPalette({ links }: { links: readonly ProjectSurfaceLink[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const entries = useMemo(() => buildPaletteEntries(links), [links])
  const matches = useMemo(() => filterPaletteEntries(entries, query), [entries, query])

  // ⌘K / Ctrl-K toggles. Bound to the document because the point of the shortcut is that it works
  // wherever you are on the page, including with focus in a table or a form.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // `event.key` is optional on a synthetic `new Event('keydown')`, and this is a NATIVE listener
      // — a throw here is not caught by ShellErrorBoundary (which sees render and lifecycle only),
      // so `undefined.toLowerCase()` would silently kill the shortcut for the rest of the page's
      // life. Guarded at the source rather than left to a net that does not extend here (fresh
      // reviewer, PR #122).
      if (typeof event.key !== 'string') return
      // Escape closes from ANYWHERE, not only from the input. Tabbing onto a row and pressing
      // Escape used to be inert, because the only Escape handler was the input's own.
      if (event.key === 'Escape') {
        setOpen(false)
        return
      }
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        // Chrome binds ⌘K to the address bar's search shortcut, so without this the palette opens
        // AND the browser steals focus.
        event.preventDefault()
        setOpen((wasOpen) => !wasOpen)
        setQuery('')
        setCursor(0)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  function go(entry: PaletteEntry | undefined) {
    if (entry === undefined) return
    // A full navigation rather than a router push: every entry is a server-rendered route whose
    // guards run on the request, and the shell it lands in has to re-resolve its own section. This
    // is the same reason every link in the header and the rail is a plain `<a>`.
    window.location.assign(entry.href)
  }

  return (
    // Not a <dialog>: `showModal()` cannot be driven from render, and a native modal would trap
    // focus in a component whose entire failure mode is supposed to be "disappears quietly".
    <div className="command-palette" role="dialog" aria-modal="true" aria-label="Go to">
      {/* Clicking away closes. `aria-hidden` because it duplicates Esc for pointer users and has
          nothing of its own to announce. */}
      <button
        type="button"
        className="command-palette__scrim"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setOpen(false)}
      />
      <div className="command-palette__panel">
        <input
          ref={inputRef}
          className="command-palette__input"
          type="text"
          value={query}
          placeholder="Go to…"
          aria-label="Go to"
          // The listbox pattern: the input keeps focus and OWNS the active option, so a screen
          // reader announces the highlighted row without focus ever leaving the text field.
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={matches[cursor] ? `palette-${matches[cursor].id}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value)
            // Reset rather than clamp: after retyping, the cursor belongs at the top of the NEW
            // list, not at whatever ordinal it happened to hold in the old one.
            setCursor(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
              return
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setCursor((index) =>
                movePaletteCursor(index, event.key === 'ArrowDown' ? 1 : -1, matches.length)
              )
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              go(matches[cursor])
            }
          }}
        />
        {/* `role="option"` sits on the ANCHOR below, not on the <li>: a listbox option must not
            contain a separately focusable control, and the anchor is what carries the href, the
            click target and the keyboard target. The <li> is presentational (fresh reviewer, #122). */}
        <ul id="command-palette-list" role="listbox" aria-label="Surfaces">
          {matches.map((entry, index) => (
            <li key={entry.id} role="presentation">
              <a
                id={`palette-${entry.id}`}
                role="option"
                aria-selected={index === cursor}
                href={entry.href}
                // OUT of the tab order on purpose. The input owns the keyboard here and points at
                // the active row with `aria-activedescendant`; leaving the anchors tabbable meant
                // Tab moved REAL focus onto a row, where the highlight (driven by `cursor`) and the
                // focus ring pointed at different things and ↑/↓ stopped working — that handler is
                // on the input. Escape still closes from anywhere, via the document listener.
                tabIndex={-1}
                onMouseEnter={() => setCursor(index)}
              >
                {entry.label}
                <small>{entry.hint}</small>
              </a>
            </li>
          ))}
        </ul>
        {/* An honest empty state rather than a silently empty list — the reader needs to know the
            query ran and matched nothing, not wonder whether the palette is broken. */}
        {/* Two different empty states, because they are two different facts. A query that matched
            nothing is the reader's search failing; an empty list with an EMPTY query means this
            viewer is entitled to no surface at all (a zero-project session, gate on) — and
            “Nothing here matches ””” would have been quoted emptiness rather than an answer. */}
        {matches.length === 0 && (
          <p className="command-palette__empty" role="status">
            {query.trim() === ''
              ? 'There is nothing here to go to yet.'
              : `Nothing here matches “${query.trim()}”.`}
          </p>
        )}
      </div>
    </div>
  )
}
