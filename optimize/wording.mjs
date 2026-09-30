#!/usr/bin/env node
// optimize/wording.mjs — does a new wording of ONE Jev question decide better than the current one, held out?
// (compiled-prompts S2.1, D6)
//
//   node optimize/wording.mjs --rail prose --question flag-state-claim --candidates optimize/candidates/flag-state-claim.json
//   … --yes        send without the confirmation prompt (a script, or a re-run you have already priced)
//
// What it does, in order:
//   1. Counts what it would send: each candidate × the sentences that family is actually asked about (the judge's own
//      evidence gates decide), minus what is already cached. Prints the count and asks before sending anything.
//   2. Asks each candidate LIVE once per eligible sentence, one request per draft, and caches the answers by the
//      wording's hash (optimize/.cache/wording/<hash>.json). A re-run is free; a failed draft is simply asked again.
//      The CURRENT wording is never asked: the committed recordings are its answers, which the D3 stamp proves.
//   3. Scores every wording through the REAL `judgeProse` at the configured `claim` threshold — the other families
//      replayed from the recordings, only the question under test swapped — on the spike's 5 seeded folds
//      (optimize/folds.json, written by refit.py).
//   4. Writes optimize/reports/wording-<question>-<date>.{md,json}: held-out right per fold and in total, family
//      accuracy, decided counts, and the D6 verdict.
//
// D6, the win rule: a candidate WINS only if its held-out total beats the current wording's by at least 2 drafts AND it
// is worse on no more than one fold. A one-draft margin is a TIE. Nothing is fitted at the fixed threshold, so the
// guard against tuning on the test set is that candidates are committed BEFORE the run. The per-fold refit column
// (the best shared threshold on four folds, scored on the fifth) is information, never the verdict.
//
// Adoption is never automatic: a winner is a separate PR that edits scripts/lib/jev-questions/prose.json (with its
// measured block) and re-records with `jev-eval --live`, merged with the product owner's OK.
//
// Dev-only (compiled-prompts D4). Zero deps — Node 18+.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES_PATH, liveRefusal, loadRails, replayAsk } from '../scripts/jev-eval.mjs';
import { askJev, loadJevConfig, readApiKey, repoRoot } from '../scripts/lib/jev.mjs';
import { loadQuestions, questionHash } from '../scripts/lib/jev-questions.mjs';
import { proseQuestions, proseUnits } from '../scripts/lib/prose-guard.mjs';
import { GRID, railConfig } from './extract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const FOLDS_PATH = join(__dirname, 'folds.json');
export const CACHE_DIR = join(__dirname, '.cache', 'wording');
export const REPORTS_DIR = join(__dirname, 'reports');
/** D6: a win by fewer drafts than this is a tie. */
export const WIN_MARGIN = 2;
/** D6: a winner may be worse than the current wording on at most this many folds. */
export const MAX_WORSE_FOLDS = 1;
/** Requests in flight at once. */
export const CONCURRENCY = 4;

const usage =
  'usage: node optimize/wording.mjs --rail prose --question <family id or code> --candidates <file> [--yes]';

/** Pure: the flags, or { error }. */
export function parseArgs(argv) {
  const get = (f) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const known = new Set(['--rail', '--question', '--candidates', '--yes']);
  const unknown = argv.filter((a) => a.startsWith('--') && !known.has(a));
  if (unknown.length) return { error: `unknown flag ${unknown.join(', ')}\n${usage}` };
  const rail = get('--rail');
  const question = get('--question');
  const candidates = get('--candidates');
  if (!rail || !question || !candidates) return { error: usage };
  if (rail !== 'prose')
    return { error: `--rail ${rail}: only the prose rail's questions can be measured this way today` };
  return { rail, question, candidates, yes: argv.includes('--yes') };
}

