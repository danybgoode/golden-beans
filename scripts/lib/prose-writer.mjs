// prose-writer.mjs — the one rail every LOCAL prose surface in this repo writes through.
//
// PORTED from ~/dobby/golden-beans/scripts/lib/prose-writer.mjs (2026-07-26). What is NOT ported:
// golden-beans carries its own devin/agy spawn code because it is a separate repo. We already have
// that plumbing in `scripts/lib/cross-agent-cli.mjs`, so this file is a THIN adapter over it — a
// second spawn path would be a second place for the argv cap, the empty-output contract and the
// agy version pin to drift (sprint-1 build contract).
//
// Scope note (README D1): this is the LOCAL backend, and it is local by NECESSITY, not by choice.
// Every writer below is an interactive CLI with no headless auth — `hasCmd` returns false for all
// three inside a Claude Routine or a GitHub Actions runner — so the routines write their prose
// in-context and call the same pure guard as a separate `--post` step (D2). The guard, the persona
// and the lessons file are shared; only the writers are local-only.
//
// This is why the merge report cannot move to CI. Writing prose in a runner would need a paid
// hosted API key, and using the cheap/free model CLIs is the point of the rail — see
// Roadmap/09-platform-infra/prose-rail-headless/README.md, which records the rejected design so
// nobody re-derives it.
//
// ── The router (README D1, and the product owner's call, 2026-07-26) ──────────────────────
// **devin → agy (`gpt-oss-120b-medium`) → codex.** devin is the DEDICATED prose writer; agy is the
// fallback; codex is the last resort, added 2026-07-28.
//
// Why a third seat: devin refused 6 of 25 runs with "high demand for this model". The devin → agy
// fallback handled that correctly every time — but two pools is one bad day from no report, and agy
// shares its quota with the review layer. codex is last precisely BECAUSE it is the primary
// reviewer: prose only draws on that quota once both dedicated writers have failed.
//
// This is a division of LABOUR, not a ranking. Codex and agy are the primary code reviewers and the
// builders lean on them, so their quota is the scarce resource — and this repo has already had the
// cross-family review layer go fully dark mid-epic when codex and agy were capped in the same
// session (2026-07-24, the reason devin was installed at all). Devin was added as a third review
// seat and sits mostly idle. Giving devin prose outright keeps the review quota free.
//
// The fallbacks are not decoration: agy and codex carry genuinely separate quota pools, and this
// repo has already been bitten by a single-provider rail going quiet mid-session (LEARNINGS — wire
// the fallback to the CONDITION, not to one of its signatures).
//
// ── PROSE_MODEL: one model, and deliberately not a Gemini one ──────────────────────────────────
// `gemini-3.5-flash-high` was `prose-draft.mjs`'s default until this sprint. That is the EXACT
// constant golden-beans identified as having silently destroyed the register of every report it
// wrote: the drafts people accepted had come from GPT-OSS, on the occasions Gemini's quota was
// exhausted and the pair fell through. The router was blamed and briefly reversed; the router was
// never the problem. The fix belongs in the model constant, so:
//   • ONE model. No model-level fallback, because a silent fall-through between two models with
//     materially different registers is a change of voice that nothing records.
//   • NOT a Gemini slug. If a future reader is about to "restore the fallback for resilience":
//     resilience already exists at the WRITER level (devin → agy → codex, three separate pools). A
//     second model inside the agy path buys nothing and costs the register.
//
// ── Guard-and-retry, not guard-and-fail (README D3) ───────────────────────────────────────────
// Every draft, from any writer, goes through the pure `prose-guard` checks. A rejected draft is
// not discarded — the findings are handed back as a numbered revision note and the writer tries
// again. Only after that does a draft reach a human, and it arrives labelled with which writer and
// which model produced it and whether the guard passed it clean. A flagged report a human can
// correct beats a missing one.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findingsToRevisionNote, judgeProse } from './prose-guard.mjs';
import { loadReportingConfig, ReportingConfigError } from './reporting-config.mjs';
import {
  runAntigravity,
  runDevin,
  tryCodex,
  hasCmd,
  loadPromptBody,
  AGY_ARG_LIMIT,
} from './cross-agent-cli.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, '..');
export const LESSONS_PATH = join(SCRIPTS_DIR, 'prose-lessons.md');
export const PROSE_DIR = join(SCRIPTS_DIR, 'prose');
export const PERSONA_PATH = join(PROSE_DIR, 'cpo-persona.md');

/** Per-surface task files (README D5). Plain files so both backends read the same words. */
export const SURFACES = ['standup', 'weekly', 'internal'];

