#!/usr/bin/env node
// standup-report.mjs — the daily standup and the weekly report, written from real repo activity.
//
// ── Why these two surfaces ────────────────────────────────────────────────────────────────────
// A standup answers "what moved, what is next, what is stuck". A weekly answers the same question
// at a different altitude, for someone who was not watching. Both are currently written by hand or
// not at all, and both are FILE-AND-GIT DERIVED — which is exactly the boundary
// scripts/prose-draft.mjs already established as safe to delegate: the inputs are on disk, so the
// writer is synthesising rather than inventing.
//
// They ride the same rail as the merge report (Devin writes, agy falls back, the pure guard checks
// every draft and hands back findings for one revision pass), so a fix to the guard or a new lesson
// improves all three surfaces at once. That shared rail is the point — three prompts, one set of
// defences.
//
//   node scripts/standup-report.mjs                    # yesterday → now
//   node scripts/standup-report.mjs --kind weekly      # last 7 days
//   node scripts/standup-report.mjs --since 3.days     # any git date expression
//   node scripts/standup-report.mjs --post             # send to the CI/CD Telegram channel
//   node scripts/standup-report.mjs --dry-run          # print the prompt, call no writer
//
// ── An empty period is a valid report, not a failure ──────────────────────────────────────────
// A quiet day must produce "nothing shipped", never a padded paragraph. Roadmap/LEARNINGS.md
// already records the sibling of this bug: a delta-only reporting tool must special-case a missing
// baseline as a bounded no-op rather than as "everything happened". Here the equivalent is
// refusing to call the writer at all when there is nothing to write about — a model handed an empty
// changelog will produce prose regardless, and that prose is fiction.

import { spawnSync } from 'node:child_process';
import { writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { die, need, loadPromptBody } from './lib/cross-agent-cli.mjs';
import { writeProse, buildWriterPrompt, loadLessons } from './lib/prose-writer.mjs';
import { escapeToFit, summarizeAreas, TELEGRAM_LIMIT } from './commit-report.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

export const KINDS = {
  standup: { since: 'yesterday', maxWords: 90, label: 'Standup', emoji: '☕' },
  weekly: { since: '7.days', maxWords: 160, label: 'Weekly', emoji: '📅' },
};

function git(args) {
  const r = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? (r.stdout || '').trim() : '';
}

/**
 * Gather what actually happened in the window.
 *
 * Merge commits are excluded (`--no-merges`): a squash-merge already carries the story, and the
 * merge commit restates it, which would make the writer report everything twice.
 */
export function gatherActivity(since, run = git) {
  const log = run([
    'log',
    '--no-merges',
    `--since=${since}`,
    '--format=%h%x00%s%x00%an%x00%ad',
    '--date=short',
  ]);
  const commits = log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, subject, author, date] = line.split('\0');
      return { sha, subject, author, date };
    });

  const paths = run(['log', '--no-merges', `--since=${since}`, '--name-only', '--format='])
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);

  // Roadmap docs are the highest-signal input available: they state, in product language, what the
  // work was FOR. Same reasoning as commit-report pulling story headings out of the doc diff.
  const roadmapDocs = [...new Set(paths.filter((p) => p.startsWith('Roadmap/')))];

  return {
    commits,
    areas: summarizeAreas(paths),
    fileCount: new Set(paths).size,
    roadmapDocs,
  };
}

/** True when the window contains nothing worth reporting. */
export function isEmptyPeriod(activity) {
  return !activity || activity.commits.length === 0;
}

