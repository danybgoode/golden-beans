// telegram-format.mjs — shared message-formatting safety nets for Telegram's hard 4096-char
// sendMessage limit. Used by both standup.mjs and weekly-recap.mjs (originally built for weekly-recap,
// moved here 2026-07-03 after standup.mjs hit the exact same failure mode live: a missing/wiped delta
// log made it enumerate gh's entire recent-PR history as "new," overflowing the limit and dying before
// ever posting or persisting its own log).

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

function decodeHtmlEntities(s) {
  return String(s ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function formatTelegramHtmlLink(label, url) {
  return `<a href="${escAttr(url)}">${esc(label)}</a>`;
}

export function telegramHtmlVisibleText(text) {
  return decodeHtmlEntities(
    String(text ?? '')
      .replace(/<a\s+href="[^"]*">([\s\S]*?)<\/a>/g, '$1')
      .replace(/<[^>]*>/g, '')
  );
}

export function telegramHtmlVisibleLength(text) {
  return telegramHtmlVisibleText(text).length;
}

export function telegramHtmlToConsoleText(text) {
  return decodeHtmlEntities(
    String(text ?? '')
      .replace(/<a\s+href="([^"]*)">([\s\S]*?)<\/a>/g, '$2 ($1)')
      .replace(/<[^>]*>/g, '')
  );
}

// Pure — caps a list of {number, title} PRs to maxItems titles before it can dominate a message on a
// busy day/week, folding the rest into a "…and N more" tail. The caller's own section-header count is
// never capped, only the listed titles are.
export function formatPrList(prs, maxItems) {
  const shown = prs
    .slice(0, maxItems)
    .map((p) => `#${p.number} ${esc(p.title)}`)
    .join('; ');
  const rest = prs.length - maxItems;
  return rest > 0 ? `${shown}; …and ${rest} more` : shown;
}

// Pure — a last-resort safety net for Telegram's hard 4096-char sendMessage limit. formatPrList (or an
// equivalent per-caller cap) should already keep a normal message well under this; this only bites an
// extreme outlier so the API call never gets rejected outright instead of silently never posting. Two
// HTML-safety steps, since the only tags these scripts emit are `<b>`/`</b>` and an unbalanced/incomplete
// one would make Telegram reject the whole message as invalid HTML — defeating the safety net's purpose:
// (1) strip a trailing PARTIAL tag first (the cut landing mid-`<b>`/`</b>` itself, e.g. a dangling `<b`),
// (2) then close any remaining fully-formed-but-unclosed `<b>`. Appending closing tags can itself push
// the result back OVER `limit` — iterate, shrinking the cut point by however much was appended, until the
// FINAL (post-closing-tags) length actually fits. Bounded to a few iterations (closing tags are 4 chars
// each, so this converges immediately in every realistic case); a hard fallback strips all tags entirely
// if it somehow doesn't, guaranteeing the contract ("result never exceeds limit") holds regardless.
export function truncateForTelegram(text, limit) {
  if (text.length <= limit) return text;
  let cut = limit - 1; // room for the ellipsis
  for (let i = 0; i < 10; i += 1) {
    const sliced = text.slice(0, cut).replace(/<[^>]*$/, '');
    const candidate = `${sliced.trim()}…`;
    const opens = (candidate.match(/<b>/g) || []).length;
    const closes = (candidate.match(/<\/b>/g) || []).length;
    const closingTags = opens > closes ? '</b>'.repeat(opens - closes) : '';
    const final = `${candidate}${closingTags}`;
    if (final.length <= limit) return final;
    cut -= Math.max(closingTags.length, 1);
  }
  return `${text
    .replace(/<[^>]*>/g, '')
    .slice(0, limit - 1)
    .trim()}…`;
}