// Env-overridable so a diagnosis run can pin a different model deliberately and visibly. That is a
// different thing from a hardcoded second model nobody notices firing — see the header.
export const PROSE_MODEL = process.env.PROSE_MODEL || 'gpt-oss-120b-medium';

/**
 * The accumulating lessons file, injected into every prompt on BOTH backends.
 *
 * This is the "it improves as we go" mechanism, and it is deliberately a PLAIN MARKDOWN FILE in the
 * repo rather than a model-side tuning artifact or a local CLI rule blob. Three reasons: it is
 * reviewable in a diff, it applies to whichever writer is on duty, and it survives a machine change
 * (D5 — `devin rules` would bind the specialization to one laptop).
 *
 * Not `loadPromptBody`: that one `die()`s on a missing or empty file, which is right for a prompt
 * the run cannot proceed without. An absent lessons file is a legitimate state (a fresh clone, a
 * deliberate reset) and must degrade to "no lessons", never kill a report.
 */
export function loadLessons(deps = {}) {
  const { read = readFileSync, exists = existsSync, path = LESSONS_PATH } = deps;
  if (!exists(path)) return '';
  const raw = read(path, 'utf8');
  const cut = raw.indexOf('\n---\n');
  return (cut === -1 ? raw : raw.slice(cut + 5)).trim();
}

/** The shared CPO register (D5). Fatal if missing — a report without the persona is not the artifact. */
export function loadPersona(load = loadPromptBody) {
  return load(PERSONA_PATH);
}

/** The per-surface task block (D5): audience, altitude, length budget, what "done" looks like. */
export function loadTask(surface, load = loadPromptBody) {
  return load(join(PROSE_DIR, `${surface}.task.md`));
}

/** Assemble the full writer prompt: house style → accumulated lessons → the task and its data. */
export function buildWriterPrompt({ style, lessons, task }) {
  const parts = [String(style).trim()];
  if (lessons) {
    parts.push(
      '\n\n## Lessons from previous drafts — these are corrections, apply every one\n\n' +
        'Each line below is a mistake a previous draft actually made and a human had to catch.\n\n' +
        lessons
    );
  }
  parts.push(`\n\n${String(task).trim()}\n`);
  return parts.join('');
}

// ── Writers ─────────────────────────────────────────────────────────────────────────────────
//
// SIGNATURE ADAPTATION, and it is the one thing to get right in this file. golden-beans' runners
// return `{ ok, text, error }`. OUR `runDevin`/`runAntigravity` (cross-agent-cli.mjs) return a
// STRING, or `null` when passed `{ soft: true }` — and without `soft` they `die()` the process.
// So: always pass `soft: true`, and treat a FALSY return as failure. Reading a falsy return as
// success would make every capped, unauthenticated or crashed writer look like a clean draft, and
// the guard would then be checking an empty string.

/**
 * Draft with devin. `runDevin` already rides `--prompt-file`, so there is no argv cap on this path
 * — which is why devin leads on the standup/weekly surfaces that feed in a lot of source material.
 *
 * `retryable: true` unconditionally, and that is a DELIBERATE deviation from golden-beans. Its
 * runner distinguishes "exit 0, empty stdout" (a measured transient, worth one retry) from a hard
 * spawn/exit failure; ours collapses every failure to `null` with the reason printed to stderr and
 * lost to the caller. Given `planWriters` has already confirmed the binary exists, what remains —
 * a quota cap, an auth lapse, a transient empty response — all surface here as exit-0-with-nothing
 * or a non-zero exit, and all are plausibly transient. A genuine outage still fails the second
 * attempt and demotes as before, so this costs one extra spawn on a real break and preserves the
 * measured fix. The alternative (never retry) throws away the better writer for a hiccup.
 */
export function draftWithDevin(prompt, deps = {}) {
  const { run = runDevin } = deps;
  const text = run(prompt, { soft: true });
  return text
    ? { ok: true, text: String(text).trim(), model: 'devin' }
    : {
        ok: false,
        text: '',
        model: 'devin',
        error: 'devin returned no output (quota cap, auth lapse, or a transient empty response)',
        retryable: true,
      };
}

/**
 * Draft with agy on the single prose model.
 *
 * The argv cap is checked HERE rather than left to `runAntigravity`, for one reason: it must be
 * marked non-retryable. A second identical attempt cannot shrink the prompt, so retrying it is pure
 * latency — and worse, it delays the fall-through to devin, which has no cap at all and would have
 * succeeded.
 *
 * No `onModel` callback (golden-beans has one) because there is nothing to report: the model chain
 * is one entry long, so the model that answered is `PROSE_MODEL` by construction. That is a
 * property of the single-model policy above — if anyone re-adds a second model, this attribution
 * silently starts lying, which is the second reason the policy is worth keeping.
 */
