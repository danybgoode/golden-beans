// The weld between three stylesheets and one TypeScript module (epic README, D2).
//
// ── What this file exists to make impossible ──────────────────────────────────────────────────
// `console.css` carried 23 custom properties under a comment saying they were
// `references/design/assets/tokens.css` "verbatim — the design introduced no new colours". Ten of
// them were not in that file at all, and one of them — `--roast-2` — had a DIFFERENT VALUE there.
// Nothing noticed for an entire epic, because two definitions that currently agree look exactly
// like one definition, and a comment asserting they agree looks exactly like a check.
//
// So this is the check. It reads the real bytes of all three stylesheets and the generated TS
// module, and fails when they stop agreeing about anything that is not an explicitly allowed fork.
//
// ⚠️ It deliberately does NOT assert that the three sets are identical. They are not, and they
// should not be: the landing needs kraft, foil and brass; the console needs elevation, radius and
// motion tokens the landing has no use for. What must never happen is the same NAME meaning two
// different things without somebody having decided that on purpose.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DESIGN_TOKENS } from './tokens.ts'
import {
  FONT_STACK_OVERRIDES,
  SCOPE_SELECTORS,
  readPrototypeStyle,
  readTokens,
  generate,
} from './extract-css.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')
const BRAND_TOKENS = join(REPO, 'references', 'design', 'assets', 'tokens.css')

/**
 * The FORKED tokens: one name, two live values, decided on purpose.
 *
 * A fork is not a bug — `--roast-2` genuinely paints two different surfaces — but an UNDECLARED
 * fork is, because the next person to change one of them will assume they are changing both. Every
 * entry here costs a sentence explaining what would break if the two were unified, and the test
 * below fails on any fork that is not listed.
 *
 * Keep this list short. If it grows past a handful, the answer is a rename, not another row.
 */
const FORKED_TOKENS: Record<string, string> = {
  '--roast-2':
    'The alternating band. #221b13 on the landing (a warm kraft-adjacent band under the fold) and ' +
    '#1c1710 in the console (a near-black row stripe that must not compete with --card). Both are ' +
    'on screen today; unifying them would visibly change one of the two surfaces, which is a design ' +
    'decision and not a refactor. Scoping the product set to a class is what lets both keep the name.',
}

/** `--name: value;` pairs from the first `:root` block of a stylesheet. */
function rootTokensOf(path: string): Map<string, string> {
  const source = readFileSync(path, 'utf8')
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? /:root\s*\{([\s\S]*?)\}/.exec(source)?.[1]
  assert.ok(root, `no :root block in ${path}`)
  return new Map(
    [...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])
  )
}

