/**
 * Parsing computed CSS colours in e2e specs.
 *
 * ── Why this is shared, and why it is careful ─────────────────────────────────────────────────
 * Two specs grew their own colour parsers — one for contrast ratios, one for "is this surface
 * translucent" — and both assumed `rgb()` serialises with COMMAS. Antigravity flagged it in round 1
 * of PR #107, and the two failure modes are not equally visible:
 *
 *   · the contrast parser would produce `NaN` and fail LOUDLY, which is survivable;
 *   · the opacity check would `split(',')` a space-separated `rgb(22 18 13 / 0.72)` into ONE part,
 *     see fewer than four components, and report the surface as OPAQUE — a silent false PASS on the
 *     exact assertion that spec exists to make.
 *
 * CSS Color Module Level 4 permits `rgb(r g b / a)`, and `color-mix()` already serialises as
 * `color(srgb …)` in Chromium today. So this understands all three forms, and THROWS on anything it
 * does not recognise rather than guessing — a colour parser that silently returns a default is how
 * a guard stops guarding (CODE-QUALITY #5b).
 */

export interface Rgba {
  /** 0–255. */
  r: number
  g: number
  b: number
  /** 0–1. */
  a: number
}

export function parseCssColor(value: string): Rgba {
  const trimmed = value.trim()

  // `rgb()` / `rgba()`, comma- OR space-separated, with an optional `/ alpha`.
  const legacy = trimmed.match(/^rgba?\(([^)]+)\)$/i)
  if (legacy) {
    const [channels, alpha] = legacy[1].split('/')
    const parts = channels
      .split(/[,\s]+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map(Number)
    if (parts.length < 3 || parts.some(Number.isNaN)) {
      throw new Error(`unparsed colour channels: ${value}`)
    }
    // The legacy comma form carries alpha as a fourth channel; the modern form after a slash.
    const a = alpha !== undefined ? Number(alpha.trim()) : parts.length > 3 ? parts[3] : 1
    if (Number.isNaN(a)) throw new Error(`unparsed alpha: ${value}`)
    return { r: parts[0], g: parts[1], b: parts[2], a }
  }

  // `color(srgb r g b / a)` — 0-1 floats. What `color-mix()` computes to.
  const srgb = trimmed.match(/^color\(srgb\s+([^)]+)\)$/i)
  if (srgb) {
    const [channels, alpha] = srgb[1].split('/')
    const parts = channels.trim().split(/\s+/).map(Number)
    if (parts.length < 3 || parts.some(Number.isNaN)) {
      throw new Error(`unparsed colour channels: ${value}`)
    }
    const a = alpha !== undefined ? Number(alpha.trim()) : 1
    if (Number.isNaN(a)) throw new Error(`unparsed alpha: ${value}`)
    return { r: parts[0] * 255, g: parts[1] * 255, b: parts[2] * 255, a }
  }

  if (trimmed === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  throw new Error(`unparsed colour: ${value}`)
}

export function isOpaque(value: string): boolean {
  return parseCssColor(value).a === 1
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG 2.x contrast ratio between two OPAQUE colours. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(parseCssColor(foreground)) + 0.05
  const b = relativeLuminance(parseCssColor(background)) + 0.05
  return Math.max(a, b) / Math.min(a, b)
}