export function draftWithAgy(prompt, deps = {}) {
  const { run = runAntigravity, limit = AGY_ARG_LIMIT } = deps;
  if (Buffer.byteLength(prompt, 'utf8') > limit) {
    return {
      ok: false,
      text: '',
      model: PROSE_MODEL,
      error: `prompt exceeds agy's argv cap (${Math.round(limit / 1024)} KB) — agy takes the prompt in argv, not stdin`,
      retryable: false,
    };
  }
  const text = run(prompt, { models: [PROSE_MODEL], soft: true });
  return text
    ? { ok: true, text: String(text).trim(), model: PROSE_MODEL }
    : {
        ok: false,
        text: '',
        model: PROSE_MODEL,
        error: `agy returned no output for "${PROSE_MODEL}" (likely a quota cap)`,
        retryable: true,
      };
}

// ── The THIRD writer: codex (2026-07) ─────────────────────────────────────────────────────────
//
// Added because devin is the flakiest link in the rail, not a hypothetical one: the merge-report log
// shows `Permission denied: We're currently facing high demand for this model` on 6 of 25 runs.
// devin → agy already handled that correctly (the log has agy carrying a report devin refused), but
// two writers means one bad day away from no report at all — and agy shares its quota with the
// cross-family review layer, which has already gone fully dark mid-epic when codex and agy were
// capped in the same session.
//
// codex is the natural third seat: it is already installed, already wrapped in cross-agent-cli, and
// carries a THIRD independent quota pool. It sits LAST because it is the primary code REVIEWER —
// the review rail's quota is the scarce resource, and prose should only reach for it when both
// dedicated writers have failed.
//
// ── Why the prompt goes on STDIN ──────────────────────────────────────────────────────────────
// `execCodex(prompt, stdin)` puts `prompt` in ARGV, which is the exact cap that already bites agy
// (`draftWithAgy` refuses oversized prompts non-retryably for this reason). A prose prompt carries
// the persona, the accumulated lessons and a full evidence pack, so it is precisely the kind of
// payload that overflows argv. codex is designed to take its context on stdin, so the body goes
// there and argv carries only a short constant directive — no cap to hit, and nothing to guard.

/** The argv half of the codex call: a fixed, tiny directive. The real prompt rides stdin (see above),
 * so this string must never grow to include the material — that would reintroduce the argv cap. */
export const CODEX_DIRECTIVE =
  'Follow the instructions provided on stdin exactly. Output only the finished text — no preamble, no commentary, no code fences.';

/**
 * Draft with codex. Thin adapter over `tryCodex`, which is already the structured, never-dies
 * variant — it separates an AUTH lapse and a STALE CLI from an ordinary failure, and that
 * distinction is the whole reason to use it here rather than `runCodex`.
 *
 * **Auth lapse and stale CLI are NON-retryable.** Both mean codex genuinely cannot run on this
 * machine, and a second identical attempt cannot log it in or upgrade it — retrying is pure latency
 * on the last writer in the chain, which is the worst place to spend it. Everything else (a cap, a
 * transient empty response) gets the one retry the rail already gives. Same reasoning as
 * `draftWithAgy`'s oversized-prompt path: retry the recoverable, demote the rest.
 */
