#!/usr/bin/env node
// commit-report.mjs — an EXECUTIVE, product-level report on what a merge means, drafted by a
// cheaper foreign model and posted to the CI/CD Telegram channel beside the mechanical push ping.
//
// ── What this is for ──────────────────────────────────────────────────────────────────────────
// `.github/workflows/notify-telegram.yml` already pings on every push to `main`: repo, SHA, commit
// header, author, diff link. That message answers "something shipped, here is the code." It does
// not answer "what does this mean for anyone" — which is the only question a founder scrolling his
// phone actually has. The engineering story is in the diff; the product story is nowhere, and the
// person best placed to write it (the agent that just built the thing) is also the most expensive
// one to ask.
//
// So this rail hands the commit's own data to a cheap model with a product-manager brief. Daniel's
// call is that the GPT lineage handles that register best, so COMMIT_REPORT_MODEL leads with
// gpt-oss-120b and falls back to Gemini Flash (a separate quota pool — see runAntigravity).
//
// ── Why this is NOT a GitHub Actions step ─────────────────────────────────────────────────────
// `agy` authenticates through an interactive OAuth login and exposes no headless credential path,
// so it cannot run in a runner at all (Roadmap/LEARNINGS.md: "A CLI authed by an interactive/OAuth
// login is NOT free to run in CI — confirm a portable non-interactive credential path AND its cost
// before automating it"). Rather than fake it with a second API key and a second bill, the split is
// explicit: the workflow owns the always-on mechanical pings, and this owns the prose, run locally
// by whoever merged. WAYS-OF-WORKING.md → "Shipping a merge" records it as a step so it is a
// habit, not a thing someone remembers.
//
// ── Usage ─────────────────────────────────────────────────────────────────────────────────────
//   node scripts/commit-report.mjs                    # HEAD, print to stdout
//   node scripts/commit-report.mjs --sha <sha>        # one specific commit
//   node scripts/commit-report.mjs --range a..b       # a span (e.g. a whole merged sprint)
//   node scripts/commit-report.mjs --post             # also send it to the CI/CD Telegram channel
//   node scripts/commit-report.mjs --dry-run          # print the assembled PROMPT, call no model
//
// Telegram credentials come from the environment or `.env.local` (TELEGRAM_BOT_TOKEN +
// TELEGRAM_CICD_CHAT_ID). Missing credentials with --post is a clean skip, never a crash — same
// fire-and-forget stance as apps/web/lib/telegram.ts and the workflow.

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runAntigravity,
  checkAgyVersion,
  ensureCmd,
  die,
  need,
  loadPromptBody,
  AGY_ARG_LIMIT,
  COMMIT_REPORT_MODEL,
  COMMIT_REPORT_FALLBACK_MODEL,
} from './lib/cross-agent-cli.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Telegram's hard ceiling is 4096 characters per message. We budget well under it: the prose is
// meant to be ~60 words, and the remaining headroom absorbs the commit header and the links.
export const TELEGRAM_LIMIT = 4096;

// ── Pure helpers (the unit-tested core) ──────────────────────────────────────────────────────

/** HTML-escape for Telegram's `parse_mode: HTML`. Same three entities as lib/telegram.ts's esc(). */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Truncate to a hard character budget on a WORD boundary, with an ellipsis.
 *
 * Never call this on already-escaped text: cutting mid-entity ("&am") produces broken markup that
 * Telegram rejects with a 400 for the whole message, losing the prose entirely. Escaping is applied
 * afterwards, via escapeToFit below.
 */
