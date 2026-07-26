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
//   node scripts/commit-report.mjs --text "…" --post  # post REVIEWED prose, skipping the model
//
// ── Read the draft before you post it. This is not boilerplate caution ────────────────────────
// Measured on this rail's own first two live runs (2026-07-25), a cheap model summarising a dense
// engineering commit fabricated material facts BOTH times: it claimed a commit that merely added
// tests for an open-redirect bug had "blocked the bypass, eliminating a potential open-redirect
// attack" (the fix shipped weeks earlier — the claim was simply untrue), and it twice invented
// customer impact for changes no customer can observe. commit-report.prompt.md now names both
// failures explicitly, which helps and does not eliminate them.
//
// So this tool is ADVISORY, exactly like cross-review and prose-draft: the default mode prints to
// stdout for a human or the coordinating agent to read. `--post` exists for when the draft is
// right, and `--text` exists for when it is nearly right — fix the sentence and post that instead
// of re-rolling the model. The posted message is always labelled with the model that drafted it, so
// an unreviewed claim is at least self-identifying in the channel.
//
// Telegram credentials come from the environment or `.env.local` (TELEGRAM_BOT_TOKEN +
// TELEGRAM_CICD_CHAT_ID). Missing credentials with --post is a clean skip, never a crash — same
// fire-and-forget stance as apps/web/lib/telegram.ts and the workflow.

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { die, need, loadPromptBody } from './lib/cross-agent-cli.mjs';
import { writeProse, buildWriterPrompt, loadLessons } from './lib/prose-writer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Telegram's hard ceiling is 4096 characters per message. We budget well under it: the prose is
// meant to be ~60 words, and the remaining headroom absorbs the commit header and the links.
// The length/escaping rules live in lib/telegram-text.mjs — shared with the CI notification rail
// (scripts/telegram-notify.mjs), because two implementations of `escapeToFit` is exactly one
// too many. Re-exported here so this module's existing importers and tests are unaffected.
export { TELEGRAM_LIMIT, escapeHtml, truncateWords, escapeToFit } from './lib/telegram-text.mjs';
// Imported separately from the re-export above, and deliberately only the three this file CALLS:
// `truncateWords` is part of the public surface (its own tests import it from here) but is not used
// in this module, and importing it purely to re-export it trips no-unused-vars.
import { TELEGRAM_LIMIT, escapeHtml, escapeToFit } from './lib/telegram-text.mjs';

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

/**
 * What the SOURCE DATA supports, for the prose guard to check the draft against.
 *
 * This is the piece that makes the guard's two headline rules enforceable rather than advisory. The
 * guard cannot know whether a fix happened; it can only know whether the draft is ALLOWED to say
 * one did. That permission is derived here, from the commit itself:
 *
 *   - a fix claim is allowed only when the commit is actually a fix (conventional-commit `fix:`,
 *     or a subject that says so). A `feat:`/`test:`/`chore:` commit asserting "this resolves…" is
 *     the exact hallucination measured on this rail;
 *   - naming customers/tenants/users is allowed only when the change touches a surface they can
 *     observe. A diff confined to CI, tooling and tests has no customer story, and inventing one
 *     was the other measured failure.
 *
 * Both default to FALSE — the permissive direction has to be earned by evidence.
 */
export function deriveEvidence({ message, paths }) {
  const subject = String(message ?? '').split('\n')[0];
  const allowsFixClaim =
    /^(?:fix|hotfix|revert)(?:\([^)]*\))?!?:/i.test(subject) || /\bfix(?:es|ed)?\b/i.test(subject);

  // Customer-observable surfaces only. `apps/web/lib` is deliberately EXCLUDED: server logic can
  // change behaviour, but on its own it is not evidence of anything a customer would notice, and
  // treating it as such would re-open the invented-beneficiary hole for most commits.
  const customerFacing = [
    /^apps\/web\/app\/api\//,
    /^apps\/web\/app\/(?!api\/)[^/]*\//,
    /^apps\/web\/app\/[^/]+\.tsx?$/,
    /^packages\/sdk\//,
    /^apps\/web\/supabase\/migrations\//,
  ];
  const allowsBeneficiary = (paths ?? []).some((p) => customerFacing.some((re) => re.test(p)));

  return { allowsFixClaim, allowsBeneficiary, maxWords: 60, minWords: 8 };
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
    `<a href="${escapeHtml(url)}">view diff</a> · <i>${escapeHtml(model)}</i>`
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
  let sha, range, text;
  let post = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sha') sha = need(args[++i], '--sha');
    else if (args[i] === '--range') range = need(args[++i], '--range');
    else if (args[i] === '--text') text = need(args[++i], '--text');
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

  const evidence = deriveEvidence({ message, paths });

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

  // --text is the reviewed-prose path: skip the model entirely and post what the caller wrote.
  // Attributed to 'reviewed by hand' so the channel distinguishes it from a raw machine draft.
  let prose = text;
  let attribution = 'reviewed by hand';

  if (!prose) {
    // Devin writes, agy falls back, and every draft passes the mechanical guard before a human sees
    // it — see scripts/lib/prose-writer.mjs for why the router is that way round.
    const result = writeProse({
      prompt: buildWriterPrompt({
        style: loadPromptBody(join(__dirname, 'commit-report.prompt.md')),
        lessons: loadLessons(),
        task: prompt,
      }),
      evidence,
    });

    if (!result.text) die(result.error || 'no prose writer produced a draft.');
    prose = result.text;
    attribution = result.ok ? `unreviewed draft · ${result.writer}` : `FLAGGED draft · ${result.writer}`;

    if (!result.ok) {
      // Surface the findings on stderr so the draft on stdout can never be mistaken for a clean
      // one. It is still emitted: a flawed draft a human can correct beats no output at all.
      process.stderr.write(
        `\n⚠ The guard rejected this draft and it did NOT converge after a revision pass:\n` +
          result.guard.findings.map((f) => `  · ${f.code}: ${f.note}`).join('\n') +
          `\n  Read it carefully before posting, or rewrite it and use --text.\n\n`
      );
    }
  }

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
        model: attribution,
      })
    );
    process.stderr.write(sent ? '✓ posted to the CI/CD Telegram channel.\n' : '');
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