export function draftWithCodex(prompt, deps = {}) {
  const { run = tryCodex, directive = CODEX_DIRECTIVE } = deps;
  const r = run(directive, String(prompt));

  // TRIM BEFORE testing for emptiness — a whitespace-only stdout is truthy, so checking `r.text`
  // raw would return `ok: true` with an empty draft and hand the guard "" to approve.
  const text = String(r.text ?? '').trim();
  if (r.ok && text) return { ok: true, text, model: 'codex' };

  // Exit 0 with empty stdout is a real, observed codex failure mode (the same one devin has), so
  // `ok` alone is not enough — an empty draft must never read as success or the guard checks "".
  if (r.authFailed) {
    return { ok: false, text: '', model: 'codex', error: 'codex auth has lapsed — run `codex login`', retryable: false };
  }
  if (r.cliOutdated) {
    return { ok: false, text: '', model: 'codex', error: 'codex CLI is too old for its model — run `node scripts/cross-agent-doctor.mjs codex`', retryable: false };
  }
  return {
    ok: false,
    text: '',
    model: 'codex',
    error: `codex returned no output (quota cap or a transient empty response)${r.stderr ? `: ${String(r.stderr).trim().split('\n').pop()}` : ''}`,
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
  //
  // codex sits LAST on purpose: it is the primary code REVIEWER, and the review layer's quota is
  // the scarce resource here (codex and agy have already gone dark together mid-epic). Prose only
  // reaches for it once both dedicated writers have failed — which the log says does happen, so a
  // third independent pool is the difference between a late report and no report.
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
 * Returns `{ ok, text, writer, model, guard, attempts }`. `guard.ok === false` on a returned draft
 * means both passes still tripped a rule — the draft is handed back anyway, WITH its findings,
 * because a flawed draft a human can see and fix beats a hard failure that produces nothing (D3).
 * The caller is responsible for SURFACING `guard` rather than quietly publishing the text.
 */
// The project's own stack names for the prose guard (reporting.config.json → prose.extraBannedToolNames),
// applied HERE so every caller of writeProse gets them — not just the ones that remember to pass them.
// Found in review of the origin project's migration: the names moved from the guard's built-in list to
// config, only the standup and weekly recap passed them back in, and the merge report (which posts on
// every merge) silently stopped blocking "Clerk"/"Cloud Run". A project with no reporting config has no
// extra names — that is "none configured", not an error, since prose-draft runs without one.
export function projectBannedToolNames({ load = loadReportingConfig } = {}) {
  try {
    return load().prose.extraBannedToolNames;
  } catch (e) {
    if (e instanceof ReportingConfigError) return [];
    throw e;
  }
}

// async since jev-semantic-guards S3.2: the default guard is `judgeProse`, which may ask Jev. An injected
// `guard` may still be synchronous — it is awaited either way.
export async function writeProse({ prompt, evidence, preferred }, deps = {}) {
  const {
    devin = draftWithDevin,
    agy = draftWithAgy,
    codex = draftWithCodex,
    has = hasCmd,
    guard = judgeProse,
    warn = (m) => process.stderr.write(`${m}\n`),
    extraBannedToolNames = projectBannedToolNames,
  } = deps;
  // A caller-supplied list wins; otherwise the project's configured one. Resolved once per write.
  evidence = { ...evidence, extraBannedToolNames: evidence?.extraBannedToolNames ?? extraBannedToolNames() };

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
      model: null,
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

      // ── One retry on a RETRYABLE failure before demoting the writer ──────────────────────────
      // Observed live at golden-beans (2026-07-25): devin returned exit 0 with empty stdout on a
      // 9 KB prompt, and the identical prompt succeeded moments later — a transient, not a broken
      // CLI. Falling straight through to the fallback on that costs the better writer for no
      // reason. A genuine outage still fails on the second attempt and demotes as before, so this
      // buys resilience without hiding a real break. An oversized prompt is NOT retryable: a second
      // identical attempt cannot shrink it.
      if (!result.ok && result.retryable) {
        warn(`⚠ ${name}: ${result.error} — retrying once before falling back.`);
        attempts++;
        result = runners[name](currentPrompt);
      }

      if (!result.ok) {
        warn(`⚠ ${name} failed: ${result.error} — trying the next writer.`);
        break; // a broken writer will not be fixed by a revision note
      }

      const verdict = await guard(result.text, evidence);
      if (verdict.ok)
        return {
          ok: true,
          text: result.text,
          writer: name,
          model: result.model ?? name,
          guard: verdict,
          attempts,
        };

      // Keep the LATEST draft as the fallback, not the first. golden-beans' cross-review caught the
      // original `if (!best)` here: it pinned `best` to the pass-0 draft, so when the revision pass
      // also tripped a rule we returned the UNREVISED text and threw away the one written
      // specifically to address the findings. The revision is strictly better informed even when it
      // is still imperfect, and returning the older draft would make the retry pass pure cost.
      best = { text: result.text, writer: name, model: result.model ?? name, guard: verdict };
      warn(`⚠ ${name} draft rejected (${verdict.findings.map((f) => f.code).join(', ')}) — revising.`);
      currentPrompt = `${prompt}\n\n---\n\n## Your previous draft\n\n${result.text}\n\n---\n\n${findingsToRevisionNote(verdict.findings)}`;
    }
  }

  if (best) return { ok: false, ...best, attempts };
  return {
    ok: false,
    text: '',
    writer: null,
    model: null,
    guard: null,
    attempts,
    error: 'every writer failed',
  };
}