/** Pure: validate a candidates file against the question it targets. Throws naming the problem. */
export function parseCandidates(raw, target) {
  const fail = (m) => {
    throw new Error(`candidates: ${m}`);
  };
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.candidates) || !raw.candidates.length)
    fail('must be { "question", "candidates": [ { name, instructions, criteria: { true, false } } ] }');
  if (raw.question !== target.id && raw.question !== target.code)
    fail(`the file is for "${raw.question}", not "${target.code}"`);
  const names = new Set();
  const hashes = new Set([questionHash(target)]);
  return raw.candidates.map((c, i) => {
    const at = `candidates[${i}]`;
    if (typeof c?.name !== 'string' || !c.name.trim() || names.has(c.name) || c.name === 'current')
      fail(`${at}.name must be unique, non-empty and not "current"`);
    names.add(c.name);
    if (typeof c.instructions !== 'string' || !c.instructions.trim()) fail(`${at}.instructions must be text`);
    const k = Object.keys(c.criteria ?? {})
      .sort()
      .join();
    if (k !== 'false,true' || typeof c.criteria.true !== 'string' || typeof c.criteria.false !== 'string')
      fail(`${at}.criteria must be exactly { true, false }, both text`);
    const q = { type: 'noul', instructions: c.instructions, criteria: c.criteria };
    const hash = questionHash(q);
    if (hashes.has(hash)) fail(`${at} ("${c.name}") is the same wording as another one`);
    hashes.add(hash);
    return { name: c.name, why: c.why ?? '', question: q, hash };
  });
}

/** The questions ONE draft is asked for the family under test — the judge's own builder, so its gates apply. */
export function draftQuestions(fx, key, question) {
  return proseQuestions(proseUnits(fx.draft), fx.evidence ?? {})
    .filter((q) => q.id.endsWith(`_${key}`))
    .map((q) => ({
      id: q.id,
      question: {
        type: 'noul',
        instructions: { sentence: q.question.instructions.sentence, question: question.instructions },
        criteria: question.criteria,
      },
    }));
}

/** Does a cached entry answer EVERY question this draft is asked now? A draft edited under the same id would not. */
export const covers = (entry, questions) =>
  Boolean(entry) && questions.every((q) => typeof entry[q.id]?.noul === 'number');

/** Pure: what is still to ask — [{ candidate, fixture, questions }] for every draft the cache does not fully cover. */
export function plan({ fixtures, key, candidates, cache }) {
  const todo = [];
  for (const c of candidates)
    for (const fx of fixtures) {
      const questions = draftQuestions(fx, key, c.question);
      if (questions.length && !covers(cache[c.hash]?.answers?.[fx.id], questions))
        todo.push({ candidate: c, fixture: fx, questions });
    }
  return todo;
}

async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

/** Ask what the plan says, filling `cache` in place. Returns the drafts Jev could not look at. */
export async function askAll({ todo, cache, ask, model, onProgress = () => {}, persist = () => {} }) {
  const failed = [];
  let done = 0;
  await pool(todo, CONCURRENCY, async ({ candidate, fixture, questions }) => {
    const r = await ask({
      state: { report_draft: String(fixture.draft) },
      questions: Object.fromEntries(questions.map((q) => [q.id, q.question])),
    });
    const answers = r.ok ? r.answers : null;
    const valid = answers && questions.every((q) => typeof answers[q.id]?.noul === 'number');
    if (!valid) failed.push(`${candidate.name}/${fixture.id}: ${r.ok ? 'an answer was missing' : r.error}`);
    else {
      const entry = (cache[candidate.hash] ??= {
        hash: candidate.hash,
        question: candidate.question,
        model,
        answers: {},
      });
      entry.answers[fixture.id] = Object.fromEntries(
        questions.map((q) => [q.id, { type: 'noul', noul: answers[q.id].noul }])
      );
    }
    onProgress(++done, todo.length);
    // Paid answers are written as they arrive, so an interrupted run keeps what it bought.
    if (done % 25 === 0) persist();
  });
  return failed;
}

/**
 * Score one wording: every fixture through the real judge, the family's answers swapped for `answersFor(fx)`.
 * Returns per-fixture { id, fold, right, familyRight, answered, maxNoul, label, stats } — stats feed the refit column.
 */
export async function scoreWording({ fixtures, folds, rails, config, key, code, answersFor, threshold }) {
  const out = [];
  const cfg = railConfig(config, 'prose', { ...config.rails.prose.thresholds, claim: threshold });
  for (const fx of fixtures) {
    // undefined = keep the recorded answers (the current wording); null = this wording has no answers for the draft.
    const swapped = answersFor(fx);
    const all = fx.recorded?.answers ?? {};
    const kept =
      swapped === undefined
        ? all
        : Object.fromEntries(Object.entries(all).filter(([id]) => !id.endsWith(`_${key}`)));
    const recorded = { model: fx.recorded?.model, answers: { ...kept, ...(swapped ?? {}) } };
    const d = await rails.prose.run(fx, {
      config: cfg,
      key: 'eval',
      log: () => {},
      ask: replayAsk(recorded),
    });
    const got = rails.prose.predicted(d);
    const want = [...fx.label].sort();
    out.push({
      id: fx.id,
      fold: folds[fx.id],
      right: JSON.stringify(got) === JSON.stringify(want),
      familyRight: got.includes(code) === want.includes(code),
      answered: !(d.fallback ?? []).includes(code) && swapped !== null,
    });
  }
  return out;
}

