import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatTelegramHtmlLink,
  telegramHtmlVisibleLength,
  truncateForTelegram,
} from './telegram-format.mjs';
import { buildDocViewerUrl } from './pmo-templates.mjs';
import { kitRoot } from './project-root.mjs';

const TEMPLATE_PATH = join(kitRoot(), 'standup', 'templates', 'daily-story-deck.md'); // D2: a kit asset
const TELEGRAM_MAX_CHARS = 4096;

export const STANDUP_DECK_ASPECT_RATIO = '16:9';

function shortRepo(repo) {
  return repo.split('/')[1] || repo;
}

function decodeTelegramEntities(text) {
  return String(text ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function telegramHtmlToMarkdown(text) {
  return decodeTelegramEntities(
    String(text ?? '')
      .replace(/<b>(.*?)<\/b>/g, '**$1**')
      .replace(/<[^>]*>/g, '')
  );
}

function bulletList(lines, fallback) {
  const items = lines.filter(Boolean);
  if (!items.length) return `- ${fallback}`;
  return items.map((line) => `- ${line}`).join('\n');
}

function getPath(obj, path) {
  return path.split('.').reduce((cur, part) => (cur == null ? undefined : cur[part]), obj);
}

export function fillStandupTemplate(template, data) {
  return template.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (match, key) => {
    const value = getPath(data, key);
    return value === undefined ? match : String(value);
  });
}

export function buildStandupDeckData({ snapshot, deltaLines = [], generatedAt = new Date() }) {
  const date = String(snapshot?.ts || generatedAt.toISOString()).slice(0, 10);
  const repos = Object.entries(snapshot?.repos || {}).map(([repo, state]) => {
    if (!state) return `**${shortRepo(repo)}:** unavailable`;
    return (
      `**${shortRepo(repo)}:** ${state.openNumbers?.length || 0} open; ` +
      `${state.failingOpenNumbers?.length || 0} red; ${state.conflictingOpenNumbers?.length || 0} conflicts`
    );
  });
  const smoke = snapshot?.smoke
    ? `${snapshot.smoke.conclusion || snapshot.smoke.status || 'unknown'} (${String(snapshot.smoke.createdAt || '').slice(0, 10) || 'no date'})`
    : 'unavailable';
  const stalePreviews = snapshot?.stalePreviews == null ? 'unavailable' : String(snapshot.stalePreviews);
  return {
    deck: {
      aspectRatio: STANDUP_DECK_ASPECT_RATIO,
    },
    window: {
      date,
      generatedDate: generatedAt.toISOString().slice(0, 10),
    },
    summary: {
      bullets: bulletList(
        deltaLines.map(telegramHtmlToMarkdown),
        'Quiet night - nothing new since the last standup.'
      ),
    },
    repos: {
      bullets: bulletList(repos, 'Repository signals unavailable.'),
    },
    guards: {
      browserSmoke: smoke,
      buildOrder: snapshot?.buildOrderDrifted ? 'drift detected' : 'up to date',
      stalePreviews,
    },
  };
}

export function loadStandupDeckTemplate() {
  return readFileSync(TEMPLATE_PATH, 'utf8');
}

export function buildStandupDeckMarkdown(options) {
  return fillStandupTemplate(loadStandupDeckTemplate(), buildStandupDeckData(options));
}

// No viewer configured → no artifact. The Telegram text is the canonical read; the deck is an optional
// extra, and an extra must never be faked with someone else's hosting.
export function buildStandupArtifacts({ docViewerUrl, ...options } = {}) {
  if (!docViewerUrl) return [];
  const markdown = buildStandupDeckMarkdown(options);
  return [
    {
      name: 'standup',
      markdown,
      url: buildDocViewerUrl(markdown, { baseUrl: docViewerUrl, present: true }),
    },
  ];
}

export function appendStandupArtifactsToMessage(message, artifacts, maxChars = TELEGRAM_MAX_CHARS) {
  if (!artifacts.length) return truncateForTelegram(message, maxChars);
  const suffix = `\n\n${artifacts
    .map((artifact) => `Deck ${artifact.name}: ${formatTelegramHtmlLink('open daily story', artifact.url)}`)
    .join('\n')}`;
  const suffixVisibleLength = telegramHtmlVisibleLength(suffix);
  if (suffixVisibleLength >= maxChars) return truncateForTelegram(message, maxChars);
  return `${truncateForTelegram(message, maxChars - suffixVisibleLength)}${suffix}`;
}
