#!/usr/bin/env node
// codex-task — delegate a BUILD task to Codex, and report what it actually did to the tree.
//
// ── Why this exists ────────────────────────────────────────────────────────────────────────────
// Codex moved onto a paid account (Daniel, 2026-07-26) and is now a delegation target for building,
// not only the second family in the review gate. The point is division of labour: the architect
// keeps the shared surface, the credential/migration work and the judgment calls, and hands bounded
// stories to a model that can execute them — the "epic-at-once assembly line" shape this repo
// already runs, with one more worker on the line.
//
// ── The rule this tool MECHANISES ──────────────────────────────────────────────────────────────
// Roadmap/LEARNINGS.md, and it was paid for in a real security regression:
//
//   "A subagent that dies mid-task still returns a `result` — that text is its last tool-call
//    narration, not a trustworthy completion claim. … the check after any delegated batch is
//    `git diff HEAD` for SOURCE files the task had no business modifying."
//
// The quality-rails epic lost `timingSafeEqual` from `webhook-signature.ts` exactly this way: an
// agent died between a deliberate mutation and its revert, the returned text read as ordinary
// progress, and every test passed because the mutation was functionally equivalent for equality.
//
// So this tool never reports "done". It reports:
//   1. what the delegate SAID (its transcript, saved to a file, clearly labelled as a claim), and
//   2. what the tree ACTUALLY shows — a git snapshot taken before and after, diffed here.
// (2) is the evidence. (1) is testimony. Keeping them visually separate is the whole design, and
// it is the same argument session-trail makes about a handover note.
//
// It deliberately does NOT run the gate or decide whether the work is good. The architect reads the
// diff and runs `npm run typecheck && npm run test:unit`. A delegation tool that also graded its own
// delegate would be marking its own homework.
//
// ── USAGE ──────────────────────────────────────────────────────────────────────────────────────
//   node scripts/codex-task.mjs --tier standard --brief path/to/brief.md
//   node scripts/codex-task.mjs --tier build --brief brief.md --label "story-3.3"
//   node scripts/codex-task.mjs --tier quick --brief brief.md --dry-run
//
// Tiers are declared in scripts/lib/cross-agent-cli.mjs (CODEX_BUILD_TIERS) — see that table for
// which tier suits which shape of work. HIGH-risk stories are not on it, on purpose.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { die, need, ensureCmd, resolveCodexTier, CODEX_BUILD_TIERS } from './lib/cross-agent-cli.mjs';
import { parsePorcelain } from './lib/session-trail.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function git(args, { trim = true } = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = r.stdout || '';
  return trim ? out.trim() : out;
}

// The mechanical snapshot. Same shape as session-trail's `observe`, and it reuses that file's
// parsePorcelain for the same reason: the leading-space bug it documents corrupted the FIRST
// filename in every record it wrote, which in THIS tool would mean a file the delegate touched
// being reported under a name that does not exist.
function snapshot() {
  // `-uall` is load-bearing, not a detail. Git collapses a wholly-untracked directory to a single
  // `?? dir/` entry, so a delegate that creates a new directory and writes six files into it would
  // be reported as having touched ONE path whose name is not any of them. For a tool whose entire
  // job is "show me what it actually wrote", that is the failure mode that matters most — caught on
  // the first live run, where a written file was invisible behind its new parent directory.
  const { dirty, untracked } = parsePorcelain(
    git(['status', '--porcelain', '--untracked-files=all'], { trim: false })
  );
  return {
    head: git(['rev-parse', 'HEAD']),
    files: new Set([...dirty, ...untracked]),
  };
}

function parseArgs(argv) {
  const out = { tier: null, brief: null, label: null, dryRun: false, timeoutMs: 45 * 60 * 1000 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--tier') out.tier = need(argv[++i], '--tier');
    else if (a === '--brief') out.brief = need(argv[++i], '--brief');
    else if (a === '--label') out.label = need(argv[++i], '--label');
    else if (a === '--timeout-min') out.timeoutMs = Number(need(argv[++i], '--timeout-min')) * 60 * 1000;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else die(`unknown argument: ${a}`);
  }
  return out;
}

