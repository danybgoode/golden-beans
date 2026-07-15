import 'server-only'

/**
 * Telegram messaging — ported from medusa-bonsai's `lib/telegram.ts` (same bot, same admin chat,
 * same shape: never throws, Telegram is observability, not critical path). golden-beans is a
 * single-audience internal tool (no seller/buyer channels), so this only carries the admin path.
 *
 * `tgNotify()`/`tg.alert()` are async and DO await the network call (matching medusa-bonsai's own
 * implementation) — call them without `await` at the call site for true fire-and-forget; awaiting
 * them will hold the caller for up to the 5s timeout below.
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN — bot token from @BotFather (required for any send)
 *   TELEGRAM_CHAT_ID   — Daniel's chat ID (required for any send)
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

/** Send a Telegram message to the admin chat. Never throws — Telegram is observability, not critical path. */
export async function tgNotify(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return // silently skip if not configured

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(5000), // 5s timeout — never block the caller
    })
    // fetch() doesn't throw on 4xx/5xx — log so a bad token/chat ID or a rejected
    // message doesn't fail silently (never throws; this is debug visibility only).
    if (!res.ok) console.error('[telegram] send failed:', res.status, await res.text().catch(() => ''))
  } catch (err) {
    console.error('[telegram] send error:', err)
  }
}

export const tg = {
  /** Generic admin alert. */
  alert(message: string) {
    return tgNotify(`🚨 <b>Growth Engine alert</b>\n${esc(message)}`)
  },
}

function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
