import 'server-only'
import { shouldSendOperatorNotification } from './notify-policy'

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

/**
 * Send a Telegram message to the admin chat. Never throws — Telegram is observability, not critical
 * path.
 *
 * ── The environment gate (added 2026-07-26, after 100+ pings from spec runs) ──────────────────
 * `shouldSendOperatorNotification` decides whether this RUNTIME may message a human at all. It is
 * checked here, at the one boundary every notification crosses, rather than in any individual
 * caller — see lib/notify-policy.ts for the incident. The previous condition ("are the credentials
 * set?") was necessary and nowhere near sufficient: `.env.local` carries real credentials and
 * Playwright loads it into the app under test, so a local spec run was fully configured to page
 * the product owner, 21 disposable tenants at a time.
 */
export async function tgNotify(text: string): Promise<void> {
  const decision = shouldSendOperatorNotification()
  if (!decision.send) {
    // Debug-visible but never noisy: 'unconfigured' is the ordinary local case and stays silent,
    // while a SUPPRESSED send in a configured environment is worth one line, because "the ping
    // never arrived" and "the ping was deliberately withheld" are different facts and the second
    // one should not need a code read to establish.
    if (decision.reason !== 'unconfigured') {
      console.info(`[telegram] send suppressed (${decision.reason})`)
    }
    return
  }
  if (!BOT_TOKEN || !CHAT_ID) return // belt-and-braces; the policy already required both

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
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
