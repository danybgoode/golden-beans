// golden-frijoles-cli · Sprint 1, Story 1.1 — the two output modes, and the rule that separates
// them.
//
// ── The rule: `--json` writes ONE JSON document to stdout, and nothing else, ever ─────────────
// Not a progress line, not a warning, not a "minting…". An agent runs `gf … --json` and pipes
// stdout into a parser; one stray human sentence makes the whole document unparseable, and it does
// so intermittently — only on the runs that happened to warn. So under `--json`, stdout carries
// exactly one `JSON.stringify` and every human word goes to stderr or nowhere.
//
// ── Errors go to STDOUT under --json, and that is deliberate ──────────────────────────────────
// The reflex is stderr. It is wrong here: the machine-readable failure IS the result, and a caller
// who captured stdout and got an empty string cannot tell a failure from a command that produced
// nothing. The exit code says it failed; stdout says why, in the same shape as a success. Human
// mode keeps errors on stderr, where a human's shell expects them.

export type Writer = { out: (text: string) => void; err: (text: string) => void }

/** The real one. Injected everywhere so the whole surface is assertable without capturing a process. */
export const processWriter: Writer = {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
}

export type Emitter = {
  readonly json: boolean
  /** A successful result. Under `--json` this is the one document; otherwise `human` is printed. */
  ok(payload: Record<string, unknown>, human: string): void
  /** A failure. `code` is the machine-readable reason; `message` is the sentence. */
  fail(code: string, message: string, extra?: Record<string, unknown>): void
  /** Progress and asides. NEVER reaches stdout under `--json`. */
  note(text: string): void
}

export function createEmitter(writer: Writer, json: boolean): Emitter {
  return {
    json,
    ok(payload, human) {
      if (json) writer.out(JSON.stringify({ ok: true, ...payload }, null, 2))
      else writer.out(human)
    },
    fail(code, message, extra) {
      if (json) writer.out(JSON.stringify({ ok: false, code, error: message, ...extra }, null, 2))
      else writer.err(message)
    },
    note(text) {
      // Under `--json` a note is DROPPED, not redirected to stderr. Redirecting looks tidier and is
      // worse: CI captures stderr too, and an agent asked to report the command's output would
      // surface a progress line as though it were part of the answer.
      if (!json) writer.err(text)
    },
  }
}

/** Left-pad a table column. No dependency, and no colour — see `--no-color`'s absence of an opposite. */
export function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

/**
 * A plain-text table. Human mode only.
 *
 * Column widths are computed from the DATA, so a long flag key does not shear the row — the
 * alternative (a fixed width with truncation) hides the end of exactly the identifiers a person is
 * scanning for.
 */
export function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? '').length))
  )
  const line = (cells: readonly string[]) =>
    cells
      .map((cell, column) => pad(cell ?? '', widths[column]))
      .join('  ')
      .trimEnd()
  return [line(headers), line(widths.map((width) => '─'.repeat(width))), ...rows.map(line)].join('\n')
}