/** `--name: value;` pairs from the generated product token file's scope block. */
function productTokens(): Map<string, string> {
  const source = readFileSync(join(HERE, 'tokens.css'), 'utf8')
  const block = new RegExp(`${SCOPE_SELECTORS.join(',\\s*')}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(source)?.[1]
  assert.ok(block, 'no scope block in the generated tokens.css')
  return new Map(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])
  )
}

test('the generated files are in sync with the approved prototype', () => {
  // The same comparison CI runs. Asserted here too so a developer who regenerates nothing sees it
  // in one second rather than in a CI round-trip — and so this suite fails for the RIGHT reason
  // when the prototype moves, instead of every assertion below failing mysteriously at once.
  for (const [name, expected] of Object.entries(generate(HERE))) {
    const onDisk = readFileSync(join(HERE, name), 'utf8')
    assert.equal(
      onDisk,
      expected,
      `${name} is out of date — run: node apps/web/design-system/extract-css.mjs`
    )
  }
})

test('every generated token name is in the TypeScript union, and vice versa', () => {
  // This is the half of D2 that makes DELETING a token a compile error. A CSS custom property
  // cannot fail a build on its own: an undefined `var()` renders as nothing at paint time, which is
  // the quietest possible failure. The union is what breaks `tsc` at every TypeScript consumer;
  // this assertion is what stops the union and the stylesheet drifting apart.
  const css = [...productTokens().keys()].sort()
  const ts = [...DESIGN_TOKENS].sort()
  assert.deepEqual(ts, css, 'tokens.ts and tokens.css disagree about which tokens exist')
})

test('the ONLY differences from the approved prototype are the declared font-stack overrides', () => {
  const prototype = new Map(readTokens(readPrototypeStyle(HERE)))
  const product = productTokens()

  assert.deepEqual(
    [...product.keys()],
    [...prototype.keys()],
    'the generated token set has gained or lost a name relative to the approved prototype'
  )

  const differing = [...product.entries()]
    .filter(([name, value]) => prototype.get(name) !== value)
    .map(([name]) => name)
    .sort()

  // Not "differing is a subset of the overrides" — EQUAL. A subset check passes when an override is
  // declared and then silently stops applying, which is the failure that leaves a generator with a
  // dead branch nobody notices (LEARNINGS: a guard that cannot fail).
  assert.deepEqual(
    differing,
    Object.keys(FONT_STACK_OVERRIDES).sort(),
    'the generator changed a token the override table does not account for'
  )
})

test('no token name means two different things without a declared fork', () => {
  const brand = rootTokensOf(BRAND_TOKENS)
  const product = productTokens()

  const forks: string[] = []
  for (const [name, value] of product) {
    const other = brand.get(name)
    if (other === undefined) continue
    if (other === value) continue
    forks.push(name)
  }

  for (const name of forks) {
    assert.ok(
      FORKED_TOKENS[name],
      `${name} has a different value on the landing (${brand.get(name)}) and in the product ` +
        `(${product.get(name)}), and no FORKED_TOKENS entry says why. Either unify them or record ` +
        `the decision — an undeclared fork is how the next person changes one and thinks they ` +
        `changed both.`
    )
  }

  // A stale allow-list is its own bug: an entry for a fork that no longer exists reads as a live
  // hazard and makes the real ones harder to see.
  for (const name of Object.keys(FORKED_TOKENS)) {
    assert.ok(
      forks.includes(name),
      `${name} is listed in FORKED_TOKENS but the two stylesheets now agree about it — remove the entry`
    )
  }
})

test('the console resolves the same values it resolved before the token block moved', () => {
  // Sprint 1's whole contract is "no product pixel moves". `console.css` used to declare these
  // locally; they now arrive from the generated file. This pins the values that were deleted, by
  // literal, so a regeneration that changes one of them fails HERE rather than on a screenshot
  // somebody has to notice.
  const product = productTokens()
  const before: Record<string, string> = {
    '--roast': '#16120d',
    '--roast-2': '#1c1710',
    '--card': '#241d14',
    '--card-2': '#2b2318',
    '--card-3': '#332a1d',
    '--line': '#3a3023',
    '--line-soft': '#2e2619',
    '--crema': '#f5ead6',
    '--dim': '#b8a888',
    '--dim-2': '#8d8069',
    '--gold': '#e8b93c',
    '--gold-hot': '#ffd45e',
    '--gold-deep': '#8a6a1e',
    '--green': '#7fd069',
    '--green-deep': '#2c5e22',
    '--red': '#e86a5e',
    '--red-deep': '#6e2a22',
    '--blue': '#6db3e8',
    '--r': '8px',
    '--r-lg': '12px',
    '--shadow': '0 18px 44px rgb(0 0 0 / 44%)',
    '--shadow-hi': '0 24px 64px rgb(0 0 0 / 62%)',
    '--t': '140ms cubic-bezier(.2,0,.2,1)',
  }
  for (const [name, value] of Object.entries(before)) {
    assert.equal(product.get(name), value, `${name} changed value when the token block moved`)
  }

  // ...and the two the console INHERITED rather than declared, which is why they are overrides.
  const brand = rootTokensOf(BRAND_TOKENS)
  assert.equal(product.get('--sans'), brand.get('--sans'), 'the console font stack changed')
  assert.equal(product.get('--mono'), brand.get('--mono'), 'the console mono stack changed')
})

test('the ten tokens the deleted comment claimed were "verbatim" are genuinely NOT in the brand file', () => {
  // The finding itself, pinned. If a future change adds these to the brand token file, this test
  // fails and whoever does it has to decide deliberately whether the fork is over — rather than
  // leaving two files that quietly agree again and a comment that was accidentally right.
  const brand = rootTokensOf(BRAND_TOKENS)
  for (const name of [
    '--card-2',
    '--card-3',
    '--line-soft',
    '--green-deep',
    '--red-deep',
    '--r',
    '--r-lg',
    '--shadow',
    '--shadow-hi',
    '--t',
  ]) {
    assert.equal(
      brand.has(name),
      false,
      `${name} is now in the brand token file — the product/landing fork has changed and D2 needs re-deciding`
    )
  }
})

test('the approved prototype has not changed a byte', () => {
  // ⚠️ **The guard `APPROVED.md` asks for, in its own words:** *"If `console-prototype.html` changes
  // and this hash is not updated with a new approval line, the design is unapproved and the gate
  // should say so. Editing the prototype and quietly leaving the hash alone is the one move this
  // file exists to prevent."* It said that and nothing enforced it — a rule with no check is a
  // preference.
  //
  // This is not hypothetical, and it very nearly happened in the sprint that wrote this test: CI's
  // `format:changed` step went red because Prettier wanted to reformat files in this directory. Had
  // the prototype been in Prettier's scope with `--write`, **a formatter would have un-approved the
  // design** — no person, no decision, no diff anyone would read as significant. It is now in
  // `.prettierignore` AND asserted here, because the two failure modes are different: the ignore
  // stops one specific tool, and this stops every other one.
  //
  // The hash is read out of APPROVED.md rather than pasted here, so there is one place to update
  // when a genuinely new design is approved — and updating it means editing the file that also
  // demands an approval line beside it.
  const approved = readFileSync(join(HERE, 'APPROVED.md'), 'utf8')
  const declared = /SHA-256 \(first 16\)\*{0,2} \| `([0-9a-f]{16})`/.exec(approved)?.[1]
  assert.ok(
    declared,
    'APPROVED.md no longer states a SHA-256 for the prototype — that row is the approval record'
  )

  const actual = createHash('sha256')
    .update(readFileSync(join(HERE, 'console-prototype.html')))
    .digest('hex')
    .slice(0, 16)

  assert.equal(
    actual,
    declared,
    `console-prototype.html hashes to ${actual}, and APPROVED.md says ${declared}.\n` +
      'The design this epic is measured against has changed. If that was deliberate, it needs a ' +
      'NEW approval line in APPROVED.md with the new hash — not an updated number. If it was not, ' +
      'something reformatted or rewrote an approved artefact.'
  )
})