export function truncateWords(text, max) {
  const s = String(text ?? '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Escape `text` so that the ESCAPED result fits within `maxEscaped` characters.
 *
 * This exists because the obvious composition — `escapeHtml(truncateWords(t, budget))` — is wrong,
 * and its own unit test caught it on the first run. Escaping EXPANDS: every `&` becomes the five
 * characters `&amp;`. So text truncated to exactly the budget can be up to ~5x the budget once
 * escaped (a 3,696-character cut of ampersand-heavy prose came out at 11,231 characters, nearly
 * three times Telegram's 4,096 ceiling).
 *
 * Truncating the escaped string instead would fix the length and reintroduce the mid-entity cut.
 * The only correct order is: truncate raw → escape → if it still doesn't fit, shrink the RAW budget
 * and repeat. Halving converges in a handful of passes even for pathological input, and each pass
 * is a plain string operation on a few kilobytes.
 */
export function escapeToFit(text, maxEscaped) {
  let budget = maxEscaped;
  for (let i = 0; i < 24; i++) {
    const escaped = escapeHtml(truncateWords(text, budget));
    if (escaped.length <= maxEscaped) return escaped;
    // Scale the raw budget by the observed expansion ratio rather than halving blindly — for
    // ordinary prose (almost no entities) this returns on the second pass instead of over-trimming.
    const ratio = escaped.length / Math.max(1, maxEscaped);
    budget = Math.max(1, Math.floor(budget / Math.max(1.25, ratio)));
  }
  // Unreachable for any real input; a hard floor beats an unbounded loop.
  return escapeHtml(truncateWords(text, 40));
}

/**
 * Which commit(s) to report on, from the parsed flags. Pure so the precedence is pinned by a test
 * rather than by reading the arg loop: an explicit --range wins over --sha, which wins over HEAD.
 */
export function resolveTarget({ sha, range }) {
  if (range) return { kind: 'range', ref: range };
  if (sha) return { kind: 'commit', ref: sha };
  return { kind: 'commit', ref: 'HEAD' };
}

/**
 * Group changed paths into product-meaningful areas.
 *
 * The model is explicitly told not to talk about file names, but it still needs to know WHERE a
 * change landed to work out who it affects — a migration plus an API route is a tenant-facing
 * capability, while a change confined to `.github/` is not user-visible at all. Feeding shape
 * instead of paths is what keeps the output about people rather than about files.
 */
export function summarizeAreas(paths) {
  const rules = [
    [/^apps\/web\/app\/api\//, 'public API routes'],
    [/^apps\/web\/app\/app\//, 'signed-in dashboard pages'],
    [/^apps\/web\/app\//, 'public web pages'],
    [/^apps\/web\/supabase\/migrations\//, 'database schema'],
    [/^apps\/web\/lib\//, 'server-side application logic'],
    [/^apps\/web\/e2e\//, 'automated tests'],
    [/^packages\/sdk\//, 'the client SDK that customers install'],
    [/^Roadmap\//, 'product planning docs'],
    [/^\.github\//, 'build and deploy automation'],
    [/^scripts\//, 'internal tooling'],
    [/^references\//, 'design and spec references'],
  ];
  const seen = new Map();
  for (const p of paths) {
    const hit = rules.find(([re]) => re.test(p));
    const label = hit ? hit[1] : 'other';
    seen.set(label, (seen.get(label) || 0) + 1);
  }
  // Most-touched area first — it's the best single hint at what the change is really about.
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => `${label} (${n} file${n === 1 ? '' : 's'})`);
}

/**
 * Pull the story/epic headings out of any touched Roadmap docs.
 *
 * This is the highest-signal input the whole script has. A commit body says what was done; the
 * sprint doc says who it was for and why, in plain product language, already written. Handing the
 * model that context is the difference between a report about code and a report about the product.
 */
export function extractStoryContext(diffText) {
  const lines = String(diffText ?? '').split('\n');
  const out = [];
  for (const line of lines) {
    // Added lines only (`+`, but not the `+++ b/path` file header) — we want what this commit
    // ASSERTED about the product, not the doc's pre-existing content.
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const body = line.slice(1).trim();
    if (/^#{1,4}\s+(Story|Epic|Sprint)\b/i.test(body)) out.push(body.replace(/^#+\s*/, ''));
    else if (/^\*\*(As a|As the|I want|so that|Acceptance)\*\*/i.test(body)) out.push(body);
  }
  // De-dupe and cap: this is context, not the payload, and the argv budget is shared.
  return [...new Set(out)].slice(0, 25);
}

export function buildPrompt({ style, meta, areas, storyContext, stat }) {
  const parts = [
    style,
    '\n\n## The change\n',
    `Repository: golden-beans — a multi-tenant product-analytics and experimentation engine.`,
    `Commit: ${meta.ref}`,
    `Author: ${meta.author}`,
    `Date: ${meta.date}`,
    `\nCommit message (subject and body — the engineering account, already visible to the reader):\n"""\n${meta.message}\n"""`,
    `\nWhere the change landed (shape only — do NOT name files in your report):\n${areas.map((a) => `- ${a}`).join('\n') || '- (no files changed)'}`,
    `\nSize: ${stat}`,
  ];
  if (storyContext.length) {
    parts.push(
      `\nProduct intent, taken from the roadmap/sprint documents this commit itself edited. This is` +
        ` the plain-language statement of who the work is for — lean on it:\n` +
        storyContext.map((s) => `- ${s}`).join('\n')
    );
  }
  parts.push('\n\nNow write the report. Prose only, sixty words maximum.');
  return parts.join('\n');
}

/**
 * Assemble the Telegram message: a header line identifying the commit, then the prose.
 *
 * Both variable-length fields go through escapeToFit, which guarantees the ESCAPED length — see its
 * comment for why escaping-after-truncating is not enough on its own. The budgets are sized against
 * TELEGRAM_LIMIT with headroom for the fixed chrome (SHA, links, the model footer).
 */
export function buildTelegramMessage({ shortSha, subject, prose, url, model }) {
  const safeSubject = escapeToFit(subject, 200);
  const chrome = 400; // SHA line, the anchor, the model footer, newlines
  const body = escapeToFit(prose, TELEGRAM_LIMIT - chrome - safeSubject.length);
  return (
    `golden-beans · 📝 · <code>${escapeHtml(shortSha)}</code>\n` +
    `${safeSubject}\n\n` +
    `${body}\n\n` +
    `<a href="${escapeHtml(url)}">view diff</a> · <i>drafted by ${escapeHtml(model)}</i>`
  );
}

// ── I/O ──────────────────────────────────────────────────────────────────────────────────────

function git(args, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    if (allowFail) return '';
    die(`git ${args.join(' ')} failed: ${(r.stderr || '').trim().split('\n').pop() || 'unknown error'}`);
  }
  return (r.stdout || '').trim();
}

/**
 * Load TELEGRAM_* from the environment, falling back to `.env.local`.
 *
 * Deliberately a hand-rolled 6-line parser and not a `dotenv` dependency: `scripts/` is a
 * zero-npm-dependency layer by convention, and this reads two known keys, not arbitrary config.
 * Values are never logged — only their presence is ever reported.
 */
function telegramCreds() {
  let token = process.env.TELEGRAM_BOT_TOKEN;
  let chat = process.env.TELEGRAM_CICD_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  const envFile = join(REPO_ROOT, '.env.local');
  if ((!token || !chat) && existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const val = m[2].replace(/^["']|["']$/g, '');
      if (m[1] === 'TELEGRAM_BOT_TOKEN' && !token) token = val;
      if ((m[1] === 'TELEGRAM_CICD_CHAT_ID' || m[1] === 'TELEGRAM_CHAT_ID') && !chat) chat = val;
    }
  }
  return { token, chat };
}

function postToTelegram(text) {
  const { token, chat } = telegramCreds();
  if (!token || !chat) {
    process.stderr.write(
      '⚠ TELEGRAM_BOT_TOKEN / TELEGRAM_CICD_CHAT_ID not set (env or .env.local) — skipping the post.\n' +
        '  The draft is on stdout above; nothing was sent.\n'
    );
    return false;
  }
  // curl over fetch for the same reason the workflow uses it: one dependency-free call whose
  // failure is a warning, never an exception that loses the draft we already printed.
  const body = JSON.stringify({
    chat_id: chat,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
  const r = spawnSync(
    'curl',
    [
      '-sS',
      '-m',
      '10',
      '-X',
      'POST',
      `https://api.telegram.org/bot${token}/sendMessage`,
      '-H',
      'Content-Type: application/json',
      '--data-binary',
      '@-',
    ],
    { input: body, encoding: 'utf8' }
  );
  const ok = r.status === 0 && /"ok":\s*true/.test(r.stdout || '');
  if (!ok) {
    // Telegram's own error body is the useful part (a 400 names the offending entity/offset).
    process.stderr.write(
      `⚠ Telegram post failed — the draft above was NOT sent.\n  ${(r.stdout || r.stderr || '').trim()}\n`
    );
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  let sha, range;
  let post = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sha') sha = need(args[++i], '--sha');
    else if (args[i] === '--range') range = need(args[++i], '--range');
    else if (args[i] === '--post') post = true;
    else if (args[i] === '--dry-run') dryRun = true;
    else die(`unknown arg ${args[i]}`);
  }

  const target = resolveTarget({ sha, range });
  const logRange = target.kind === 'range' ? target.ref : `${target.ref}~1..${target.ref}`;

  // %s + %b, not %B: the subject and body are what a human wrote about intent. Trailers
  // (Co-Authored-By, Claude-Session) are machine bookkeeping and would only add noise.
  const message = git(['log', '-1', '--format=%s%n%n%b', target.ref]);
  const author = git(['log', '-1', '--format=%an', target.ref]);
  const date = git(['log', '-1', '--format=%ad', '--date=short', target.ref]);
  const fullSha = git(['rev-parse', target.ref]);
  const stat = git(['diff', '--shortstat', logRange], { allowFail: true }) || '(no diff)';
  const paths = git(['diff', '--name-only', logRange], { allowFail: true }).split('\n').filter(Boolean);

  // Only Roadmap docs are diffed for story context — a full diff would blow the argv cap and the
  // model is told not to discuss code anyway.
  const roadmapDiff = paths.some((p) => p.startsWith('Roadmap/'))
    ? git(['diff', logRange, '--', 'Roadmap/'], { allowFail: true })
    : '';

  const prompt = buildPrompt({
    style: loadPromptBody(join(__dirname, 'commit-report.prompt.md')),
    meta: {
      ref: `${fullSha.slice(0, 7)} (${target.kind === 'range' ? target.ref : 'single commit'})`,
      author,
      date,
      message,
    },
    areas: summarizeAreas(paths),
    storyContext: extractStoryContext(roadmapDiff),
    stat,
  });

  if (dryRun) {
    writeSync(1, `${prompt}\n`);
    return;
  }

  if (Buffer.byteLength(prompt, 'utf8') > AGY_ARG_LIMIT) {
    die(`assembled prompt exceeds the agy argv cap (${AGY_ARG_LIMIT / 1024} KB) — narrow --range.`);
  }

  ensureCmd('agy', 'agy not found — the commit reporter rides the Antigravity CLI (see scripts/README.md).');
  checkAgyVersion();

  const prose = runAntigravity(prompt, { models: [COMMIT_REPORT_MODEL, COMMIT_REPORT_FALLBACK_MODEL] });

  // Synchronous write before any exit — `console.log` + `process.exit` truncates down a pipe
  // (Roadmap/LEARNINGS.md), and this script is designed to be piped.
  writeSync(1, `${prose}\n`);

  if (post) {
    const url = `https://github.com/danybgoode/golden-beans/commit/${fullSha}`;
    const sent = postToTelegram(
      buildTelegramMessage({
        shortSha: fullSha.slice(0, 7),
        subject: message.split('\n')[0],
        prose,
        url,
        model: COMMIT_REPORT_MODEL,
      })
    );
    process.stderr.write(sent ? '✓ posted to the CI/CD Telegram channel.\n' : '');
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
