#!/usr/bin/env node
// roadmap-extract.mjs — print the Roadmap projection rows as JSON.
//
// The dobby-foundation template split its roadmap-to-notion.mjs into this extractor (in every project)
// and an opt-in Notion push. THIS project keeps its own roadmap-to-notion.mjs — it drives the live Notion
// board (notion-sync.yml) — so this delegates to its --extract mode rather than forking the extractor. It
// exists because the ways-of-work plugin's skills (and the template's doc-hygiene/doc-format/pmo-report)
// name scripts/roadmap-extract.mjs as the extractor.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const r = spawnSync(
  process.execPath,
  [join(dirname(fileURLToPath(import.meta.url)), 'roadmap-to-notion.mjs'), '--extract'],
  {
    stdio: 'inherit',
  }
);
process.exit(r.status ?? 1);
