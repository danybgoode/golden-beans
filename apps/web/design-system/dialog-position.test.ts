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

    // `margin: auto`, `margin: 8vh auto auto`, `margin-inline: auto` — the shorthand forms differ,
    // the property being asserted does not: SOMETHING must restore the horizontal auto the
    // universal reset took away.
    const centred = owning.some(({ body }) => /margin(-inline)?\s*:\s*[^;]*\bauto\b/.test(body))
    assert.ok(
      centred,
      `.${className} is a native <dialog> and no rule gives it an auto horizontal margin. ` +
        "globals.css's `* { margin: 0 }` defeats the UA's centring, so it will render pinned to the " +
        'top-left corner — the exact defect console-ia-overhaul S3.3 fixed and D12 exists to keep fixed.'
    )
  }
})
