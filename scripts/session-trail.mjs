#!/usr/bin/env node
// session-trail — leave a trail the next session can pick up, and tell it where the trail has gone stale.
//
// WHY THIS EXISTS
// Running a whole epic in one session is this repo's normal shape (WAYS-OF-WORKING: "the default unit
// of work is now the EPIC"), and hitting a session limit part-way through it is routine rather than
// exceptional. The durable docs already carry scope and outcomes; what dies with the session is the
// in-flight state — which story was half-built, which "it's green" was actually observed versus
// assumed, and which of the twelve uncommitted files are finished.
//
// WHAT MAKES IT DIFFERENT FROM A HANDOVER NOTE
// Roadmap/LEARNINGS.md: "Re-derive a handover's status from the artifact, never from the previous
// session's summary." pod-report Sprint 2's close-out claimed four stories were built; two of those
// claims did not survive a check. Written in good faith, still wrong. So this tool never asks the
// next session to trust the note: every checkpoint captures branch/HEAD/dirty-files MECHANICALLY,
// and `--resume` DIFFS that snapshot against the repository as it is now, leading with the
// disagreement. The note is evidence about the past, and it is labelled as such.
//
// USAGE
//   node scripts/session-trail.mjs --checkpoint "finished 1.0 shared surface; migration verified"
//   node scripts/session-trail.mjs --checkpoint "..." --verified "npm run test:unit → 560 pass"
//   node scripts/session-trail.mjs --resume
//   node scripts/session-trail.mjs --resume --quiet     # exit 1 on drift, for scripting
//
// The trail lives in the EPIC folder (IN-FLIGHT.md) when --epic is given or one can be inferred from
// the branch name, so it is naturally scoped and gets deleted at epic close with its durable content
// promoted into RETROSPECTIVE.md. Otherwise it falls back to a repo-root trail.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCheckpoint,
  detectDrift,
  renderCheckpoint,
  renderResume,
  parseCheckpoints,
} from './lib/session-trail.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FALLBACK_TRAIL = join(ROOT, 'Roadmap', 'IN-FLIGHT.md');

function git(args, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0 && !allowFail) return '';
  return (r.stdout || '').trim();
}

/** Everything derivable, derived. Nothing here is typed by a human, so nothing here can be wishful. */
function observe(trailRelPath = null) {
  const porcelain = git(['status', '--porcelain']);
  const dirty = [];
  const untracked = [];
  for (const line of porcelain.split('\n').filter(Boolean)) {
    const code = line.slice(0, 2);
    const file = line.slice(3).trim();
    // The trail file is excluded from its own snapshot. Writing a checkpoint necessarily modifies
    // the trail AFTER the state was captured, so including it made every single `--resume` report
    // drift — a false positive on every use, which is worse than no detector: this file's own unit
    // tests argue that a drift section which cries wolf trains the reader to skip it, and the real
    // drift then arrives invisibly inside the noise. Caught by running the tool, not by reading it.
    if (trailRelPath && file === trailRelPath) continue;
    if (code === '??') untracked.push(file);
    else dirty.push(file);
  }
  return {
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) || '(detached)',
    head: git(['rev-parse', 'HEAD']),
    headSubject: git(['log', '-1', '--pretty=%s']),
    dirty,
    untracked,
  };
}

// A `feat/<epic-slug>` branch names its epic, which is exactly the convention WAYS-OF-WORKING
// mandates — so the trail can find its own home without being told. Falls back rather than guessing
// wrong: a trail in the wrong epic folder is worse than one at the root.
function inferEpicDir(branch) {
  const slug = (branch.match(/^(?:feat|fix|chore)\/(.+)$/) || [])[1];
  if (!slug) return null;
  const roadmap = join(ROOT, 'Roadmap');
  if (!existsSync(roadmap)) return null;
  for (const macro of readdirSync(roadmap, { withFileTypes: true })) {
    if (!macro.isDirectory()) continue;
    const candidate = join(roadmap, macro.name, slug);
    if (existsSync(join(candidate, 'README.md'))) return candidate;
  }
  return null;
}

function trailPathFor(state, explicitEpic) {
  if (explicitEpic) return join(ROOT, explicitEpic, 'IN-FLIGHT.md');
  const dir = inferEpicDir(state.branch);
  return dir ? join(dir, 'IN-FLIGHT.md') : FALLBACK_TRAIL;
}

