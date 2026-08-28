'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildFeatureEntries,
  buildPaletteEntries,
  filterPaletteEntries,
  movePaletteCursor,
  type FeatureIndexEntry,
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
 * ── The SURFACES cost nothing, and the FEATURES cost nothing until you press the key ──────────
 * `links` are the ones `getShellNav()` already resolved server-side for the header and the rail.
 * That half is a second VIEW of a list the shell has already paid for, never a second READ — and it
 * therefore inherits the entitlement filtering rather than re-implementing it, which is the only
 * reason a client component may hold it at all.
 *
 * The FEATURES half (Story 3.4) is fetched from `/api/internal/feature-index/<slug>` on the FIRST
 * `⌘K` and cached for the life of this component. That is D7's answer, and it was measured rather
 * than preferred: the alternative — seeding from the server on every render — means paying the
 * registry's 5 round trips and ~16 KB on every signed-in page load to serve a control most sessions
 * never press. **`/app` route load cost is unchanged: zero added queries, zero added bytes.**
 */
export function CommandPalette({
  links,
  projectSlug,
}: {
  links: readonly ProjectSurfaceLink[]
  /**
   * The project whose features `⌘K` indexes, or `null` when there is none to index.
   *
   * Null is a real state, not a defensive default: a signed-in user with no project reaches this
   * shell, and so does a viewer whose nav read degraded. The palette then lists surfaces only,
   * which is honest — there is no project whose features it could name.
   */
  projectSlug: string | null
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // `null` = not fetched yet. `[]` = fetched and this project has no features. The distinction is
  // the whole point of a nullable here: one of those states should say "loading" and the other
  // should say nothing at all, and a bare empty array cannot tell them apart.
  const [features, setFeatures] = useState<FeatureIndexEntry[] | null>(null)
  const [indexFailed, setIndexFailed] = useState(false)

  const entries = useMemo(
    () => [
      // Features first — the design's order, and the useful one: 42 features against 13 surfaces,
      // and every surface is already one click away in the header and the rail.
      ...(projectSlug === null || features === null ? [] : buildFeatureEntries(features, projectSlug)),
      ...buildPaletteEntries(links),
    ],
    [links, features, projectSlug]
  )
  const matches = useMemo(() => filterPaletteEntries(entries, query), [entries, query])

  // ── The fetch, on FIRST open and once per page ──────────────────────────────────────────────
  // Keyed on `open` rather than on mount, which is the whole of D7's answer. `features !== null`
  // stops a second fetch when the palette is reopened; `indexFailed` stops it retrying forever on a
  // tenant whose index genuinely cannot be read.
  useEffect(() => {
    if (!open || projectSlug === null || features !== null || indexFailed) return
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`/api/internal/feature-index/${encodeURIComponent(projectSlug)}`, {
          headers: { Accept: 'application/json' },
        })
        // ⚠️ The content type is checked, not just `ok`. `requireProjectMembership` REDIRECTS an
        // unauthenticated caller to /login, `fetch` follows redirects by default, and the login page
        // answers 200 with HTML — so `response.ok` alone would hand `json()` a document and throw
        // inside the try for a reason that has nothing to do with the index.
        const contentType = response.headers.get('content-type') ?? ''
        if (!response.ok || !contentType.includes('application/json')) throw new Error('not an index')
        const body = (await response.json()) as { features?: FeatureIndexEntry[] }
        if (!cancelled) setFeatures(Array.isArray(body.features) ? body.features : [])
      } catch {
        // Degrade to surfaces only, and SAY SO below rather than quietly listing fewer things — a
        // reader who types a feature name and sees nothing would otherwise conclude the feature does
        // not exist.
        if (!cancelled) setIndexFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, projectSlug, features, indexFailed])

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
                {/* The kind is on the row, which is Story 3.4's acceptance in one word: a reader
                    scanning results has to be able to tell "the Flags page" from "a feature called
                    flags". Derived from the closed union rather than from where the row came from,
                    so a third kind cannot be added without deciding what it says. */}
                <span className="command-palette__kind">
                  {entry.kind === 'feature' ? 'Feature' : 'Go to'}
                </span>
                {entry.label}
                {entry.hint !== '' && <small>{entry.hint}</small>}
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
        {/* ⚠️ Stated, never silent. If the feature index could not be read, this palette is missing
            most of what it normally holds — and a reader who types a feature key, sees nothing and
            concludes the feature was deleted is worse off than one who is told the list is short. */}
        {indexFailed && (
          <p className="command-palette__empty" role="status">
            Features could not be listed just now, so this only shows places to go.
          </p>
        )}
      </div>
    </div>
  )
}
