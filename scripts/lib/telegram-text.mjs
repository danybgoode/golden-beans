// Telegram text helpers — the length/escaping rules, in ONE place.
//
// Extracted from scripts/commit-report.mjs (2026-07-26) so the CI notification rail can share the
// exact same implementation instead of carrying a paraphrase of it. The rail previously assembled its
// message in an inline jq program; a jq copy of `escapeToFit` was written, and its very first test
// proved it wrong in precisely the way the comment below predicts (3,500 `>` characters escaped to
// 14,129). Rather than fix a second implementation to agree with the first, there is now only one.
//
// Zero local imports, so `node --test` can load it directly.

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