/** Pure: per-fold and total right counts for a scored wording. */
export function tally(rows, nFolds = 5) {
  const perFold = Array.from({ length: nFolds }, () => 0);
  for (const r of rows) if (r.right) perFold[r.fold]++;
  return {
    perFold,
    total: perFold.reduce((a, b) => a + b, 0),
    family: rows.filter((r) => r.familyRight).length,
    decided: rows.filter((r) => r.answered).length,
    n: rows.length,
  };
}

/** Pure: the D6 verdict for a candidate against the current wording. */
export function verdict(candidate, current) {
  const margin = candidate.total - current.total;
  const worseFolds = candidate.perFold.filter((v, i) => v < current.perFold[i]).length;
  if (margin >= WIN_MARGIN && worseFolds <= MAX_WORSE_FOLDS) return { verdict: 'wins', margin, worseFolds };
  if (margin >= WIN_MARGIN) return { verdict: 'unstable', margin, worseFolds };
  if (Math.abs(margin) < WIN_MARGIN) return { verdict: 'tie', margin, worseFolds };
  return { verdict: 'loses', margin, worseFolds };
}

/**
 * Information only: for each fold, the shared `claim` threshold that scores best on the other four (ties → closest
 * to the configured one), scored on the held-out fold. Never the verdict (D6).
 */
export async function refitColumn({ score, configured, nFolds = 5 }) {
  const byT = new Map();
  for (const t of [...new Set([...GRID, configured])]) byT.set(t, await score(t));
  let total = 0;
  const picks = [];
  for (let k = 0; k < nFolds; k++) {
    let best = null;
    for (const [t, rows] of byT) {
      const train = rows.filter((r) => r.fold !== k && r.right).length;
      const key = [train, -Math.abs(t - configured)];
      if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && key[1] > best.key[1]))
        best = { t, key };
    }
    picks.push(best.t);
    total += byT.get(best.t).filter((r) => r.fold === k && r.right).length;
  }
  return { total, picks };
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');

