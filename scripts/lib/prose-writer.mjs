// prose-writer.mjs — the one rail every prose surface in this repo writes through.
//
// ── The router (Daniel's call, 2026-07-25) ────────────────────────────────────────────────────
// Devin is CHIEF PROSE WRITER; agy is the automatic fallback. Devin was already installed as a
// third code-review seat and sat mostly idle, while prose was the thing we were paying a cheap
// model to guess at. Promoting it costs nothing we were not already paying for, and it is the
// stronger writer of the two.
//
// The fallback is not decoration: agy carries a genuinely separate quota pool, and this repo has
// already been bitten by a single-provider rail going quiet mid-session (Roadmap/LEARNINGS.md —
// wire the fallback to the CONDITION, not to one of its signatures).
//
// ── Guard-and-retry, not guard-and-fail ───────────────────────────────────────────────────────
// Every draft, from either writer, goes through the pure `prose-guard` checks. A rejected draft is
// not discarded — the findings are handed back as a numbered revision note and the writer tries
// again. Only after that does a draft reach a human, and it arrives labelled with which writer
// produced it and whether the guard passed it clean.
//
// This is the piece that makes "it improves as we go" true rather than aspirational: every new
// failure shape observed in a real draft becomes a guard rule plus a line in the lessons file, so
// the same mistake cannot recur silently.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProse, findingsToRevisionNote } from './prose-guard.mjs';
import {
  runAntigravity,
  hasCmd,
  PROSE_MODEL,
  PROSE_FALLBACK_MODEL,
  AGY_ARG_LIMIT,
} from './cross-agent-cli.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LESSONS_PATH = join(__dirname, '..', 'prose-lessons.md');

/**
 * The accumulating lessons file, injected into every prompt.
 *
 * This is the "fine-tune it as we go" mechanism, and it is deliberately a PLAIN MARKDOWN FILE in
 * the repo rather than a model-side tuning artifact or a local CLI rule blob. Three reasons: it is
 * reviewable in a diff, it applies to whichever writer is on duty, and it survives a machine
 * change. `devin rules` would bind the specialization to one laptop.
 */
export function loadLessons(read = readFileSync) {
  if (!existsSync(LESSONS_PATH)) return '';
  const raw = read(LESSONS_PATH, 'utf8');
  const cut = raw.indexOf('\n---\n');
  return (cut === -1 ? raw : raw.slice(cut + 5)).trim();
}

/** Assemble the full writer prompt: house style → accumulated lessons → the task and its data. */
export function buildWriterPrompt({ style, lessons, task }) {
  const parts = [style.trim()];
  if (lessons) {
    parts.push(
      '\n\n## Lessons from previous drafts — these are corrections, apply every one\n\n' +
        'Each line below is a mistake a previous draft actually made and a human had to catch.\n\n' +
        lessons
    );
  }
  parts.push(`\n\n${task.trim()}\n`);
  return parts.join('');
}

// ── Writers ─────────────────────────────────────────────────────────────────────────────────

/**
 * Run Devin non-interactively.
 *
 * `--prompt-file` rather than argv: it sidesteps the ~256 KB argv cap that constrains the agy path
 * entirely, which matters because the standup/weekly surfaces feed in a lot of source material.
 * `--permission-mode auto` keeps it read-only — a prose writer has no business editing the repo.
 */
export function runDevin(prompt, deps = {}) {
  const { spawn = spawnSync, mkTemp = mkdtempSync, write = writeFileSync } = deps;
  const dir = mkTemp(join(tmpdir(), 'gb-prose-'));
  const file = join(dir, 'prompt.md');
  write(file, prompt, 'utf8');

  const r = spawn('devin', ['--print', '--permission-mode', 'auto', '--prompt-file', file], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    input: '',
  });

  if (r.error) return { ok: false, text: '', error: r.error.message };
  const text = (r.stdout || '').trim();
  if (r.status !== 0) {
    const last = (r.stderr || '').trim().split('\n').filter(Boolean).pop() || `exit ${r.status}`;
    return { ok: false, text, error: last };
  }
  // Empty output on a zero exit is FAILURE, not success — the same young-CLI contract trap agy
  // taught this repo (LEARNINGS: treat empty output as failure, never absorb it silently).
  if (!text) return { ok: false, text: '', error: 'devin returned no output (exit 0, empty stdout)' };
  return { ok: true, text };
}

