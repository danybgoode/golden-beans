/**
 * Matching an element by CLASS NAME in server-rendered HTML.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────────────────────
 * Specs over rendered HTML kept writing `class="methodology-lede"` — an exact-value match that
 * stops matching the moment the element gains a second class. Four of them existed across two spec
 * files, and a fifth was already written correctly, which is the half-applied pattern that
 * guarantees a sixth. So the pattern lives here.
 *
 * ── This helper's OWN first draft was wrong twice, which is why it is tested ───────────────────
 * Antigravity found both in round 5 of PR #105, on the fix for its own round-4 finding:
 *
 *   1. `\b${name}\b` looked like a word-boundary check and is not one for CSS class names. `-` is a
 *      NON-word character in JavaScript regex, so `\b` happily matches the boundary between `d` and
 *      `-`: `\bmethodology-card\b` matches `class="methodology-card-header"` and
 *      `class="old-methodology-card"`. That is a false POSITIVE the exact-match form it replaced
 *      did not have — the fix carrying a new bug.
 *   2. `<tag class="…">` required `class` to be the element's only attribute. Any `id`, `data-*`
 *      or `aria-*` React renders alongside it and the regex silently stops matching.
 *
 * A class attribute is a whitespace-separated list, so it is matched as one: optional
 * `<anything> <space>` before, optional `<space> <anything>` after, and nothing else touching the
 * name. `html-class.test.ts` pins every one of these cases, because a matcher that quietly stops
 * matching turns its callers' assertions into questions nobody is asking.
 */

/** Regex-escape a class name. Hyphens are literal already; this guards the rest. */
function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A `class="…"` attribute fragment matching an element that CARRIES `name` among its classes,
 * in any position, alongside any number of others.
 */
export function withClass(name: string): string {
  const escaped = escapeForRegex(name)
  return `class="(?:[^"]*\\s)?${escaped}(?:\\s[^"]*)?"`
}

/**
 * A global regex matching `<tag …>…</tag>` for elements carrying `name`, capturing inner HTML.
 *
 * Other attributes may sit on either side of `class`. Deliberately not a general HTML parser —
 * these specs assert on a handful of known, flat elements this app renders itself. Anything
 * needing real nesting belongs in the `browser` project, where there is a DOM to query.
 */
export function elementsByClass(tag: string, name: string): RegExp {
  return new RegExp(`<${tag}\\b[^>]*?\\s${withClass(name)}[^>]*>([\\s\\S]*?)</${tag}>`, 'g')
}
