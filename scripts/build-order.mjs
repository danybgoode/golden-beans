#!/usr/bin/env node
// build-order.mjs — render Roadmap/00-ideas/BUILD-ORDER.md from the SAME projection the Notion
// sync uses (roadmap-to-notion.mjs --extract). One source of truth: seed frontmatter + epic/sprint
// status lines. This file is GENERATED — never hand-edit BUILD-ORDER.md; run this instead.
//
//   node scripts/build-order.mjs            # write Roadmap/00-ideas/BUILD-ORDER.md
//   node scripts/build-order.mjs --check    # exit 1 if the file is stale (for CI/precommit)
//
// Why this exists: BUILD-ORDER.md used to be hand-maintained, so it drifted on every merge. Status
// and ordering already live in seed frontmatter (the SSOT the Notion projection reads). This makes
// the in-repo board a derived view that cannot drift.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const OUT = join(REPO, 'Roadmap', '00-ideas', 'BUILD-ORDER.md');
const EXTRACTOR = join(__dirname, 'roadmap-to-notion.mjs');

function extract() {
  const json = execFileSync('node', [EXTRACTOR, '--extract'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(json);
}

// SSOT = each epic README's frontmatter `status:` field (00-ideas/README). The extractor resolves it
// into r.status (frontmatter-authoritative, prose/retro fallback) and also emits r.status_derived (the
// fallback derivation) so this board can flag an advisory drift when the two disagree. No seed read
// here — a scaffolded epic's seed is funnel-only; the epic README owns its status.

// Epic status → bucket. Sprints are folded into their epic via sprint_progress; seeds are the funnel.
const EPIC_BUCKETS = [
  { key: 'In progress', emoji: '🏗️', title: 'Building now' },
  { key: 'Scaffolded',  emoji: '📋', title: 'Ready to build (scaffolded, not started)' },
  { key: 'Shipped',     emoji: '✅', title: 'Shipped' },
];
// Seeds not yet scaffolded = the funnel.
const SEED_FUNNEL = new Set(['Raw', 'Ready', 'Queued']);

function line(r) {
  const bits = [`[${r.name}](../../${r.doc_link.replace(/^Roadmap\//, '')})`];
  const meta = [];
  if (r.area) meta.push(r.area);
  if (r.sprint_progress) meta.push(r.sprint_progress);
  if (r.risk) meta.push(`risk: ${r.risk}`);
  if (r.priority) meta.push(r.priority);
  return `- ${bits[0]}${meta.length ? ` — ${meta.join(' · ')}` : ''}`;
}

function render(rows) {
  const epics = rows.filter((r) => r.grain === 'Epic');
  const seeds = rows.filter((r) => r.grain === 'Seed');
  const now = new Date().toISOString().slice(0, 10);

  // Epic status is authoritative from the README frontmatter (the extractor resolved it into e.status).
  // Advisory drift = the prose/retro derivation (e.status_derived) disagreeing with that authoritative
  // status — usually a close-out that forgot to set `status:`, or a stale README. Non-gating signal.
  const drift = [];
  for (const e of epics) {
    if (e.status_derived && e.status_derived !== e.status) {
      drift.push({ name: e.name, frontmatter: e.status, derived: e.status_derived });
    }
  }
  render._drift = drift;

  const out = [];
  out.push('<!-- GENERATED FILE — do not edit by hand.');
  out.push('     Regenerate:  node scripts/build-order.mjs');
  out.push('     Status SSOT: each epic README\'s frontmatter `status:` field (set at epic close). Funnel');
  out.push('     ordering: seed frontmatter (priority). Both projected via scripts/roadmap-to-notion.mjs --extract. -->');
  out.push('');
  out.push('# Build order — generated status board');
  out.push('');
  out.push(`> **Generated ${now} — do not hand-edit.** Epic status SSOT = the epic \`README.md\` frontmatter`);
  out.push('> `status:` field (set at epic close). To change what this shows, edit that field (or a seed for the');
  out.push('> funnel), then run `node scripts/build-order.mjs`. This board and the Notion "Marketplace Roadmap"');
  out.push('> DB are both *derived views* — never hand-edit the board.');
  out.push('');

  for (const b of EPIC_BUCKETS) {
    const list = epics.filter((e) => e.status === b.key)
      .sort((a, z) => (a.area || '').localeCompare(z.area || '') || a.name.localeCompare(z.name));
    out.push(`## ${b.emoji} ${b.title} (${list.length})`);
    out.push('');
    out.push(list.length ? list.map(line).join('\n') : '_None._');
    out.push('');
  }

  const funnel = seeds.filter((s) => SEED_FUNNEL.has(s.status))
    .sort((a, z) => (a.priority || 'zzz').localeCompare(z.priority || 'zzz') || a.name.localeCompare(z.name));
  out.push(`## ⬜ Funnel — seeds not yet scaffolded (${funnel.length})`);
  out.push('');
  out.push(funnel.length ? funnel.map((s) => {
    const meta = [s.status, s.type, s.priority].filter(Boolean).join(' · ');
    return `- [${s.name}](seeds/${s.slug}.md)${meta ? ` — ${meta}` : ''}`;
  }).join('\n') : '_None._');
  out.push('');

  if (drift.length) {
    out.push(`## ⚠️ Status drift — README frontmatter vs sprint/retro-derived (${drift.length})`);
    out.push('');
    out.push('These epics’ authoritative README-frontmatter `status:` disagrees with what the sprint/retro');
    out.push('derivation infers. The board trusts the **frontmatter**; a mismatch usually means a close-out');
    out.push('forgot to set `status:` (or the README is stale). Reconcile the README, then this advisory clears.');
    out.push('');
    out.push('| Epic | frontmatter (used) | sprint/retro-derived |');
    out.push('|---|---|---|');
    for (const d of drift) out.push(`| ${d.name} | ${d.frontmatter} | ${d.derived} |`);
    out.push('');
  }

  out.push('---');
  out.push(`_Epics: ${epics.length} · seeds in funnel: ${funnel.length} · status drift: ${drift.length}. Regenerate with \`node scripts/build-order.mjs\`._`);
  out.push('');
  return out.join('\n');
}

const rows = extract();
const content = render(rows);

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  // Ignore the "Generated <date>" line when comparing so a date-only diff isn't "stale".
  const norm = (s) => s.replace(/^> \*\*Generated \d{4}-\d{2}-\d{2} /m, '> **Generated DATE ');
  if (norm(current) !== norm(content)) {
    console.error('BUILD-ORDER.md is stale — run: node scripts/build-order.mjs');
    process.exit(1);
  }
  console.log('BUILD-ORDER.md is up to date.');
} else {
  writeFileSync(OUT, content);
  console.log(`Wrote ${OUT}`);
}