/** Run agy with the prose model pair. Returns the same shape as runDevin. */
export function runAgy(prompt, deps = {}) {
  const { run = runAntigravity } = deps;
  if (Buffer.byteLength(prompt, 'utf8') > AGY_ARG_LIMIT) {
    return { ok: false, text: '', error: `prompt exceeds agy's argv cap (${AGY_ARG_LIMIT / 1024} KB)` };
  }
  const text = run(prompt, { models: [PROSE_MODEL, PROSE_FALLBACK_MODEL], soft: true });
  return text ? { ok: true, text: text.trim() } : { ok: false, text: '', error: 'agy returned no output' };
}

/**
 * Pure routing decision — which writers to try, in order.
 *
 * Separated from the I/O so the policy is pinned by a test rather than by reading the orchestration
 * below. `preferred` lets a caller force one writer (useful when diagnosing which one produced a
 * bad draft) without editing the rail.
 */
export function planWriters({ devinAvailable, agyAvailable, preferred }) {
  const all = [
    { name: 'devin', available: devinAvailable },
    { name: 'agy', available: agyAvailable },
  ];
  if (preferred) {
    const chosen = all.find((w) => w.name === preferred);
    return chosen?.available ? [preferred] : [];
  }
  return all.filter((w) => w.available).map((w) => w.name);
}

/**
 * Write prose: try each available writer, guard every draft, retry once with the findings.
 *
 * Returns `{ ok, text, writer, guard, attempts }`. `guard.ok === false` on a returned draft means
 * both attempts still tripped a rule — the draft is handed back anyway, WITH its findings, because
 * a flawed draft a human can see and fix beats a hard failure that produces nothing. The caller is
 * responsible for surfacing `guard` rather than quietly posting the text.
 */
export function writeProse({ prompt, evidence, preferred }, deps = {}) {
  const {
    devin = runDevin,
    agy = runAgy,
    has = hasCmd,
    guard = checkProse,
    warn = (m) => process.stderr.write(`${m}\n`),
  } = deps;

  const writers = planWriters({
    devinAvailable: has('devin'),
    agyAvailable: has('agy'),
    preferred,
  });
  if (writers.length === 0) {
    return {
      ok: false,
      text: '',
      writer: null,
      guard: null,
      attempts: 0,
      error: 'no prose writer available',
    };
  }

  const runners = { devin, agy };
  let attempts = 0;
  let best = null;

  for (const name of writers) {
    let currentPrompt = prompt;

    // Two passes per writer: the draft, then one revision against the guard's findings.
    for (let pass = 0; pass < 2; pass++) {
      attempts++;
      let result = runners[name](currentPrompt);

      // ── One retry on an EMPTY response before demoting the writer ────────────────────────────
      // Observed live (2026-07-25): devin returned exit 0 with empty stdout on a 9 KB prompt, and
      // the identical prompt succeeded moments later — a transient, not a broken CLI. Falling
      // straight through to the fallback on that costs the better writer for no reason, and the
      // quality gap between the two is visible in the output. A genuine outage still fails on the
      // second attempt and demotes as before, so this buys resilience without hiding a real break.
      if (!result.ok && /no output|empty stdout/i.test(result.error ?? '')) {
        warn(`⚠ ${name} returned empty — retrying once before falling back.`);
        attempts++;
        result = runners[name](currentPrompt);
      }

      if (!result.ok) {
        warn(`⚠ ${name} failed: ${result.error} — trying the next writer.`);
        break; // a broken writer will not be fixed by a revision note
      }

      const verdict = guard(result.text, evidence);
      if (verdict.ok) return { ok: true, text: result.text, writer: name, guard: verdict, attempts };

      // Keep the first draft as a fallback so a run that never satisfies the guard still returns
      // something a human can read and correct, rather than nothing at all.
      if (!best) best = { text: result.text, writer: name, guard: verdict };
      warn(`⚠ ${name} draft rejected (${verdict.findings.map((f) => f.code).join(', ')}) — revising.`);
      currentPrompt = `${prompt}\n\n---\n\n## Your previous draft\n\n${result.text}\n\n---\n\n${findingsToRevisionNote(verdict.findings)}`;
    }
  }

  if (best) return { ok: false, ...best, attempts };
  return { ok: false, text: '', writer: null, guard: null, attempts, error: 'every writer failed' };
}
