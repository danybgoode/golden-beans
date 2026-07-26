// signals-loop · Story 1.1 — the pure half of error capture. ZERO imports, deliberately.
//
// ── Why this file imports nothing at all ─────────────────────────────────────────────────────
// `npm run test:unit` runs these `.ts` sources under Node's native type-stripping loader, which
// follows real ESM resolution and therefore requires an explicit `.ts` extension on every relative
// specifier. This repo's app/sdk tsconfigs deliberately REJECT that extension in source files —
// .github/workflows/ci.yml records the reasoning: enabling `allowImportingTsExtensions` globally
// would also let app code write `./foo.ts`, "trading a caught type error for an uncaught build
// break". Only `*.test.ts` opts into the looser rule.
//
// Those two rules together mean a source module is unit-testable only if it has NO relative imports
// — which is exactly why `bucketing.ts` has always been testable and `index.ts` never was. So this
// file has none, and the chain terminates here.
//
// ── The design consequence, which is an improvement rather than a workaround ────────────────
// Normalization and REDACTION are separate concerns, and this forced them apart. `normalizeError`
// answers "what are the three fields?" for any throwable; scrubbing them is the caller's next step
// (index.ts applies `scrubClientText`, and the server applies the authoritative pass regardless).
// Each is now independently testable, and neither can quietly change the other's behaviour.

/** The engine-reserved event name for a captured error. Mirrors apps/web/lib/signal-events.ts. */
export const ERROR_EVENT = '$error'

/** The three fields the engine fingerprints and groups on — NOT yet scrubbed. */
export type NormalizedError = {
  name: string
  message: string
  stack: string | null
}

/**
 * Clamps a caller-supplied sample rate into 0..1, defaulting to 1.
 *
 * Defaulting to 1 rather than 0 is the safe direction: a malformed config should report too much,
 * never silently report nothing. A capture SDK that quietly stops sending is indistinguishable from
 * an application that has no errors — the failure mode nobody notices until it matters.
 */
export function normalizeSampleRate(rate: number | undefined): number {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return 1
  return Math.min(1, Math.max(0, rate))
}

/**
 * Turns anything a `catch` block can receive into the three fields the engine groups on.
 *
 * `catch (e)` gives you `unknown` for a reason — JavaScript lets you throw a string, a number, a
 * plain object, or nothing at all. A reporter that assumes `Error` throws inside the handler for
 * exactly the payloads that are already going wrong, turning one bug into two, with the second one
 * in the error path where nobody is looking.
 *
 * Lengths are NOT bounded here; the caller bounds them while scrubbing, because truncating before
 * redaction can slice a secret in half and store the surviving portion.
 */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || '',
      stack: error.stack ?? null,
    }
  }
  if (typeof error === 'string') {
    return { name: 'Error', message: error, stack: null }
  }
  if (error !== null && typeof error === 'object') {
    const candidate = error as { name?: unknown; message?: unknown; stack?: unknown }
    return {
      name: typeof candidate.name === 'string' ? candidate.name : 'Error',
      message: typeof candidate.message === 'string' ? candidate.message : safeStringify(error),
      stack: typeof candidate.stack === 'string' ? candidate.stack : null,
    }
  }
  return { name: 'Error', message: String(error), stack: null }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    // A circular object is an ORDINARY thrown value — a DOM node, a framework error carrying a
    // back-reference to its own context — and JSON.stringify throws on it. Falling back to
    // String(value) yields "[object Object]": uninformative, never fatal. The caller's own
    // `context` field is where the useful detail lives.
    return String(value)
  }
}
