/**
 * A `class="…"` attribute fragment that matches a class NAME rather than an exact attribute value.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────────────────────
 * Specs over server-rendered HTML kept writing `class="methodology-lede"` — an exact-value match
 * that silently stops matching the moment the element gains a second class. The failure is not a
 * false pass (the surrounding assertions are `.not.toBeNull()`, so it fails safe), but it fails for
 * a reason that has nothing to do with the thing under test, and the next person debugs the wrong
 * file.
 *
 * Antigravity flagged ONE of these in round 4 of PR #105. There were four across two spec files,
 * one of which was already written correctly — a pattern half-applied is exactly the "fix the
 * class, not the instance the reviewer named" rule. So the pattern lives in one place now and
 * cannot be written wrong a fifth time.
 *
 * `\b…\b` on both sides rather than `name[^"]*`: the latter matches `class="target extra"` but NOT
 * `class="extra target"`, which is the same bug one word over. Order does not matter to the DOM and
 * it must not matter here.
 */
export function withClass(name: string): string {
  return `class="[^"]*\\b${name}\\b[^"]*"`
}

/**
 * A global regex matching `<tag …class="…name…">…</tag>`, capturing the element's inner HTML.
 *
 * Deliberately not a general HTML parser — these specs assert on a handful of known, flat elements
 * this app renders itself. Anything that needs real nesting belongs in the `browser` project, where
 * there is a DOM to query.
 */
export function elementsByClass(tag: string, name: string): RegExp {
  return new RegExp(`<${tag} ${withClass(name)}>([\\s\\S]*?)</${tag}>`, 'g')
}