function help() {
  const tiers = Object.entries(CODEX_BUILD_TIERS)
    .map(([k, v]) => `    ${k.padEnd(9)} ${v.model} (effort: ${v.effort})`)
    .join('\n');
  process.stdout.write(`codex-task — delegate a build task to Codex, then show what it did to the tree

  --tier <name>       which model tier to route to (required)
  --brief <file>      the task brief, as a markdown file (required)
  --label <name>      a short name for the run, used in the transcript filename
  --timeout-min <n>   hard timeout in minutes (default 45)
  --dry-run           print the resolved model + brief and exit without running

Tiers:
${tiers}

The transcript is a CLAIM. The git diff printed after it is the EVIDENCE. Read the second one.
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return help();
  if (!args.tier) die('--tier is required (see --help for the table).');
  if (!args.brief) die('--brief <file> is required.');

  const briefPath = join(ROOT, args.brief);
  const resolvedBrief = existsSync(briefPath) ? briefPath : args.brief;
  if (!existsSync(resolvedBrief)) die(`brief not found: ${args.brief}`);
  const brief = readFileSync(resolvedBrief, 'utf8').trim();
  if (!brief) die(`brief at ${args.brief} is empty.`);

  const { model, effort } = resolveCodexTier(args.tier);

  if (args.dryRun) {
    process.stdout.write(`tier=${args.tier}  model=${model}  effort=${effort}\n`);
    process.stdout.write(`brief (${brief.length} chars) from ${args.brief}\n`);
    return;
  }

  ensureCmd('codex', 'codex not found — install the Codex CLI, then `codex login`.');

  const before = snapshot();
  const started = Date.now();
  process.stderr.write(`▸ codex-task: tier=${args.tier} model=${model} effort=${effort}\n`);
  process.stderr.write(`▸ brief: ${args.brief} (${brief.length} chars)\n`);

  // The brief rides on STDIN, not argv. codex appends stdin as a `<stdin>` block, and argv has an
  // OS size limit that a real story brief can approach — the constraint that forces agy's reviews
  // onto a code-only subset. Passing it on stdin sidesteps that entirely for this rail.
  //
  // `--sandbox workspace-write` is the point of the tool: the delegate must be able to write files
  // in the repo. It cannot reach outside the workspace, and network stays off by codex's default.
  // Approvals are set to `never` so the run is headless — which is exactly why the git snapshot
  // below is not optional.
  const r = spawnSync(
    'codex',
    [
      'exec',
      '--model',
      model,
      '-c',
      `model_reasoning_effort=${effort}`,
      '--sandbox',
      'workspace-write',
      '-c',
      'approval_policy="never"',
      '-',
    ],
    {
      cwd: ROOT,
      input: brief,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      timeout: args.timeoutMs,
    }
  );

  const elapsed = Math.round((Date.now() - started) / 1000);
  const transcript = `${r.stdout || ''}\n${r.stderr || ''}`.trim();

  const outDir = join(ROOT, '.codex-runs');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const transcriptFile = join(outDir, `${stamp}-${args.label || args.tier}.md`);
  writeFileSync(
    transcriptFile,
    `# codex-task run\n\n- tier: ${args.tier}\n- model: ${model} (effort ${effort})\n` +
      `- brief: ${args.brief}\n- elapsed: ${elapsed}s\n- exit: ${r.status}\n\n` +
      `> This transcript is what the delegate SAID. It is not evidence that anything was built.\n\n` +
      `---\n\n${transcript}\n`
  );

  const after = snapshot();

  // ── The evidence half ────────────────────────────────────────────────────────────────────────
  const touched = [...after.files].filter((f) => !before.files.has(f)).sort();
  const alreadyDirty = [...after.files].filter((f) => before.files.has(f)).sort();
  const headMoved = before.head !== after.head;

  process.stdout.write('\n═══ CODEX-TASK — what the delegate SAID ═══\n\n');
  process.stdout.write(`  transcript: ${transcriptFile.replace(ROOT + '/', '')}\n`);
  process.stdout.write(`  exit ${r.status} after ${elapsed}s`);
  if (r.error) process.stdout.write(`  (spawn error: ${r.error.message})`);
  process.stdout.write('\n');
  const tail = transcript.split('\n').filter(Boolean).slice(-12).join('\n  ');
  if (tail) process.stdout.write(`\n  …last lines:\n  ${tail}\n`);

  process.stdout.write('\n═══ CODEX-TASK — what the TREE shows (this is the evidence) ═══\n\n');
  if (headMoved) {
    // A delegate that commits is not automatically wrong, but it IS a thing the architect must
    // know before reading a diff against HEAD — the diff would no longer contain its work.
    process.stdout.write(`  ⚠ HEAD MOVED: ${before.head.slice(0, 8)} → ${after.head.slice(0, 8)}\n`);
    process.stdout.write(`    The delegate committed. \`git diff HEAD\` will NOT show its work —\n`);
    process.stdout.write(`    review with \`git diff ${before.head.slice(0, 8)}..HEAD\` instead.\n\n`);
  }
  if (touched.length === 0 && alreadyDirty.length === 0 && !headMoved) {
    process.stdout.write('  NOTHING CHANGED. The delegate wrote no files.\n');
    process.stdout.write('  If its transcript claims otherwise, the transcript is wrong.\n');
  } else {
    if (touched.length > 0) {
      process.stdout.write(`  files it changed (${touched.length}):\n`);
      for (const f of touched) process.stdout.write(`    + ${f}\n`);
    }
    if (alreadyDirty.length > 0) {
      process.stdout.write(`\n  files ALREADY dirty before the run (${alreadyDirty.length}) —\n`);
      process.stdout.write(`  its edits, yours, or both are mixed together here:\n`);
      for (const f of alreadyDirty) process.stdout.write(`    ? ${f}\n`);
    }
  }

  process.stdout.write('\n─── before you trust any of this ───\n');
  process.stdout.write(`  1. Read the diff for files the brief had NO business touching. A delegate that\n`);
  process.stdout.write(`     mutates code as part of its method can die before reverting (LEARNINGS: a\n`);
  process.stdout.write(
    `     security mutation shipped exactly this way, with a transcript reading as progress).\n`
  );
  process.stdout.write(
    `  2. Run the gate yourself: npm run typecheck && npm run lint && npm run test:unit\n`
  );
  process.stdout.write(
    `  3. A non-zero exit above with files written means a PARTIAL apply, not a no-op.\n\n`
  );

  // Exit non-zero when codex did, so a caller scripting this rail sees the failure. The evidence
  // section still printed above — a failed run that wrote half a story is the case most worth seeing.
  process.exit(r.status === 0 ? 0 : 1);
}

main();
