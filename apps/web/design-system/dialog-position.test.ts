import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, '..')

/**
 * ⚠️ **Every native `<dialog>` in this product, and the margin that decides where it lands.**
 *
 * `globals.css` applies a universal `* { margin: 0 }` reset, which defeats the UA's
 * `dialog:modal { inset: 0; margin: auto }`. The result is not subtle: `inset: 0` alone pins the
 * dialog to the TOP-LEFT CORNER, and every confirmation dialog in this product sat at x:0, y:0 from
 * the day the component shipped until `console-ia-overhaul` S3.3, because no test looked at where a
 * dialog was.
 *
 * D12 says the fix "is one stylesheet edit away from silently regressing". Round 3 proved that
 * literally: deleting `margin: auto` from `.confirm-dialog` left the entire gate green. That was
 * fixed with a rendered assertion on the specimen — and the fix covered ONE of the three dialogs.
 * `.is-console .modal`, the new-feature wizard on the flags page, has the same workaround, the same
 * comment explaining it, and nothing asserting it (fresh reviewer, round 3, Major).
 *
 * This is the class fix. It is a STATIC check because it must cover dialogs on routes that need a
 * real tenant and real data to open, which a specimen cannot render — the rendered assertion on
 * `.confirm-dialog` and `.ds-dialog` stays, and this stops the next dialog shipping unguarded.
 */

const STYLESHEETS = ['app/globals.css', 'app/console.css', 'design-system/system.css']

/** Class names carried by a native `<dialog>` element anywhere in the app. */
function dialogClasses(): string[] {
  const sources = [
    'app/app/flags/[projectSlug]/new-feature.tsx',
    'app/app/design-system/specimen-dialog.tsx',
    'components/ui/ConfirmDialog.tsx',
  ]
  const found = new Set<string>()
  for (const relative of sources) {
    const source = readFileSync(join(WEB, relative), 'utf8')
    // A window after the tag name rather than "up to the closing `>`": the wizard's `<dialog>` runs
    // past 400 characters of explanatory comment before its `>`, so a lazy match to the tag end
    // found nothing and the scan silently dropped it. The count assertion below is what makes an
    // over- or under-matching window fail loudly instead of quietly.
    for (const match of source.matchAll(/<dialog\b[\s\S]{0,1200}/g)) {
      const className = /className=(?:"([^"]+)"|\{`([^`]+)`\})/.exec(match[0])
      if (className) found.add((className[1] ?? className[2]).split(/\s+/)[0])
    }
  }
  return [...found]
}

function rules(): { selector: string; body: string }[] {
  return STYLESHEETS.flatMap((relative) => {
    const css = readFileSync(join(WEB, relative), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
      selector: match[1].trim().replace(/\s+/g, ' '),
      body: match[2],
    }))
  })
}

/**
 * Does this declaration block set BOTH horizontal margins to `auto`?
 *
 * ⚠️ **This was `/margin(-inline)?:\s*[^;]*\bauto\b/`, which is a guard that cannot fail on the
 * defect it names.** `margin: 0 0 auto` sets the BOTTOM margin to auto and both horizontal margins
 * to zero; `margin: auto 0` sets the vertical ones. Both contain the word "auto", both passed, and
 * both leave the dialog exactly as far from centre as deleting the margin entirely. The shorthand
 * has to be RESOLVED, not searched — anything else is asking whether the right letters appear.
 *
 * Found by checking my own commit against the suspicion the previous four rounds earned, rather
 * than by a reviewer finding it a fifth time.
 */
function horizontalMarginIsAuto(body: string): boolean {
  let left: string | null = null
  let right: string | null = null

  // Source order decides, so later declarations overwrite earlier ones.
  for (const declaration of body.split(';')) {
    const [rawProperty, rawValue] = declaration.split(':')
    if (!rawProperty || !rawValue) continue
    const property = rawProperty.trim().toLowerCase()
    const value = rawValue
      .trim()
      .toLowerCase()
      .replace(/\s*!important$/, '')
    if (!value) continue

    if (property === 'margin-left' || property === 'margin-inline-start') left = value
    else if (property === 'margin-right' || property === 'margin-inline-end') right = value
    else if (property === 'margin-inline') {
      const parts = value.split(/\s+/)
      left = parts[0]
      right = parts[1] ?? parts[0]
    } else if (property === 'margin') {
      const parts = value.split(/\s+/)
      // 1 → all · 2 → block inline · 3 → top inline bottom · 4 → top right bottom left
      if (parts.length === 1) left = right = parts[0]
      else if (parts.length === 2 || parts.length === 3) left = right = parts[1]
      else if (parts.length === 4) {
        right = parts[1]
        left = parts[3]
      }
    }
  }
  return left === 'auto' && right === 'auto'
}

test('every native <dialog> is horizontally centred by an explicit margin', () => {
  const classes = dialogClasses()
  // A scan that found nothing would pass silently — the failure mode this whole file is about.
  assert.ok(
    classes.length >= 3,
    `expected at least three native dialogs, found ${classes.length}: ${classes.join(', ')}. ` +
      'If a dialog was removed, remove it from the source list too.'
  )

  const all = rules()
  for (const className of classes) {
    const owning = all.filter(({ selector }) =>
      selector.split(',').some((part) => new RegExp(`\\.${className}(?![\\w-])\\s*$`).test(part.trim()))
    )
    assert.ok(owning.length > 0, `.${className} is on a <dialog> and no stylesheet styles it`)

    const centred = owning.some(({ body }) => horizontalMarginIsAuto(body))
    assert.ok(
      centred,
      `.${className} is a native <dialog> and no rule gives it an auto horizontal margin. ` +
        "globals.css's `* { margin: 0 }` defeats the UA's centring, so it will render pinned to the " +
        'top-left corner — the exact defect console-ia-overhaul S3.3 fixed and D12 exists to keep fixed.'
    )
  }
})

test('the margin check resolves the shorthand rather than searching it for the word "auto"', () => {
  // The two that mattered: both contain "auto", neither centres horizontally.
  assert.equal(horizontalMarginIsAuto('margin: 0 0 auto;'), false, 'bottom auto is not centring')
  assert.equal(horizontalMarginIsAuto('margin: auto 0;'), false, 'vertical auto is not centring')
  assert.equal(horizontalMarginIsAuto('margin-block: auto;'), false)

  // The three the product actually uses.
  assert.equal(horizontalMarginIsAuto('margin: auto;'), true)
  assert.equal(horizontalMarginIsAuto('margin: 8vh auto auto;'), true)
  assert.equal(horizontalMarginIsAuto('margin-inline: auto;'), true)

  // Four-value form, and later declarations winning over earlier ones.
  assert.equal(horizontalMarginIsAuto('margin: 0 auto 0 auto;'), true)
  assert.equal(horizontalMarginIsAuto('margin: 0 auto 0 0;'), false, 'left is 0 — not centred')
  assert.equal(horizontalMarginIsAuto('margin: auto; margin-left: 0;'), false, 'the later rule wins')
  assert.equal(horizontalMarginIsAuto('margin: 0; margin-inline: auto;'), true)
  assert.equal(horizontalMarginIsAuto('margin: auto !important;'), true)
})
