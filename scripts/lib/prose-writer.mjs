// prose-writer.mjs — the one rail every prose surface in this repo writes through.
//
// ── The router (Daniel's call, confirmed 2026-07-26) ──────────────────────────────────────────
// **Devin is the DEDICATED prose writer; agy is the fallback; Codex is the last-resort third pool.**
//
// This is a division of LABOUR, not a ranking. Codex and agy are the primary code reviewers and the
// builders lean on them, so their quota is the scarce resource; Devin was installed as a third review
// seat and sat mostly idle. Giving Devin prose outright keeps the review quota free and lets one
// writer be specialized for the register — via commit-report.prompt.md and the accumulating
// prose-lessons.md, both plain files in the repo so the specialization survives a machine change.
//
// ── The order was briefly reversed, and that was my misdiagnosis ───────────────────────────────
// When Daniel reported the reports had lost their register, I read it as "Devin is the wrong writer"
// and put agy first. Wrong: the register never came from the router. `PROSE_MODEL` was
// `gemini-3.6-flash-high`, so agy's prose came from a Gemini model, while the accepted drafts had come
// from GPT-OSS on the occasions Gemini's quota was exhausted. The fix belonged in the model constant
// (now GPT-OSS, single, no Gemini fallback) and in the footer (which now names the model rather than
// just "agy"). Devin leads, as designed.
//
// The fallback chain is not decoration: agy and Codex carry separate quota pools, and this repo has
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
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProse, findingsToRevisionNote } from './prose-guard.mjs';
import { runAntigravity, tryCodex, hasCmd, PROSE_MODEL, AGY_ARG_LIMIT } from './cross-agent-cli.mjs';

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

  try {
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
  } finally {
    // In a `finally` so the temp dir goes even on a throw. Every draft plus every revision pass
    // allocates one, so on a busy day this is dozens of stray directories holding prompt text —
    // untidy, and the prompts can quote repo content.
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* a leftover temp dir is not worth failing a prose run over */
    }
  }
}

/** Run agy with the prose model pair. Returns the same shape as runDevin. */
export function runAgy(prompt, deps = {}) {
  const { run = runAntigravity } = deps;
  if (Buffer.byteLength(prompt, 'utf8') > AGY_ARG_LIMIT) {
    return { ok: false, text: '', error: `prompt exceeds agy's argv cap (${AGY_ARG_LIMIT / 1024} KB)` };
  }
  // `model` is captured so the posted report can name the model that actually wrote it rather than
  // just "agy". The pair is two models with materially different registers, and a silent fallback
  // between them is a change in voice that nothing used to record.
  // ONE model, not a pair — see PROSE_MODEL's note in cross-agent-cli.mjs. A model-level fallback
  // to a Gemini slug is what silently changed the register of every report, so it is deliberately
  // unavailable here. `onModel` still confirms which model answered, because a constant that has
  // rotted is exactly the failure this rail has already shipped once.
  let model = PROSE_MODEL;
  const text = run(prompt, {
    models: [PROSE_MODEL],
    soft: true,
    onModel: (m) => {
      model = m;
    },
  });
  return text
    ? { ok: true, text: text.trim(), model }
    : { ok: false, text: '', error: 'agy returned no output' };
}

export const CODEX_DIRECTIVE =
  'Follow the instructions provided on stdin exactly. Output only the finished text — no preamble, no commentary, no code fences.';

/**
 * Last-resort writer on a third independent quota pool. The material rides stdin so a large evidence
 * pack cannot hit argv limits; authentication failures are non-retryable because another identical
 * call cannot repair a lapsed login.
 */
export function runCodex(prompt, deps = {}) {
  const { run = tryCodex, directive = CODEX_DIRECTIVE } = deps;
  const result = run(directive, String(prompt));
  const text = String(result.text ?? '').trim();
  if (result.ok && text) return { ok: true, text, model: 'codex' };
  if (result.authFailed) {
    return {
      ok: false,
      text: '',
      model: 'codex',
      error: 'codex authentication has lapsed — run `codex login`',
      retryable: false,
    };
  }
  return {
    ok: false,
    text: '',
    model: 'codex',
    error: `codex returned no output${result.stderr ? `: ${String(result.stderr).trim().split('\n').at(-1)}` : ''}`,
    retryable: true,
  };
}

/**
 * Pure routing decision — which writers to try, in order.
 *
 * Separated from the I/O so the policy is pinned by a test rather than by reading the orchestration
 * below. `preferred` lets a caller force one writer (useful when diagnosing which one produced a
 * bad draft) without editing the rail.
 */
export function planWriters({ devinAvailable, agyAvailable, codexAvailable, preferred }) {
  // ORDER IS THE POLICY. Devin first — see the router note at the top of this file. Changing this
  // array changes who writes every report in the repo, so it is the one line to read.
  const all = [
    { name: 'devin', available: devinAvailable },
    { name: 'agy', available: agyAvailable },
    { name: 'codex', available: codexAvailable },
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
    codex = runCodex,
    has = hasCmd,
    guard = checkProse,
    warn = (m) => process.stderr.write(`${m}\n`),
  } = deps;

  const writers = planWriters({
    devinAvailable: has('devin'),
    agyAvailable: has('agy'),
    codexAvailable: has('codex'),
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

  const runners = { devin, agy, codex };
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
      // quality gap between writers is visible in the output. A genuine outage still fails on the
      // second attempt and demotes as before, so this buys resilience without hiding a real break.
      if (!result.ok && (result.retryable || /no output|empty stdout/i.test(result.error ?? ''))) {
        warn(`⚠ ${name} returned empty — retrying once before falling back.`);
        attempts++;
        result = runners[name](currentPrompt);
      }

      if (!result.ok) {
        warn(`⚠ ${name} failed: ${result.error} — trying the next writer.`);
        break; // a broken writer will not be fixed by a revision note
      }

      const verdict = guard(result.text, evidence);
      // `model` rides along when the writer reported one (agy does; devin is a single model, so its
      // own name IS the model). The channel footer names it — see commit-report's attribution.
      if (verdict.ok)
        return {
          ok: true,
          text: result.text,
          writer: name,
          model: result.model ?? name,
          guard: verdict,
          attempts,
        };

      // Keep the LATEST draft as the fallback, not the first. Cross-review caught the original
      // `if (!best)` here: it pinned `best` to the pass-0 draft, so when the revision pass also
      // tripped a rule we returned the UNREVISED text and threw away the one written specifically
      // to address the findings. The revision is strictly better informed even when it is still
      // imperfect, and returning the older draft would make the retry pass pure cost.
      best = { text: result.text, writer: name, model: result.model ?? name, guard: verdict };
      warn(`⚠ ${name} draft rejected (${verdict.findings.map((f) => f.code).join(', ')}) — revising.`);
      currentPrompt = `${prompt}\n\n---\n\n## Your previous draft\n\n${result.text}\n\n---\n\n${findingsToRevisionNote(verdict.findings)}`;
    }
  }

  if (best) return { ok: false, ...best, attempts };
  return { ok: false, text: '', writer: null, guard: null, attempts, error: 'every writer failed' };
}
