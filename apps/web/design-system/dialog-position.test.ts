import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { SWEPT_ROOTS, sourceFiles } from '../../../scripts/check-design-drift.mjs'
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

/** A `.tsx` source with its comments removed, so prose about a tag is never read as a tag. */
function withoutSourceComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[^\S\n]*\/\/.*$/gm, '')
}

/**
 * Class names carried by a native `<dialog>` element anywhere in the product.
 *
 * ⚠️ **This function's previous version did not do what its own comment said.** It claimed to
 * enumerate every dialog "FROM THE SOURCE" and to "stop the next dialog shipping unguarded", and
 * it did neither (fresh reviewer, round 5, Blocking — both halves mutation-proven):
 *
 *  - The file list was **hand-maintained**, three paths, derived from nothing. A `<dialog>` added to
 *    any other component was invisible: adding one to `CommandPalette.tsx` left the suite green.
 *  - The scan took a GREEDY 1200-character window per match, so `lastIndex` jumped past any second
 *    `<dialog>` inside it. Inserting a decoy dialog one line above the flags wizard, giving the
 *    decoy an auto margin, and DELETING the wizard's own — the precise regression this file exists
 *    to catch — left the suite green.
 *
 * So the round-3 fix guarded one dialog of three, and the round-4 fix guarded three of three by
 * hand, in a way one line of JSX defeats. Both are the same defect: a completeness claim with no
 * mechanism behind it.
 *
 * Now the tree is walked (the drift guard's own `sourceFiles` over its own `SWEPT_ROOTS`, so this
 * cannot drift from what the repo considers its source), and the scan splits ON the tag so one
 * dialog can never swallow the next.
 */
function dialogClasses(): { className: string; file: string }[] {
  const root = join(WEB, '..', '..')
  const found: { className: string; file: string }[] = []

  for (const relativeRoot of SWEPT_ROOTS) {
    for (const file of sourceFiles(join(root, relativeRoot))) {
      // ⚠️ Comments stripped FIRST. `ConfirmDialog.tsx` says "Why a native <dialog> and not a
      // hand-rolled overlay" in a header comment, and the scan read it as a real tag with no
      // class. That is the same comment-blindness the cascade scan shipped one round ago, in the
      // other direction: there a comment HID a rule, here a comment INVENTS a dialog.
      const source = withoutSourceComments(readFileSync(file, 'utf8'))
      // Split ON the tag rather than taking a window after it: every chunk after the first begins
      // immediately inside one `<dialog`, and ends where the NEXT one begins. A dialog cannot be
      // consumed by its neighbour, and there is no window length to get wrong.
      const chunks = source.split(/<dialog\b/).slice(1)
      for (const chunk of chunks) {
        // Only the attributes, not the children: a `className` on an element INSIDE the dialog is
        // not the dialog's own. The tag ends at the first `>` that is not inside braces or quotes.
        const attributes = tagAttributes(chunk)
        const className = /className=(?:"([^"]+)"|'([^']+)'|\{`([^`]+)`\})/.exec(attributes)
        if (className) {
          found.push({
            className: (className[1] ?? className[2] ?? className[3]).trim().split(/\s+/)[0],
            file: file.slice(root.length + 1),
          })
        } else {
          // A `<dialog>` whose class this scan cannot read is not a dialog this scan has checked.
          throw new Error(
            `${file.slice(root.length + 1)} has a <dialog> with no readable className — ` +
              'dialog-position.test.ts cannot confirm it is centred, so it must not pass silently.'
          )
        }
      }
    }
  }
  return found
}

/** The attribute text of a JSX tag: everything up to the first `>` outside braces and quotes. */
function tagAttributes(chunk: string): string {
  let depth = 0
  let quote: string | null = null
  for (let index = 0; index < chunk.length; index += 1) {
    const char = chunk[index]
    if (quote) {
      if (char === quote && chunk[index - 1] !== '\\') quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    else if (char === '>' && depth === 0) return chunk.slice(0, index)
  }
  return chunk
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
  const dialogs = dialogClasses()
  // A scan that found nothing would pass silently — the failure mode this whole file is about.
  assert.ok(
    dialogs.length >= 3,
    `expected at least three native dialogs, found ${dialogs.length}: ` +
      `${dialogs.map((d) => d.className).join(', ')}`
  )

  // ⚠️ …and a COUNT is not a completeness check: any three names satisfied it, so a decoy dialog
  // could stand in for the real one while the real one's margin was deleted. The three that must be
  // there are named (fresh reviewer, round 5, Blocking).
  for (const required of ['confirm-dialog', 'modal', 'ds-dialog']) {
    assert.ok(
      dialogs.some((dialog) => dialog.className === required),
      `.${required} is a native <dialog> this product ships and the scan did not find it`
    )
  }

  const all = rules()
  for (const { className, file } of dialogs) {
    const owning = all.filter(({ selector }) =>
      selector.split(',').some((part) => new RegExp(`\\.${className}(?![\\w-])\\s*$`).test(part.trim()))
    )
    assert.ok(owning.length > 0, `.${className} is on a <dialog> in ${file} and no stylesheet styles it`)

    // ⚠️ The LAST matching rule, not any of them. `owning.some(...)` was order-blind, so appending
    // `.confirm-dialog { margin: 0 }` anywhere later in the stylesheet won in the browser and the
    // guard never looked (fresh reviewer, round 5, Minor). The cascade takes the last one; so does
    // this.
    const decisive = owning.filter(({ body }) => /margin/.test(body)).at(-1)
    assert.ok(
      decisive && horizontalMarginIsAuto(decisive.body),
      `.${className} (${file}) is a native <dialog> and the LAST rule to set its margin does not ` +
        "centre it horizontally. globals.css's `* { margin: 0 }` defeats the UA's centring, so it " +
        'will render pinned to the top-left corner — the exact defect console-ia-overhaul S3.3 ' +
        'fixed and D12 exists to keep fixed.'
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