export function buildTask({ kind, since, activity }) {
  const cfg = KINDS[kind];
  const lines = [
    `## Task: write the ${cfg.label.toUpperCase()} report`,
    '',
    `Window: everything since ${since}. ${activity.commits.length} commits touching ${activity.fileCount} files.`,
    '',
    'What shipped (subject lines — the engineering account, already visible to the reader):',
    ...activity.commits.map((c) => `- ${c.subject}`),
    '',
    'Where the work landed (shape only — do NOT name files in your report):',
    ...(activity.areas.length ? activity.areas.map((a) => `- ${a}`) : ['- (no files changed)']),
  ];

  if (activity.roadmapDocs.length) {
    lines.push(
      '',
      'Roadmap documents touched — these state, in product language, what the work was for:',
      ...activity.roadmapDocs.slice(0, 20).map((d) => `- ${d}`)
    );
  }

  lines.push(
    '',
    kind === 'standup'
      ? 'Write it as a standup: what moved, what is next, and anything that is stuck or owed. ' +
          'If something is blocked or waiting on a person, say so plainly — that is the most useful ' +
          'line in a standup and the one most often left out.'
      : 'Write it as a weekly report for someone who was not watching: the through-line of the week, ' +
          'what is now possible that was not on Monday, and what is still owed. Group by theme, not ' +
          'by commit — a list of commits is not a report.',
    '',
    `Length: up to ${cfg.maxWords} words. Prose, no bullet lists, no headings, no markdown.`
  );

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  let kind = 'standup';
  let since;
  let post = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--kind') kind = need(args[++i], '--kind');
    else if (args[i] === '--since') since = need(args[++i], '--since');
    else if (args[i] === '--post') post = true;
    else if (args[i] === '--dry-run') dryRun = true;
    else die(`unknown arg ${args[i]}`);
  }
  if (!KINDS[kind]) die(`--kind must be one of: ${Object.keys(KINDS).join(' | ')}`);

  const cfg = KINDS[kind];
  const window = since || cfg.since;
  const activity = gatherActivity(window);

  if (isEmptyPeriod(activity)) {
    // Deliberately does NOT call a writer. Handed an empty changelog, a model produces plausible
    // prose about nothing — the exact failure mode this whole rail exists to prevent.
    writeSync(1, `Nothing shipped since ${window}. No report generated.\n`);
    return;
  }

  const task = buildTask({ kind, since: window, activity });
  const prompt = buildWriterPrompt({
    style: loadPromptBody(join(__dirname, 'commit-report.prompt.md')),
    lessons: loadLessons(),
    task,
  });

  if (dryRun) {
    writeSync(1, `${prompt}\n`);
    return;
  }

  // A standup covers many commits at once, so a single `fix:` among them genuinely permits fix
  // language, and any customer-facing path in the window permits naming customers. Both are still
  // DERIVED from the window rather than assumed.
  const evidence = {
    allowsFixClaim: activity.commits.some((c) => /^(?:fix|hotfix|revert)(?:\([^)]*\))?!?:/i.test(c.subject)),
    allowsBeneficiary: activity.areas.some((a) =>
      /public API routes|dashboard pages|public web pages|client SDK|database schema/.test(a)
    ),
    maxWords: cfg.maxWords,
    minWords: 15,
  };

  const result = writeProse({ prompt, evidence });
  if (!result.text) die(result.error || 'no prose writer produced a draft.');

  writeSync(1, `${result.text}\n`);

  if (!result.ok) {
    process.stderr.write(
      `\n⚠ The guard rejected this draft and it did NOT converge after a revision pass:\n` +
        result.guard.findings.map((f) => `  · ${f.code}: ${f.note}`).join('\n') +
        `\n  Read it carefully before posting.\n\n`
    );
  }

  if (post) postToTelegram(kind, result, activity);
}

function postToTelegram(kind, result, activity) {
  const cfg = KINDS[kind];
  const { token, chat } = telegramCreds();
  if (!token || !chat) {
    process.stderr.write('⚠ TELEGRAM_BOT_TOKEN / TELEGRAM_CICD_CHAT_ID not set — skipping the post.\n');
    return;
  }
  const attribution = result.ok ? `unreviewed draft · ${result.writer}` : `FLAGGED draft · ${result.writer}`;
  const text =
    `golden-beans · ${cfg.emoji} · <b>${cfg.label}</b>\n` +
    `${activity.commits.length} commits\n\n` +
    `${escapeToFit(result.text, TELEGRAM_LIMIT - 300)}\n\n` +
    `<i>${attribution}</i>`;

  const body = JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
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
  process.stderr.write(
    ok
      ? '✓ posted to the CI/CD Telegram channel.\n'
      : `⚠ Telegram post failed: ${(r.stdout || r.stderr || '').trim()}\n`
  );
}

function telegramCreds() {
  let token = process.env.TELEGRAM_BOT_TOKEN;
  let chat = process.env.TELEGRAM_CICD_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  const envFile = join(REPO_ROOT, '.env.local');
  if ((!token || !chat) && spawnSync('test', ['-f', envFile]).status === 0) {
    for (const line of spawnSync('cat', [envFile], { encoding: 'utf8' }).stdout.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const val = m[2].replace(/^["']|["']$/g, '');
      if (m[1] === 'TELEGRAM_BOT_TOKEN' && !token) token = val;
      if ((m[1] === 'TELEGRAM_CICD_CHAT_ID' || m[1] === 'TELEGRAM_CHAT_ID') && !chat) chat = val;
    }
  }
  return { token, chat };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