// The trail file stores each checkpoint twice: once as human markdown, and once as a fenced JSON
// block the drift check reads. Parsing facts back out of prose would be a second, lossier
// implementation of the same data — and Roadmap/LEARNINGS.md has a scar from exactly that ("two
// implementations of the same escaping rule is one too many"). The JSON is the record; the markdown
// is the rendering of it.
const STATE_FENCE = '```json session-trail-state';

function readLastCheckpoint(trailFile) {
  if (!existsSync(trailFile)) return null;
  const text = readFileSync(trailFile, 'utf8');
  const blocks = [...text.matchAll(/```json session-trail-state\n([\s\S]*?)\n```/g)];
  if (blocks.length === 0) return null;
  try {
    return JSON.parse(blocks[blocks.length - 1][1]);
  } catch {
    // A corrupt block must not take the tool down — a trail that crashes on re-entry is strictly
    // worse than one that admits it cannot read itself.
    process.stderr.write('⚠  session-trail: last state block is unparseable; treating as no checkpoint.\n');
    return null;
  }
}

function parseArgs(argv) {
  const out = { mode: null, note: '', verified: [], epic: null, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--checkpoint') {
      out.mode = 'checkpoint';
      out.note = argv[++i] || '';
    } else if (a === '--resume') {
      out.mode = 'resume';
    } else if (a === '--verified') {
      out.verified.push(argv[++i] || '');
    } else if (a === '--epic') {
      out.epic = argv[++i] || null;
    } else if (a === '--quiet') {
      out.quiet = true;
    } else if (a === '--help' || a === '-h') {
      out.mode = 'help';
    }
  }
  return out;
}

function help() {
  process.stdout.write(`session-trail — continuity across a session that dies mid-flight

  --checkpoint "<note>"   record a checkpoint (state is derived automatically)
  --verified "<cmd → result>"   a fact you OBSERVED, repeatable; kept separate from the note
  --resume                print the re-entry briefing, leading with drift
  --epic <path>           trail location override (default: inferred from the branch)
  --quiet                 with --resume, print nothing and exit 1 if drift is detected

The point is not the note. The point is that --resume diffs the note's recorded state against the
repository now, so a stale trail announces itself instead of being believed.
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.mode || args.mode === 'help') {
    help();
    process.exit(args.mode ? 0 : 1);
  }

  // Two passes: the first only to learn where the trail lives (the path depends on the branch), the
  // second to snapshot the tree with that trail file excluded from its own record.
  const trailFile = trailPathFor(observe(), args.epic);
  const state = observe(trailFile.replace(ROOT + '/', ''));
  const last = readLastCheckpoint(trailFile);

  if (args.mode === 'resume') {
    const drift = detectDrift(last, state);
    if (args.quiet) process.exit(drift.hasDrift ? 1 : 0);
    process.stdout.write(
      renderResume({
        trail: trailFile.replace(ROOT + '/', ''),
        checkpoint: last,
        drift,
        epicPath: args.epic || (inferEpicDir(state.branch) || '').replace(ROOT + '/', '') || null,
      }) + '\n',
    );
    process.exit(0);
  }

  // checkpoint
  const cp = buildCheckpoint({ note: args.note, state: { ...state, verified: args.verified }, now: new Date() });
  const header = existsSync(trailFile)
    ? ''
    : `# In flight — session trail\n\n> Written by \`scripts/session-trail.mjs\`. Each entry records what a session had IN FLIGHT\n> (uncommitted) plus the mechanically-derived branch/HEAD/file state at that moment. On re-entry,\n> \`--resume\` diffs that against the repository now and leads with the disagreement — because a\n> handover's claims must be re-derived, never trusted (Roadmap/LEARNINGS.md).\n>\n> **Delete this file at epic close**, promoting anything durable into RETROSPECTIVE.md.\n\n`;

  mkdirSync(dirname(trailFile), { recursive: true });
  const body = `${renderCheckpoint(cp)}\n${STATE_FENCE}\n${JSON.stringify(cp, null, 2)}\n\`\`\`\n\n`;
  writeFileSync(trailFile, (existsSync(trailFile) ? readFileSync(trailFile, 'utf8') : header) + body);

  const rel = trailFile.replace(ROOT + '/', '');
  const count = parseCheckpoints(readFileSync(trailFile, 'utf8')).length;
  process.stdout.write(`✓ checkpoint ${count} → ${rel}  (${cp.dirty.length} modified, ${cp.untracked.length} new)\n`);
}

const isMain = process.argv[1] && process.argv[1].endsWith('session-trail.mjs');
if (isMain) main();
