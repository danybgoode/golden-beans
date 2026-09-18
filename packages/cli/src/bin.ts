#!/usr/bin/env node
// The executable. The ONLY place in this package that touches `process.exit` or `process.argv`.
//
// Everything else returns an exit code, which is what lets the whole CLI run in-process in a test
// with a captured writer and an injected `fetch`.
import { run } from './run'

run({ argv: process.argv.slice(2) })
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    // `run()` already catches a handler throwing. Reaching here means the dispatcher itself failed —
    // a broken install, an unreadable module. Say so plainly rather than printing a bare stack.
    process.stderr.write(`gf failed to start: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 6
  })