/** Pure: the Markdown report. */
export function formatReport({ question, date, model, threshold, results, sent, cached }) {
  const cur = results.find((r) => r.name === 'current');
  const lines = [
    `# Wording run — \`${question.code}\` (${question.id}), ${date}`,
    '',
    `Model \`${model}\`, claim threshold ${threshold} (configured), ${cur.tally.n} labelled prose drafts on the spike's 5 seeded ` +
      `folds (\`optimize/folds.json\`). Every wording scored through the real \`judgeProse\`, the other three families ` +
      `replayed from the recordings. Candidate answers come from the wording cache (this invocation sent ${sent} request(s); ` +
      `${cached} candidate(s) were fully cached). This file is REGENERATED on every run — commentary belongs in a sibling file.`,
    '',
    `**The rule (D6):** a candidate wins only if its held-out total beats the current wording by ≥ ${WIN_MARGIN} drafts and it ` +
      `is worse on no more than ${MAX_WORSE_FOLDS} fold. The refit column is information only.`,
    '',
    '| Wording | Held-out right (folds 1–5) | **Total** | vs current | Family right | Decided | Refit column (per-fold t) | Verdict |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of results) {
    const v = r.name === 'current' ? '—' : `**${r.verdict.verdict}**`;
    const diff =
      r.name === 'current'
        ? '—'
        : `${r.tally.total - cur.tally.total >= 0 ? '+' : ''}${r.tally.total - cur.tally.total}`;
    lines.push(
      `| ${r.name} | ${r.tally.perFold.join(' · ')} | **${r.tally.total}/${r.tally.n}** (${pct(r.tally.total, r.tally.n)}) | ${diff} | ` +
        `${r.tally.family}/${r.tally.n} | ${r.tally.decided}/${r.tally.n} | ${r.refit.total} (${r.refit.picks.join(', ')}) | ${v} |`
    );
  }
  const winners = results
    .filter((r) => r.verdict?.verdict === 'wins')
    .sort((a, b) => b.tally.total - a.tally.total);
  lines.push(
    '',
    winners.length
      ? `**Winner: \`${winners[0].name}\`** (+${winners[0].verdict.margin} held out). Adoption is a SEPARATE PR: edit \`scripts/lib/jev-questions/prose.json\` ` +
          "(and its `measured` block), re-record with `node scripts/jev-eval.mjs --live`, merge only with the product owner's OK."
      : '**No candidate wins.** The current wording stays. This is a clean negative for this candidate set.',
    '',
    '## The wordings',
    ''
  );
  for (const r of results) {
    lines.push(`### ${r.name}${r.hash ? ` (\`${r.hash}\`)` : ''}`, '');
    if (r.why) lines.push(`_Why:_ ${r.why}`, '');
    lines.push(
      `> ${r.question.instructions}`,
      '>',
      `> **true:** ${r.question.criteria.true}`,
      '>',
      `> **false:** ${r.question.criteria.false}`,
      ''
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The whole run with every side effect injected (the spec drives it with a replay client). Returns the exit code.
 * io: { fixtures, folds, config, rails, questions, readCandidates, readCache, writeCache, writeReport, key, ask,
 *       confirm, stdout, stderr, today }
 */
export async function run(argv, io) {
  const args = parseArgs(argv);
  if (args.error) {
    io.stderr(`wording: ${args.error}\n`);
    return 2;
  }
  const target = io.questions.find((q) => q.id === args.question || q.code === args.question);
  if (!target) {
    io.stderr(
      `wording: no prose question "${args.question}" (${io.questions.map((q) => q.code).join(', ')})\n`
    );
    return 2;
  }
  let candidates;
  try {
    candidates = parseCandidates(io.readCandidates(args.candidates), target);
  } catch (e) {
    io.stderr(`wording: ${e.message}\n`);
    return 2;
  }
  const fixtures = io.fixtures;
  const foldIds = Object.keys(io.folds.prose ?? {})
    .sort()
    .join();
  if (
    foldIds !==
    fixtures
      .map((f) => f.id)
      .sort()
      .join()
  ) {
    io.stderr(
      'wording: optimize/folds.json does not match the prose fixtures — run `npm run optimize:refit` to regenerate it.\n'
    );
    return 2;
  }
  // The current wording's answers ARE the recordings — but only if the recordings answered this exact wording (D3).
  const currentHash = questionHash(target);
  // A recording that answered this family must be stamped with EXACTLY this wording, by the configured model; one
  // with no answers for the family (its gates skipped it) has nothing to prove. Unstamped counts as stale.
  const stale = fixtures.filter(
    (fx) =>
      Object.keys(fx.recorded?.answers ?? {}).some((id) => id.endsWith(`_${target.id}`)) &&
      (fx.recorded?.questionHashes?.[target.id] !== currentHash || fx.recorded?.model !== io.config.model)
  );
  if (stale.length) {
    io.stderr(
      `wording: ${stale.length} recording(s) did not answer this wording of ${target.id} under ${io.config.model} (e.g. ${stale[0].id}) — run \`node scripts/jev-eval.mjs --live\` first.\n`
    );
    return 2;
  }

  const cache = {};
  for (const c of candidates) {
    const hit = io.readCache(c.hash);
    // A cache answers for the model that produced it: after a model bump it is a miss, never a silent mix.
    if (hit && hit.model === io.config.model) cache[c.hash] = hit;
    else if (hit)
      io.stdout(
        `wording: ${c.name}'s cache is from ${hit.model}, config pins ${io.config.model} — re-asking.\n`
      );
  }
  const todo = plan({ fixtures, key: target.id, candidates, cache });
  const nQuestions = todo.reduce((s, t) => s + t.questions.length, 0);
  const cachedCount = candidates.filter((c) => !todo.some((t) => t.candidate === c)).length;
  io.stdout(
    `wording: ${candidates.length} candidate(s) for ${target.code}; ${cachedCount} fully cached. ` +
      `To ask: ${nQuestions} question(s) in ${todo.length} request(s) to ${io.config.model}.\n`
  );

  if (todo.length) {
    const refusal = liveRefusal(io.config, io.key);
    if (refusal) {
      io.stderr(`${refusal.replace('jev-eval --live', 'wording')}\n`);
      return 2;
    }
    if (!args.yes && !(await io.confirm(`Send ${nQuestions} question(s) to Jev? [y/N] `))) {
      io.stdout('wording: nothing sent.\n');
      return 1;
    }
    const failed = await askAll({
      todo,
      cache,
      ask: io.ask,
      model: io.config.model,
      onProgress: (d, n) => (d % 25 === 0 || d === n ? io.stdout(`  asked ${d}/${n}\n`) : null),
      persist: () => {
        for (const c of candidates) if (cache[c.hash]) io.writeCache(c.hash, cache[c.hash]);
      },
    });
    for (const c of candidates) if (cache[c.hash]) io.writeCache(c.hash, cache[c.hash]);
    if (failed.length) {
      io.stderr(
        `wording: Jev could not look at ${failed.length} draft(s) — cached what answered; re-run to ask only those:\n`
      );
      for (const f of failed.slice(0, 10)) io.stderr(`  ✗ ${f}\n`);
      return 1;
    }
  }

  const threshold = io.config.rails.prose.thresholds.claim;
  const wordings = [
    {
      name: 'current',
      question: { type: 'noul', instructions: target.instructions, criteria: target.criteria },
      hash: currentHash,
      why: 'The committed wording (scripts/lib/jev-questions/prose.json).',
      answersFor: () => undefined,
    },
    ...candidates.map((c) => ({
      ...c,
      answersFor: (fx) => {
        const needs = draftQuestions(fx, target.id, c.question);
        if (!needs.length) return {};
        const entry = cache[c.hash]?.answers?.[fx.id];
        // Never score a gap: a missing answer would fail the judge's whole chunk and read as a regex fallback.
        if (!covers(entry, needs)) throw new Error(`${c.name}/${fx.id}: the cache does not cover this draft`);
        return entry;
      },
    })),
  ];
  const results = [];
  for (const w of wordings) {
    const score = (t) =>
      scoreWording({
        fixtures,
        folds: io.folds.prose,
        rails: io.rails,
        config: io.config,
        key: target.id,
        code: target.code,
        answersFor: w.answersFor,
        threshold: t,
      });
    const t = tally(await score(threshold));
    results.push({
      name: w.name,
      hash: w.hash,
      why: w.why,
      question: w.question,
      tally: t,
      refit: await refitColumn({ score, configured: threshold }),
    });
  }
  const cur = results[0];
  for (const r of results.slice(1)) r.verdict = verdict(r.tally, cur.tally);

  const report = formatReport({
    question: target,
    date: io.today,
    model: io.config.model,
    threshold,
    results,
    sent: todo.length,
    cached: cachedCount,
  });
  const base = `wording-${target.code}-${io.today}`;
  io.writeReport(`${base}.md`, report);
  io.writeReport(
    `${base}.json`,
    `${JSON.stringify({ question: target.code, date: io.today, model: io.config.model, threshold, results: results.map(({ name, hash, tally: t, refit, verdict: v }) => ({ name, hash, ...t, refit, verdict: v?.verdict ?? null })) }, null, 2)}\n`
  );
  io.stdout(
    report
      .split('\n')
      .filter((l) => l.startsWith('|') || l.startsWith('**'))
      .join('\n') + '\n'
  );
  io.stdout(`report → optimize/reports/${base}.md\n`);
  return 0;
}

