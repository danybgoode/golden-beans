// methodology-experience · Sprint 3, Story 3.3 — the scope boundary for the materials pass.
//
// ── Why a layout exists at all ────────────────────────────────────────────────────────────────
// D2 asks for translucent STICKY chrome on "topbar and TOC rail". The rail is already sticky
// (Story 3.1) and is the methodology's own furniture, so it costs nothing. The topbar is a
// different matter: `Nav` is sticky NOWHERE on this site and is rendered by `/`, `/talk`,
// `/install` and `/login`. Making it sticky in `Nav` itself would change every page in the product
// from a sprint whose contract is one reading experience — the blast radius the "shared surface
// first, and by the architect" rule exists to keep visible.
//
// So the stickiness is SCOPED here rather than granted globally. This wrapper is the only thing
// that carries it; `Nav` is untouched, and `/` renders exactly as it did yesterday. Confirmed as
// the right trade by the product owner on 2026-08-20 before it was built.
//
// ── What this layout deliberately does NOT do ─────────────────────────────────────────────────
// It does not render `Nav` or `Footer`. Hoisting them out of the two pages would be tidier and is
// the obvious next thought — and it is exactly the change LEARNINGS warns about: a parent layout
// that starts the response stream can change the HTTP semantics of a child page (a `notFound()`
// that returned 404 began returning 200 once a shared shell streamed first). `/methodology/[chapter]`
// depends on a real 404 for an unknown segment, and `e2e/methodology-routes.spec.ts` asserts it.
// A wrapper `<div>` streams nothing and decides nothing, which is the whole point of keeping it
// this thin.
export default function MethodologyLayout({ children }: { children: React.ReactNode }) {
  return <div className="methodology-chrome">{children}</div>
}
