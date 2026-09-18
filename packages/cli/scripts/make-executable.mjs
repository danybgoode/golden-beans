// `tsc` does not preserve the executable bit, and npm only chmods a `bin` entry on INSTALL — so a
// freshly built `dist/bin.js` run straight from a checkout (`node_modules/.bin/gf`, or the repo's
// own smoke) is not executable. One line, asserted: the build fails loudly if the file is missing
// rather than shipping a `bin` that points at nothing (CODE-QUALITY #6 — an unasserted scripted
// edit that finds nothing succeeds silently).
import { chmodSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
if (!existsSync(target)) {
  console.error(`✗ ${target} was not built — the "bin" entry would point at nothing`);
  process.exit(1);
}
chmodSync(target, 0o755);
