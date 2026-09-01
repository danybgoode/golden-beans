// console-ia-overhaul · Sprint 2, Story 2.3 (D5 / A5) — the authorization boundary, at the source.
//
// ── Why a source guard and not a browser test ─────────────────────────────────────────────────
// The property is "a member gets a flat 404 from Setup › Keys, exactly as they do from
// /app/keys today". Proving that in a browser needs a SECOND identity — a real member of the same
// project — and three attempts at driving a second context through the login form hung.
//
// This is the better instrument anyway. A browser test proves one route 404s for one member on one
// run; it can also pass for the wrong reason (a missing route, an expired session, a slug that never
// existed) and this repo has shipped exactly that kind of false green before. A source guard proves
// the shape for EVERY route at once and cannot be satisfied accidentally.
//
// Keyed on the module SPECIFIER and the call, not on formatting: LEARNINGS records that a guard
// keyed on syntax is an allow-list of shapes, and that a renamed binding or a differently-written
// import walks straight past it.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { closedConnectorGate } from './connector-gates.ts'

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../app/app/${relative}`, import.meta.url)), 'utf8')
}

/**
 * Strip comments, tracking BLOCK STATE rather than matching how a line begins.
 *
 * ⚠️ Every guard below that looks for a CALL must go through this, and the reason is a mistake made
 * four times in one sprint: a line in the MIDDLE of a `{/* … *\/}` block starts with ordinary prose,
 * so a line-prefix filter kept it — and the guards then matched against my own written explanation
 * of the defect they exist to forbid. "The line starts with //" is not the distinction between code
 * and writing about code.
 *
 * It also closes a real hole in the ownership guards, which matched the whole file: weakening the
 * merged Keys page to `requireProjectMembership` while leaving any comment mentioning
 * `requireProjectOwnership(` kept all three green, and the ordering check's `gateAt` landed on the
 * comment offset — above the reads — so `readAt > gateAt` held too. Three guards passing while the
 * page became readable by any member (fresh reviewer, PR #123).
 */
function stripComments(text: string): string {
  let out = ''
  let inBlock = false
  for (const line of text.split('\n')) {
    let rest = line
    let kept = ''
    while (rest.length > 0) {
      if (inBlock) {
        const close = rest.indexOf('*/')
        if (close === -1) {
          rest = ''
          break
        }
        inBlock = false
        rest = rest.slice(close + 2)
        continue
      }
      // ⚠️ NOT a bare `indexOf('//')`. That eats every `https://` — the exact trap LEARNINGS
      // records ("stripping them naively eats every https://, turning a loud false positive into a
      // quiet false negative"), and here it silently truncated a route file at its first URL so the
      // import assertion below failed on correct code. A `//` only opens a comment when it is not
      // preceded by `:`.
      const lineComment = (() => {
        for (let at = rest.indexOf('//'); at !== -1; at = rest.indexOf('//', at + 2)) {
          if (at === 0 || rest[at - 1] !== ':') return at
        }
        return -1
      })()
      const blockOpen = rest.indexOf('/*')
      if (blockOpen !== -1 && (lineComment === -1 || blockOpen < lineComment)) {
        kept += rest.slice(0, blockOpen)
        inBlock = true
        rest = rest.slice(blockOpen + 2)
        continue
      }
      if (lineComment !== -1) {
        kept += rest.slice(0, lineComment)
        break
      }
      kept += rest
      break
    }
    out += `${kept}\n`
  }
  return out
}

/** A route's source with comments removed — what every call-site guard must read. */
function code(relative: string): string {
  return stripComments(source(relative))
}

/**
 * The owner-only Setup routes.
 *
 * ⚠️ **ONE entry now, not four — design-system-rails Story 4.5.** This list used to hold the merged
 * page plus the three it took over from, and the test below compared their gates: D5's claim was that
 * the boundary moves "tighter or identical, never looser", and the way to check *identical* is to
 * assert the new route uses the same gate the old ones do.
 *
 * The old ones no longer have a gate to compare against — they are permanent redirects, holding no
 * read, no control and no auth check. Comparing the merged page's gate to theirs would now compare it
 * to nothing and pass, which is a guard that cannot fail: the exact defect class this epic is named
 * after, sitting in the file that guards the credential boundary.
 *
 * So the comparison is retired and replaced by the two properties that survive the retirement, both
 * below: the merged page is owner-gated, and each retired route is genuinely a redirect that holds no
 * credential control. The second is what keeps the first meaningful — an "identical" claim about a
 * page that still minted would be worth nothing.
 */
const OWNER_ONLY = ['setup/keys/[projectSlug]/page.tsx']

/** The three routes Story 4.5 retired. Named, because an exemption nobody writes down grows. */
const RETIRED_CREDENTIAL_ROUTES = [
  'keys/[projectSlug]/page.tsx',
  'agent-keys/[projectSlug]/page.tsx',
  'flag-credentials/[projectSlug]/page.tsx',
]

test('every owner-only Setup route calls requireProjectOwnership', () => {
  for (const route of OWNER_ONLY) {
    const body = code(route)
    assert.match(
      body,
      /requireProjectOwnership\(/,
      `${route} does not call requireProjectOwnership — a member could read it`
    )
    assert.match(body, /from '@\/lib\/dashboard-auth'/, `${route} does not import the canonical auth seam`)
  }
})

test('the merged Keys page is OWNER-gated, and it is the only credential surface left', () => {
  // D5 restated for a world with one surface. The claim used to be a comparison; it is now an
  // absolute, and an absolute is the stronger form — there is nothing left to be "identical to".
  //
  // ⚠️ `requireProjectMembership` is asserted ABSENT as well as ownership being present. Weakening
  // the page to membership while leaving an unused `requireProjectOwnership` import would satisfy a
  // presence check alone, and this page lists every credential in the project.
  const merged = code('setup/keys/[projectSlug]/page.tsx')
  assert.match(merged, /requireProjectOwnership\(/, 'the merged Keys page is not owner-gated')
  assert.equal(
    /requireProjectMembership\(/.test(merged),
    false,
    'the merged Keys page calls requireProjectMembership — the credential boundary moved LOOSER'
  )
})

test('a retired credential route redirects and holds NO credential control', () => {
  // ⚠️ The half that makes the retirement real. "Minting moves onto Setup › Keys in the same commit
  // that retires the three routes" is a claim about two things happening together, and a test that
  // only checked the arrival would pass just as happily on a world with FOUR minting surfaces.
  //
  // Asserted on the source rather than on a response: the property is about what these files ARE.
  // A request-level check would prove one route redirected on one run, and this repo has shipped
  // exactly that kind of false green before.
  for (const route of RETIRED_CREDENTIAL_ROUTES) {
    const body = code(route)
    assert.match(body, /permanentRedirect\(/, `${route} does not redirect — it is still a live page`)
    assert.match(body, /\/app\/setup\/keys\//, `${route} redirects somewhere other than Setup › Keys`)
    for (const control of [
      'issueApiKey',
      'mintFlagReadKey',
      'mintFlagSyncKey',
      'mintAgentWriteKey',
      'listProjectKeys',
      'listAgentWriteKeys',
    ]) {
      assert.equal(
        body.includes(control),
        false,
        `${route} still references ${control} — the controls were supposed to MOVE, not be copied`
      )
    }
  }
})

test('the gate runs BEFORE any credential list is read, and the reads are not hoisted away', () => {
  // ⚠️ **RESTORED, not new.** This test existed before Story 4.5 and was nearly lost in the rewrite
  // of this file's opening block — noted because "a guard deleted while editing the file around it"
  // is how coverage shrinks without anyone deciding to shrink it.
  //
  // Ordering, not just presence. A page that listed keys and then checked ownership would already
  // have done the read — and on a slow render, already spent it.
  //
  // ⚠️ Comparing textual positions is NOT enough, and the first version of this did exactly that.
  // Move the four reads into a helper declared BELOW `export default` and call it from the top of the
  // page body before the gate: `gateAt` lands on the later gate call, `readAt` lands further down
  // inside the helper, `readAt > gateAt` holds, and the test stays green while the reads genuinely
  // run first. So this also pins that the reads are INLINE in the default export's body — the shape
  // the position comparison is only valid for.
  const stripped = code('setup/keys/[projectSlug]/page.tsx')
  const defaultAt = stripped.indexOf('export default')
  const body = stripped.slice(defaultAt)
  const gateAt = body.indexOf('requireProjectOwnership(')
  assert.ok(gateAt >= 0, 'the ownership gate is not inside the default export')

  const reads = ['listProjectKeys', 'listFlagReadKeys', 'listFlagSyncKeys', 'listAgentWriteKeys']
  for (const read of reads) {
    // Exactly one call site, and it is in the page body — not in a helper the body calls, where
    // position tells you nothing about order.
    const occurrences = stripped.split(`${read}(`).length - 1
    assert.equal(occurrences, 1, `${read} is called ${occurrences} times; ordering is unprovable`)
    const readAt = body.indexOf(`${read}(`)
    assert.ok(readAt > gateAt, `${read} is called before the ownership check`)
  }
})

test('every credential MUTATION on the merged page re-asserts ownership itself', () => {
  // ⚠️ Sprint contract #8, and the reason it is a separate assertion from the page's own gate: a
  // Server Action is a public HTTP endpoint. It is reachable by POSTing to the action id without ever
  // rendering the page, so the page's `requireProjectOwnership` protects exactly nothing about it.
  //
  // Every exported action in the module, not a hand-listed subset — a ninth added later is covered
  // the moment it exists, which is what "the page's guard is never the only thing between a member
  // and a mint" has to mean to be true.
  const actions = code('setup/keys/[projectSlug]/actions.ts')
  const exported = [...actions.matchAll(/export async function (\w+)/g)].map((match) => match[1])
  assert.ok(exported.length >= 5, `only ${exported.length} actions found; the scan asserted nothing`)
  for (const name of exported) {
    const start = actions.indexOf(`export async function ${name}`)
    const next = exported
      .map((other) => actions.indexOf(`export async function ${other}`))
      .filter((at) => at > start)
      .sort((a, b) => a - b)[0]
    const body = actions.slice(start, next ?? actions.length)
    assert.match(
      body,
      /await requireProjectOwnership\(/,
      `${name} does not re-assert ownership — a member could reach it without the page`
    )
    // ...and it must resolve the project id FROM that call, never trust a caller-supplied one.
    assert.match(
      body,
      /\{\s*projectId(?:,\s*userId)?\s*\}\s*=\s*await requireProjectOwnership\(/,
      `${name} calls requireProjectOwnership without using the projectId it resolves`
    )
  }
})

test('Setup › Connect is MEMBER-readable, and deliberately so', () => {
  // The asymmetry is the design, not an oversight: reading your project's connector URL is how its
  // operators point an agent at their data. Minting one is credential administration, and THAT is
  // owner-gated in the action rather than on the page.
  const page = code('setup/connect/[projectSlug]/page.tsx')
  assert.match(page, /requireProjectMembership\(/)
  assert.doesNotMatch(
    page,
    /requireProjectOwnership\(/,
    'the connector page became owner-only — members can no longer read their own connector URL'
  )
})

test('every connector MUTATION re-asserts ownership itself', () => {
  // The page guard is never the only thing between a member and a mint (A5). A server action is a
  // public HTTP surface reachable by POST whether or not its page rendered, so each action resolves
  // ownership again rather than trusting the page that linked to it.
  const actions = stripComments(
    readFileSync(
      fileURLToPath(new URL('../app/app/setup/connect/[projectSlug]/actions.ts', import.meta.url)),
      'utf8'
    )
  )
  const mintAt = actions.indexOf('export async function mintConnectorAction')
  const revokeAt = actions.indexOf('export async function revokeConnectorAction')
  assert.ok(mintAt >= 0 && revokeAt >= 0, 'the connector actions are not where this guard expects')

  for (const [name, from] of [
    ['mintConnectorAction', mintAt],
    ['revokeConnectorAction', revokeAt],
  ] as const) {
    const body = actions.slice(from, from === mintAt ? revokeAt : undefined)
    assert.match(body, /requireProjectOwnership\(/, `${name} does not re-check ownership`)
  }
})

test('minting requires the connector gate; revoking deliberately does not', () => {
  // AGENTS rule #3: the connector's two kill switches are independent, and minting the second must
  // never route around the first — so `mintConnectorAction` refuses while `CONNECTOR_ENABLED` is off.
  //
  // Revoke is the deliberate asymmetry. A kill switch that stops working when the feature is
  // disabled is backwards: if the flag were flipped off mid-incident, an owner must still be able to
  // permanently kill the credential. Separate eligibility to BEGIN from authority to END.
  const actions = stripComments(
    readFileSync(
      fileURLToPath(new URL('../app/app/setup/connect/[projectSlug]/actions.ts', import.meta.url)),
      'utf8'
    )
  )
  const revokeAt = actions.indexOf('export async function revokeConnectorAction')
  const mint = actions.slice(actions.indexOf('export async function mintConnectorAction'), revokeAt)
  const revoke = actions.slice(revokeAt)

  // ⚠️ Keyed on the CALL, not the mention. The first version matched `/gatesOpen\(\)/` against the
  // whole function body and failed — on revoke's own comment explaining why it is not gated. Same
  // trap as a substring ban that cannot tell an honest denial from the claim it denies; a guard has
  // to distinguish code from prose about code.
  // `stripComments`, not a line-prefix filter — the same lesson as everywhere else in this file.
  const callsGate = (body: string) => /closedGate\(\)/.test(stripComments(body))

  assert.equal(callsGate(mint), true, 'mint does not check the connector gate')
  assert.equal(
    callsGate(revoke),
    false,
    'revoke was gated — an owner must be able to kill a credential even with the feature switched off'
  )
})

// ── The connector race, and the half of it the application CAN close ──────────────────────────
//
// Cross-review (agy, PR #123) raised `mintConnectorToken` as Blocking: it is a check-then-act with
// no unique index behind it, so two concurrent mints both see "none active" and both insert.
//
// The application cannot make that atomic. What it CAN do — and what these assert — is make the
// outcome survivable: every active token is returned and rendered, so a duplicate is visible and
// revocable instead of live and hidden behind a `LIMIT 1`. That distinction is the whole finding;
// two visible URLs is a mess an owner cleans up, one invisible one is a credential nobody can kill.

test('getConnectorStatus returns EVERY active token, never just the newest', () => {
  const lib = stripComments(
    readFileSync(fileURLToPath(new URL('./connector-tokens.ts', import.meta.url)), 'utf8')
  )
  const start = lib.indexOf('export async function getConnectorStatus')
  const body = lib.slice(start, lib.indexOf('\n}', start))
  assert.ok(start >= 0, 'getConnectorStatus is not where this guard expects')

  // A `.limit(1)` or `.maybeSingle()` here is the defect: it is what made the older of two live
  // tokens invisible. Keyed on the query builder rather than on the return shape, because the return
  // shape can be widened while the query still fetches one row.
  assert.doesNotMatch(
    body,
    /\.limit\(1\)|\.maybeSingle\(\)/,
    'getConnectorStatus fetches a single row again — a second live token would be invisible'
  )
})

test('a failed read is UNREADABLE, and mint refuses on it rather than creating a second token', () => {
  const lib = stripComments(
    readFileSync(fileURLToPath(new URL('./connector-tokens.ts', import.meta.url)), 'utf8')
  )
  const statusStart = lib.indexOf('export async function getConnectorStatus')
  const status = lib.slice(statusStart, lib.indexOf('\n}', statusStart))
  const mintStart = lib.indexOf('export async function mintConnectorToken')
  const mint = lib.slice(mintStart, lib.indexOf('\n}', mintStart))

  // "I could not check" must not read as "there is none": that is what let a transient database
  // error produce a duplicate live credential while the first was merely unread.
  assert.match(status, /state: 'unreadable'/, 'a failed status read no longer reports unreadable')
  // Scoped to the ERROR BLOCK only. The first version sliced from `if (error)` to the end of the
  // function and matched the legitimate `absent` return for a genuinely empty project — a guard that
  // fired on correct code. The block is `if (error) { … }`, and what it returns is the whole claim.
  const errorBlock = status.slice(status.indexOf('if (error)'), status.indexOf('if (!data'))
  assert.match(errorBlock, /state: 'unreadable'/, 'the error path does not report unreadable')
  assert.doesNotMatch(
    errorBlock,
    /state: 'absent'/,
    'a failed read reports absent again — mint would then create a second token'
  )
  assert.match(mint, /state === 'unreadable'/, 'mint no longer refuses on an unreadable state')
})

test('revoke is scoped to the project, not just the row id', () => {
  // pod-report S3's lesson: a mutation that is not discriminator-scoped lets a caller revoke a row
  // they can name while the audit trail records the wrong thing. A token id from another project
  // must match nothing here rather than being revoked under this project's label.
  const lib = stripComments(
    readFileSync(fileURLToPath(new URL('./connector-tokens.ts', import.meta.url)), 'utf8')
  )
  const start = lib.indexOf('export async function revokeConnectorToken')
  const body = lib.slice(start, lib.indexOf('\n}', start))
  assert.match(body, /\.eq\('project_id', projectId\)/, 'revoke is not scoped to the project')
  assert.match(body, /\.eq\('id', tokenId\)/, 'revoke does not scope to the row id')
  // ...and it must not resurrect an already-revoked row's timestamp.
  assert.match(body, /\.is\('revoked_at', null\)/, 'revoke can rewrite an already-revoked row')
})

test('the mint path translates the unique-index violation instead of surfacing a raw error', () => {
  // The partial unique index (20260827120000) is what actually prevents two active tokens. When it
  // fires, the loser of the race must get "this project already has an active connector URL" — a
  // sentence naming a state that is now TRUE — rather than a Postgres constraint name.
  //
  // Asserted at the source because reproducing a lost race in a test is not practical: it needs two
  // inserts interleaved inside the window between the pre-check and the write.
  const lib = stripComments(
    readFileSync(fileURLToPath(new URL('./connector-tokens.ts', import.meta.url)), 'utf8')
  )
  const start = lib.indexOf('export async function mintConnectorToken')
  const body = lib.slice(start, lib.indexOf('\n}', start))
  assert.match(body, /'23505'/, 'the mint path does not recognise the unique-violation code')
  assert.match(
    body.slice(body.indexOf("'23505'")),
    /reason: 'already-active'/,
    'a lost race reports a raw write failure instead of the state that is now true'
  )
})

test('the migration adds a PARTIAL index, so rotation still works', () => {
  // A plain `UNIQUE (project_id)` would forbid ever minting a second token and break rotation
  // entirely — revocation here is soft, so a rotating project accumulates revoked rows by design.
  // The predicate is the whole correctness argument, and it is worth pinning against a future
  // "simplification" that drops it.
  const migration = readFileSync(
    fileURLToPath(
      new URL('../supabase/migrations/20260827120000_connector_token_uniqueness.sql', import.meta.url)
    ),
    'utf8'
  )
  assert.match(migration, /CREATE UNIQUE INDEX/i)
  assert.match(
    migration,
    /WHERE\s+revoked_at\s+IS\s+NULL/i,
    'the index is not partial — this would forbid rotation, not just duplicates'
  )
  assert.match(migration, /connector_tokens \(project_id\)/i)
})

// ── S4: what `closedGate` CHECKS, not just that it is called ──────────────────────────────────

test('closedConnectorGate refuses when the CONNECTOR gate is off — AGENTS rule #3, asserted', () => {
  // The rule that says minting the second kill switch must never route around the first. It rested
  // on one unasserted line: deleting `if (!connectorEnabled)` left every other guard in this file
  // green while minting became reachable with the connector switched off.
  //
  // Behavioural — all four combinations, run — not a source scan.
  assert.equal(closedConnectorGate({ connectorEnabled: true, consoleEnabled: true }), null)
  assert.equal(
    closedConnectorGate({ connectorEnabled: false, consoleEnabled: true }),
    'connector',
    'minting is permitted with the connector switched off'
  )
  assert.equal(
    closedConnectorGate({ connectorEnabled: true, consoleEnabled: false }),
    'console',
    'minting is permitted while the console is dark'
  )
  // Both closed names the CONNECTOR first, deliberately: it is the one rule #3 is about, and an
  // operator told "the console is off" while the connector was also off would fix the wrong thing.
  assert.equal(closedConnectorGate({ connectorEnabled: false, consoleEnabled: false }), 'connector')
})

test('the mint action feeds BOTH env gates into the predicate', () => {
  // The half a source scan is actually good for: the decision is unit-tested above, but nothing
  // there can see whether this action still passes it the real values.
  const actions = stripComments(
    readFileSync(
      fileURLToPath(new URL('../app/app/setup/connect/[projectSlug]/actions.ts', import.meta.url)),
      'utf8'
    )
  )
  const start = actions.indexOf('function closedGate()')
  const body = actions.slice(start, actions.indexOf('\n}', start))
  assert.match(body, /connectorEnabled: isConnectorEnabled\(\)/, 'the connector gate is not read')
  assert.match(body, /consoleEnabled: isConsoleShellEnabled\(\)/, 'the console gate is not read')
})

// ── B1: the legacy Connect link must never point at a gated route ─────────────────────────────

test('the legacy header links Connect to /install, never to a console-gated route', () => {
  // ⚠️ This SHIPPED for several commits and would have 404'd every signed-in operator on merge.
  //
  // The legacy branch renders whenever `header === null`, which INCLUDES the console gate being off
  // — its production value. Pointing Connect at `/app/setup/connect/<slug>` there sent every member
  // to a route whose first statement is `if (!isConsoleShellEnabled()) notFound()`.
  //
  // The existing browser specs could not see it: the authed one asserts the link is VISIBLE, not
  // where it goes, and the one that does assert the href runs anonymously, where the slug is null
  // and the href was still `/install`. Assert-presence is what let this through.
  const shell = readFileSync(
    fileURLToPath(new URL('../components/product/ProductShell.tsx', import.meta.url)),
    'utf8'
  )
  const legacyStart = shell.indexOf('header === null ? (')
  // ⚠️ **The end of the branch is found by BALANCING PARENTHESES, not by matching indentation.**
  //
  // Two versions of this line have now been wrong, in opposite directions. The first used
  // `indexOf('      ) : (')` — a substring match that the nested project-signal ternary's own
  // sixteen-space `) : (` satisfied, so the slice stopped ten lines early and silently covered
  // two-thirds of the branch while both assertions still passed. The fix anchored on a newline plus
  // exactly eight spaces, which made the guard depend on how deeply this JSX happens to be
  // indented — and design-system-rails Story 6.4 added one wrapper element to the shell, moved
  // every line two columns right, and turned a correct guard red for a reason that has nothing to
  // do with what it guards.
  //
  // Depth counting cannot be fooled by either: it finds the `)` that actually closes the `(` this
  // branch opened, wherever it sits and whatever surrounds it.
  const legacyEnd = (() => {
    let depth = 0
    for (let i = shell.indexOf('(', legacyStart); i < shell.length; i += 1) {
      if (shell[i] === '(') depth += 1
      else if (shell[i] === ')') {
        depth -= 1
        if (depth === 0) return i
      }
    }
    return -1
  })()
  assert.ok(legacyStart >= 0 && legacyEnd > legacyStart, 'the legacy branch is not where this expects')
  // The slice must reach the END of the branch, not stop at a nested ternary. `Agent notes` is the
  // last link in it, so its presence proves coverage rather than assuming it — a coverage guard
  // that cannot report its own truncation is how the first version passed while seeing two-thirds.
  assert.match(
    shell.slice(legacyStart, legacyEnd),
    /Agent notes/,
    'the legacy-branch slice is truncated — it no longer covers the whole branch'
  )
  const legacy = shell.slice(legacyStart, legacyEnd)

  // ⚠️ Keyed on the CODE, not on the prose. The first version scanned the whole branch for
  // `/app/setup/` and matched the COMMENT above the link explaining this very defect — the third
  // time this session that a guard fired on an honest description of the thing it forbids. A guard
  // has to distinguish code from writing about code.
  const codeLines = stripComments(legacy)

  assert.match(codeLines, /href="\/install"/, 'the legacy Connect link no longer points at /install')
  // Any `/app/setup/` in the branch's CODE, whatever syntax carries it. The first version banned
  // only `href={…/app/setup/…}`, so a plain string literal `href="/app/setup/connect/demo"` walked
  // straight past it (fresh reviewer, PR #123). Keyed on the PATH, which every form must contain.
  assert.doesNotMatch(
    codeLines,
    /\/app\/setup\//,
    'the legacy branch references a console-gated route — it 404s whenever this branch renders'
  )
  // ⚠️ NOT "every href must be a literal" — that was my own over-reach and it failed on correct
  // code: the Sections disclosure legitimately renders `href={link.href}` from the inventory, which
  // is the whole point of generating the nav from one list. The property that actually matters is
  // the one above: no console-gated PATH anywhere in this branch, in any syntax.
})
