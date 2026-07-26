#!/usr/bin/env node
// telegram-notify.mjs — the CI/CD Telegram ping, as a tested script instead of inline shell.
//
// Used by .github/workflows/notify-telegram.yml for both pings:
//   node scripts/telegram-notify.mjs --icon 📦 --sha "$GITHUB_SHA" --subject "$COMMIT_MSG" \
//        --meta "by @$AUTHOR" --url "$DIFF_URL" --link-label "view diff"
//
// ── Why this is not an inline jq/curl block any more ──────────────────────────────────────────
// It was, and the history is instructive. The original built the message text in one `jq -n` pass and
// the request body in a second, which double-encoded every `href=\"` and got EVERY ping this rail
// ever sent rejected with `400 can't parse entities` — for the workflow's entire life, behind a green
// check. That was fixed by collapsing to a single jq pass. Then a LENGTH guard was added to the jq
// program, and its first test proved the guard wrong in exactly the way this repo already had a
// written warning about: it capped the RAW subject, and 3,500 `>` characters escape to 14,129.
//
// Two implementations of the same escaping/length rule is one too many. The rule now lives in
// scripts/lib/telegram-text.mjs, shared with scripts/commit-report.mjs, unit-tested once, and this
// script is the only assembler. Nothing about the payload is built by string concatenation in YAML.
//
// ── Exit code policy: this script FAILS LOUD, and that is a deliberate change ──────────────────
// The old block ended in `|| true` so that a Telegram outage could never fail a deploy. The reasoning
// was sound in the design it came from — but in THIS repo the ping lives in its own workflow, fired by
// `push` and `deployment_status`. It is an observer: it cannot fail a deploy (Vercel's build is not
// this job), and it cannot block a PR (neither trigger is a pull_request event, so it never appears as
// a PR check).
//
// So a rejected message should turn the workflow RED. The previous behaviour — green check plus a
// `::warning` annotation — is how the last outage went unnoticed until Daniel observed the silence
// himself. A notification rail whose failures are only visible to someone reading annotations on a
// passing run is a rail with no monitoring at all.

import { escapeHtml, escapeToFit, TELEGRAM_LIMIT } from './lib/telegram-text.mjs';
import { die, need } from './lib/cross-agent-cli.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Assemble the sendMessage payload.
 *
 * The subject is the ONLY field given a length budget. The sha, status, icon and link are structural:
 * truncating them to accommodate a runaway commit message would discard exactly the parts a reader
 * needs while keeping the part that caused the problem.
 *
 * Pure, and exported, so the test exercises the real assembler rather than a paraphrase of it.
 */
export function buildNotification({ chatId, repo, sha, icon, subject, meta, status, url, linkLabel }) {
  const shortSha = String(sha ?? '').slice(0, 7);

  // Chrome first, measured rather than estimated, so the subject's budget is whatever is genuinely
  // left. A hardcoded guess here is how a "safe" cap stops being safe when a line is added below.
  const lines = [];
  const head = `${escapeHtml(repo)} · ${icon} · <code>${escapeHtml(shortSha)}</code>`;
  const tail = `<a href="${escapeHtml(url)}">${escapeHtml(linkLabel)}</a>`;
  const metaLine = meta ? escapeHtml(meta) : null;
  // `status` is our own literal ("✅ READY"), never external input — deliberately not escaped so the
  // emoji and casing survive, and deliberately noted here so nobody "fixes" it later.
  const statusLine = status || null;

  const chrome = [head, metaLine, statusLine, tail].filter(Boolean).join('\n').length + 1;

  // First line only: a commit body belongs behind the link, not in a notification.
  const firstLine = String(subject ?? '').split('\n')[0];
  const safeSubject = escapeToFit(firstLine, Math.max(1, TELEGRAM_LIMIT - chrome - 16));

  lines.push(head, safeSubject);
  if (metaLine) lines.push(metaLine);
  if (statusLine) lines.push(statusLine);
  lines.push(tail);

  return {
    chat_id: chatId,
    parse_mode: 'HTML',
    // Without this a commit link unfurls into a GitHub card that buries the next message.
    disable_web_page_preview: true,
    text: lines.join('\n'),
  };
}

/** POST it. Returns Telegram's parsed response, or a synthetic failure — never throws. */
export async function send(botToken, payload, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => ({ ok: false, description: 'unparseable response body' }));
    return body;
  } catch (err) {
    return { ok: false, description: `request failed: ${err?.message ?? err}` };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    if (!k.startsWith('--')) die(`unexpected argument ${k}`);
    opt[k.slice(2)] = need(args[++i], k);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CICD_CHAT_ID?.trim();
  if (!botToken || !chatId) {
    // A repo without the secrets configured is not a failure — the same clean-skip stance the roadmap
    // push rail takes. This is the ONE path that exits 0 without delivering.
    process.stderr.write(
      'TELEGRAM_BOT_TOKEN / TELEGRAM_CICD_CHAT_ID not set — skipping cleanly.\n' +
        '  Set both as GitHub Secrets on this repo to turn notifications on.\n'
    );
    return;
  }

  const payload = buildNotification({
    chatId,
    repo: opt.repo ?? 'golden-beans',
    sha: opt.sha ?? '',
    icon: opt.icon ?? '📦',
    subject: opt.subject ?? '',
    meta: opt.meta ?? '',
    status: opt.status ?? '',
    url: opt.url ?? '',
    linkLabel: opt['link-label'] ?? 'view',
  });

  if (payload.text.length > TELEGRAM_LIMIT) {
    // Should be unreachable — escapeToFit bounds the only unbounded field. Checked anyway, because
    // the alternative to catching it here is Telegram rejecting the whole message.
    die(`assembled text is ${payload.text.length} chars, over Telegram's ${TELEGRAM_LIMIT} limit`);
  }

  const result = await send(botToken, payload);
  if (result?.ok) {
    process.stderr.write(`✓ ping delivered (${payload.text.length} chars)\n`);
    return;
  }

  // Loud. See the exit-code policy in this file's header for why this is not `|| true`.
  process.stderr.write(`::error title=Telegram ping NOT delivered::${JSON.stringify(result)}\n`);
  process.exitCode = 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
