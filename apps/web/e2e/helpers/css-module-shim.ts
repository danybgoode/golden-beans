// pod-report · Sprint 2.5c — makes CSS-module-importing components renderable inside a Playwright
// spec.
//
// ── The problem, measured rather than assumed ─────────────────────────────────────────────────
// Playwright's TypeScript transform (1.61) STRIPS `import styles from './x.module.css'` outright —
// it does not replace the binding with a stub. The identifier is therefore left undeclared, and the
// first `styles.someClass` throws `ReferenceError: styles is not defined` at module-init time,
// before a single test body runs. Verified directly against app/hub/hub-components.tsx, whose
// module-scope TONE_CLASS map is exactly that shape.
//
// Because the binding is stripped rather than shadowed, `styles` resolves through the scope chain to
// the global object — so declaring it here is enough. A Proxy returning the key means a rendered
// className is the class NAME rather than a hashed build output, which is strictly more useful in a
// failure message than `undefined`.
//
// ── Why this is safe to depend on in both directions ─────────────────────────────────────────
// If a future Playwright version starts stubbing CSS imports instead of stripping them, the module's
// own local binding wins and this global is simply ignored; class names become `undefined`, and
// nothing breaks, because every assertion in e2e/pod-report-surface.spec.tsx is written against
// SEMANTIC output — text, `data-*` attributes, element structure — and never against a class name.
// That was a deliberate constraint on those assertions, not a happy accident.
//
// Import this module BEFORE any component import. @babel/plugin-transform-modules-commonjs emits
// requires in source order, so import order here is execution order.

const classNameEcho = new Proxy(
  {},
  {
    get: (_target, key) => (typeof key === 'string' ? key : undefined),
  }
)

;(globalThis as unknown as Record<string, unknown>).styles = classNameEcho

export {}