async function main() {
  const root = repoRoot();
  const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const code = await run(process.argv.slice(2), {
    fixtures: JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')).prose,
    folds: existsSync(FOLDS_PATH) ? JSON.parse(readFileSync(FOLDS_PATH, 'utf8')) : {},
    config: loadJevConfig({ root }),
    rails: await loadRails(),
    questions: loadQuestions('prose'),
    readCandidates: (p) => JSON.parse(readFileSync(resolve(p), 'utf8')),
    readCache: (h) =>
      existsSync(join(CACHE_DIR, `${h}.json`))
        ? JSON.parse(readFileSync(join(CACHE_DIR, `${h}.json`), 'utf8'))
        : null,
    writeCache: (h, v) => {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(join(CACHE_DIR, `${h}.json`), `${JSON.stringify(v, null, 2)}\n`);
    },
    writeReport: (name, text) => {
      mkdirSync(REPORTS_DIR, { recursive: true });
      writeFileSync(join(REPORTS_DIR, name), text);
    },
    key: () => readApiKey({ root }),
    ask: (req) =>
      askJev(req, { key: readApiKey({ root }), model: loadJevConfig({ root }).model, timeoutMs: 30_000 }),
    // A non-interactive run without --yes never sends: there is nobody to say yes.
    confirm: async (q) => (rl ? /^y(es)?$/i.test((await rl.question(q)).trim()) : false),
    stdout: (t) => process.stdout.write(t),
    stderr: (t) => process.stderr.write(t),
    today: new Date().toISOString().slice(0, 10),
  });
  rl?.close();
  process.exit(code);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain)
  main().catch((e) => {
    process.stderr.write(`wording: ${e.message}\n`);
    process.exit(1);
  });
