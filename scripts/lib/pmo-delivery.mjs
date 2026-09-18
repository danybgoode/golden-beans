import {
  formatTelegramHtmlLink,
  telegramHtmlVisibleLength,
  truncateForTelegram,
} from './telegram-format.mjs';

export const TELEGRAM_MAX_CHARS = 4096;

function fmt(value, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `${value}${suffix}`;
}

function windowLabel(metrics) {
  return `${metrics.window.sinceISO.slice(0, 10)} to ${metrics.window.untilISO.slice(0, 10)}`;
}

function artifactLabel(name) {
  return (
    {
      weekly: 'Story-deck',
      monthly: 'Monthly packet',
      sheet: 'Metrics sheet',
    }[name] || name
  );
}

function artifactLinkText(name) {
  return (
    {
      weekly: 'open weekly deck',
      monthly: 'open monthly packet',
      sheet: 'open live sheet',
    }[name] || 'open report'
  );
}

export function buildTelegramDeliveryMessage({ metrics, artifacts, maxChars = TELEGRAM_MAX_CHARS }) {
  const retro = metrics.docOps.retroCoverage;
  const body = [
    `PMO weekly - ${windowLabel(metrics)}`,
    `Stories shipped: ${metrics.throughput.shippedStories} | Epics shipped: ${metrics.throughput.shippedEpics}`,
    `Median PR cycle: ${fmt(metrics.prCycleTime.medianHours, 'h')} | p90: ${fmt(metrics.prCycleTime.p90Hours, 'h')}`,
    `Deploys: ${metrics.deployFrequency.total} merges to main | Reverts/hotfix: ${metrics.changeFailProxy.count}`,
    `Doc-ops: LEARNINGS ${metrics.docOps.learningsPromotions} | Retros ${retro.covered}/${retro.total}`,
  ].join('\n');

  const links = artifacts
    .filter((artifact) => artifact.url)
    .map(
      (artifact) =>
        `${artifactLabel(artifact.name)}: ${formatTelegramHtmlLink(artifactLinkText(artifact.name), artifact.url)}`
    );
  const footer = links.length ? `\n\n${links.join('\n')}` : '';
  if (!footer) return truncateForTelegram(body, maxChars);

  const footerVisibleLength = telegramHtmlVisibleLength(footer);
  if (footerVisibleLength >= maxChars) return truncateForTelegram(body, maxChars);
  const bodyLimit = maxChars - footerVisibleLength;
  return `${truncateForTelegram(body, bodyLimit)}${footer}`;
}

export async function sendTelegramMessage({
  chatId,
  text,
  token = process.env.TELEGRAM_BOT_TOKEN,
  fetchImpl = fetch,
}) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set — export it before running pmo-report.mjs.');
  if (!chatId)
    throw new Error(
      'No Telegram chat id configured — set telegram.chatIds.pmo or telegram.chatId in reporting.config.json, or TELEGRAM_CHAT_ID.'
    );

  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10000),
  });

  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    /* response body unavailable */
  }
  if (!res.ok) {
    let detail = bodyText;
    try {
      detail = JSON.stringify(JSON.parse(bodyText));
    } catch {
      /* keep raw non-JSON body */
    }
    throw new Error(`Telegram sendMessage failed: ${res.status} ${detail.slice(0, 300)}`);
  }
}
