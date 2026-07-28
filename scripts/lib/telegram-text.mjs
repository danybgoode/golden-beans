// Telegram text helpers — platform naming + limit over the shared notification text rule.
//
// Extracted from scripts/commit-report.mjs (2026-07-26) so the CI notification rail can share the
// exact same implementation instead of carrying a paraphrase of it. The rail previously assembled its
// message in an inline jq program; a jq copy of `escapeToFit` was written, and its very first test
// proved it wrong in precisely the way the comment below predicts (3,500 `>` characters escaped to
// 14,129). Rather than fix a second implementation to agree with the first, there is now only one.
//
// `notification-text.mjs` is zero-dependency and directly unit-testable. This wrapper preserves the
// established public names consumed by telegram-notify.mjs and commit-report.mjs.
export {
  escapeEntities as escapeHtml,
  escapeToFit,
  truncateWords,
} from './notification-text.mjs';

export const TELEGRAM_LIMIT = 4096;
