'use client'
import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * console-ia-overhaul · Sprint 1, Story 1.5 (epic README, A9) — the shell's one client island fails
 * to nothing.
 *
 * ── Why this exists at all ────────────────────────────────────────────────────────────────────
 * `ProductShell` wraps EVERY signed-in route, including error and gated states. Story 1.5 asks that
 * the command palette "cannot break the page it sits on", and until now that was a sentence with no
 * mechanism behind it: **there was no ErrorBoundary anywhere in `apps/web`** (grepped 2026-08-27).
 * An uncaught throw in a client component unmounts the whole React tree below the nearest boundary
 * — and with no boundary at all, the nearest one is Next's own error page. A palette that threw on
 * a bad keystroke would therefore replace the entire signed-in product with an error screen.
 *
 * A class component because that is the only thing React offers: `getDerivedStateFromError` and
 * `componentDidCatch` have no hook equivalent. It is the single deliberate class in this codebase,
 * and this comment is why.
 *
 * ── It renders NOTHING, not a fallback ────────────────────────────────────────────────────────
 * There is no "the palette is broken" message, on purpose. The palette is an accelerator; every
 * destination it offers is also one click away in the header and the rail. A broken-shortcut notice
 * pinned to every page in the product would be louder than the failure it describes, and it is the
 * reader's problem least of all. It is logged instead, where whoever can fix it will look.
 *
 * Deliberately NOT generic chrome for the whole shell: it wraps the palette and only the palette.
 * Swallowing errors from a page's own content would hide real failures behind a blank screen, which
 * is the opposite of this repo's honest-empty-state rule.
 */
export class ShellErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged, never surfaced. A palette that fails is a shortcut that stopped working, not an
    // incident the reader can act on — but it IS one someone reading a console can.
    console.error('[shell] the command palette threw and was removed from this page:', error, info)
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}
