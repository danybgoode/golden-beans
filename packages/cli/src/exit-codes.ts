// golden-frijoles-cli · Sprint 1, Story 1.1 — the exit codes, as named constants.
//
// ── Why an enum and not `process.exit(1)` at forty call sites ─────────────────────────────────
// The point of this CLI is that an agent drives it. An agent branches on the exit code, and a shell
// script branches on nothing else at all. So the codes are a CONTRACT — pinned by a golden file
// (D5), printed by `gf --help`, and named here once so a new verb cannot invent a meaning for `4`
// that disagrees with every other verb's `4`.
//
// ── Why these seven, and no more ──────────────────────────────────────────────────────────────
// Each one exists because a caller would do something DIFFERENT about it. That is the test for
// adding an eighth: if the remedy is the same, it is the same code.
//
//   USAGE      — fix the command. Nothing was sent.
//   AUTH       — log in again. The credential is not accepted.
//   NOT_FOUND  — the thing is not there, or is not yours. Deliberately one code: "not yours" and
//                "not there" are indistinguishable by design (AGENTS #10), so an exit code that
//                told them apart would leak what the API refuses to.
//   CONFLICT   — someone else moved it. Re-read and retry. This is the one an agent can RESOLVE by
//                itself, which is why it must not collapse into SERVER.
//   PARTIAL    — D2. Some environments changed and some did not. Not a success and not a clean
//                failure, and a CLI with no code for it forces the caller to parse prose.
//   SERVER     — the server or the network is unwell. RETRY; do not mint anything new.
export const EXIT = {
  OK: 0,
  USAGE: 1,
  AUTH: 2,
  NOT_FOUND: 3,
  CONFLICT: 4,
  PARTIAL: 5,
  SERVER: 6,
} as const

export type ExitCode = (typeof EXIT)[keyof typeof EXIT]

/**
 * The server's `code` → this CLI's exit code.
 *
 * `lib/cli-auth.ts` carries the other half of this mapping. They are two files in two packages and
 * cannot share a type, so the pairing is asserted by an e2e spec rather than assumed — an API that
 * grew a seventh code would otherwise fall silently into `SERVER` here.
 */
export function exitForServerCode(code: string | undefined): ExitCode {
  switch (code) {
    case 'unauthorized':
      return EXIT.AUTH
    case 'not_found':
      return EXIT.NOT_FOUND
    case 'invalid':
      return EXIT.USAGE
    case 'conflict':
      return EXIT.CONFLICT
    case 'disabled':
      // The CLI API is switched off on this deployment. Not an auth problem and not the caller's
      // mistake — there is nothing to fix in the command, so it reads as a server-side condition.
      return EXIT.SERVER
    default:
      return EXIT.SERVER
  }
}

/** Every code, for `--help` and for the golden file. Ordered by value so the list cannot reshuffle. */
export const EXIT_CODE_TABLE: ReadonlyArray<{ code: ExitCode; name: string; means: string }> = [
  { code: EXIT.OK, name: 'ok', means: 'it worked' },
  { code: EXIT.USAGE, name: 'usage', means: 'the command is wrong — nothing was sent' },
  { code: EXIT.AUTH, name: 'auth', means: 'the credential is not accepted — run `gf login`' },
  { code: EXIT.NOT_FOUND, name: 'not-found', means: 'no such thing, or not yours' },
  { code: EXIT.CONFLICT, name: 'conflict', means: 'someone else changed it — re-read and retry' },
  { code: EXIT.PARTIAL, name: 'partial', means: 'some environments changed and some did not' },
  { code: EXIT.SERVER, name: 'server', means: 'the server or the network is unwell — retry' },
]
