// site-url-preview-aware · Sprint 1, Story 1.3 — the durable-URL call sites, guarded.
//
// ── What this exists to prevent ───────────────────────────────────────────────────────────────
// `getSiteUrl()` now returns a PREVIEW deployment's own hostname when `SITE_URL` is absent (epic
// D2). Most of its ~20 call sites are informational — a prompt, a manifest, a sitemap, a
// `metadataBase` — and a preview hostname is exactly what they should show.
//
// A handful are not. They mint a URL that someone KEEPS: the MCP connector URL, a report share
// link, the signup email's `emailRedirectTo`, the auth-callback redirect base. A preview-derived
// URL persisted into one of those dies when the preview is deleted, and the person holding it has
// no way to know why.
//
// Today that cannot happen, and epic D4 records why: every one of those paths is unreachable on a
// preview because its gate — or the database it needs — is scoped to Production only
// (`vercel env ls`, 2026-08-20). `CONNECTOR_ENABLED`, `REPORT_SHARES_ENABLED`, `SIGNUP_ENABLED`,
// `SELF_PROJECT_API_KEY` and `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are all Production-only,
// so a preview has no connector, no shares, no signup, and in fact no database at all.
//
// ── Be precise about what this guard can and cannot see ──────────────────────────────────────
// That safety property has two halves and this test can only hold one of them:
//
//   IN REPO, and asserted below — every file that imports `getSiteUrl` is classified, and every
//   file classified `durable` still USES its declared gate in code. This catches the likely
//   regressions: a NEW durable-URL surface added without anyone thinking about previews, and an
//   existing one losing its gate or reducing it to a dead import. It does NOT prove the gate
//   dominates every path to the URL construction — see the note above that test for why a string
//   check must not pretend to answer a control-flow question.
//
//   OUT OF REPO, and NOT assertable here — the Vercel environment scoping itself. If someone adds
//   `SUPABASE_URL` to Preview scope, every durable path becomes reachable on previews and this test
//   stays green. **That is the change to be careful about**, and it is named here because a guard
//   that pretends to cover it would be worse than one that says plainly that it does not.
//
// The registry is the point as much as the assertion: adding a caller forces a line here, and that
// line forces the question "does this hand someone a URL they keep?".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
// Everything under apps/web is scanned, minus build output, dependencies, and test/config trees.
// A hardcoded ['app', 'lib', 'components'] would silently exempt a caller added under a NEW
// top-level directory — `services/`, `hooks/`, `config/` — which is the same allow-list mistake as
// matching import shapes, one level up. Deny-list the things that cannot contain shipped callers
// instead. (agy, PR #116 round 2.)
const SKIP_DIRS = new Set(['node_modules', '.next', 'e2e', 'supabase', 'public', 'scripts'])

/**
 * `informational` — renders a URL for someone to read now. A preview hostname is correct here, and
 * is the entire point of the epic.
 *
 * `durable` — mints a URL that outlives the request: persisted, emailed, or handed over as a
 * credential. Must be unreachable on a preview. `gatedBy` names the Production-scoped thing that
 * makes it so, and the test asserts the file still references it.
 */
const CALLERS: Record<string, { kind: 'informational' } | { kind: 'durable'; gatedBy: string }> = {
  // ── Informational ───────────────────────────────────────────────────────────────────────────
  'app/layout.tsx': { kind: 'informational' },
  'app/sitemap.ts': { kind: 'informational' },
  'app/robots.ts': { kind: 'informational' },
  'app/llms.txt/route.ts': { kind: 'informational' },
  'app/northstar-self-serve.md/route.ts': { kind: 'informational' },
  'app/methodology/page.tsx': { kind: 'informational' },
  'app/methodology/[chapter]/page.tsx': { kind: 'informational' },
  'app/methodology/edition.md/route.ts': { kind: 'informational' },
  'components/landing/MakerHero.tsx': { kind: 'informational' },
  'components/landing/MakerClosingCta.tsx': { kind: 'informational' },
  // The install page RENDERS a connector URL, and it is the surface that already refuses to show a
  // misconfigured one — `isSiteUrlMisconfiguredInProduction()` exists for it. The minting itself is
  // `lib/connector-tokens.ts`, below.
  'app/install/page.tsx': { kind: 'informational' },

  // ── Durable: someone keeps this URL ─────────────────────────────────────────────────────────
  'lib/connector-tokens.ts': { kind: 'durable', gatedBy: 'getSupabaseServiceClient' },
  'lib/provisioning.ts': { kind: 'durable', gatedBy: 'getSupabaseServiceClient' },
  'lib/self-track.ts': { kind: 'durable', gatedBy: 'SELF_PROJECT_API_KEY' },
  'app/app/shares/[projectSlug]/actions.ts': { kind: 'durable', gatedBy: 'isReportSharesEnabled' },
  'app/api/v1/public/signup/route.ts': { kind: 'durable', gatedBy: 'isSignupEnabled' },
  'app/auth/callback/route.ts': { kind: 'durable', gatedBy: 'isSignupEnabled' },
  'app/app/provision/route.ts': { kind: 'durable', gatedBy: 'isSignupEnabled' },
  'app/app/onboarding/[projectSlug]/page.tsx': { kind: 'durable', gatedBy: 'isConnectorEnabled' },
}

// SKIP_DIRS applies at the TOP LEVEL only. Matching bare directory names at any depth looked
// equivalent and was not: `public` is both `apps/web/public` (static assets) and
// `app/api/v1/public/` (the demo-only read routes), so a depth-blind skip silently dropped the
// signup route — a DURABLE caller — out of discovery. Caught by this file's own stale-registry
// test, which is the half of the guard that watches the other half.
function walk(dir: string, out: string[] = [], depth = 0): string[] {
  for (const entry of readdirSync(dir)) {
    if (depth === 0 && SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out, depth + 1)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** The two seam files themselves. `site-url.ts` imports `site-url-resolve.ts`; neither is a caller. */
const SEAM_FILES = ['lib/site-url.ts', 'lib/site-url-resolve.ts']

/**
 * Files that import a site-url module, in ANY form.
 *
 * ── Keyed on the module SPECIFIER, not on the import clause (Codex, PR #116 round 2) ──────────
 * The first version matched `import { getSiteUrl } from '…site-url'` and two dynamic shapes. That
 * is a narrow allow-list of syntaxes, and the reviewer was right that it is the wrong thing to key
 * on: a namespace import (`import * as siteUrl from '…'`), a renamed binding, or a dynamic import
 * written differently all add a caller while staying invisible to it. A discovery guard that misses
 * a caller reports success and understands nothing.
 *
 * The specifier is the one thing every import form must contain, so matching it cannot be dodged by
 * syntax. The trade is deliberate: a file that imports the module *only* for
 * `isSiteUrlMisconfiguredInProduction` is also swept in and must be classified. That is fine — it is
 * one line in the registry, and "you touched the URL seam, say which kind you are" is exactly the
 * question this test exists to force.
 *
 * Deliberately still not a search for the string `getSiteUrl()`: this repo's comments discuss that
 * function constantly, and a comment-stripping pass is its own bug surface — `check-design-drift.mjs`
 * shipped one that reported the wrong line for every violation of its entire existence. An import
 * specifier cannot appear in prose the way a function name does.
 */
function callersOfGetSiteUrl(): string[] {
  const found: string[] = []
  for (const file of walk(WEB_ROOT)) {
    if (/\.test\.tsx?$/.test(file)) continue
    const relative = file.slice(WEB_ROOT.length + 1)
    if (SEAM_FILES.includes(relative)) continue
    const source = readFileSync(file, 'utf8')
    // `from '…site-url'` covers static and re-export forms; `import('…site-url')` covers dynamic.
    // The optional extension matters and is not hypothetical: this repo's own unit tests import
    // with an explicit `.ts` (`./site-url-resolve.ts`), so a specifier pattern that demanded the
    // closing quote right after the module name would miss that shape. (agy, PR #116 round 2.)
    const importsModule =
      /from\s*['"][^'"]*\bsite-url(-resolve)?(\.[cm]?[jt]sx?)?['"]/.test(source) ||
      /import\(\s*['"][^'"]*\bsite-url(-resolve)?(\.[cm]?[jt]sx?)?['"]\s*\)/.test(source)
    if (importsModule) found.push(relative)
  }
  return found.sort()
}

test('the caller sweep actually finds callers', () => {
  // A discovery-based guard whose discovery silently returns nothing is the exact false green this
  // repo has shipped before. This is the tripwire on the tripwire (CODE-QUALITY #5b).
  const callers = callersOfGetSiteUrl()
  assert.ok(
    callers.length >= 15,
    `the sweep found only ${callers.length} getSiteUrl callers — the matcher is probably broken, not the codebase`
  )
})

test('every getSiteUrl caller is classified as informational or durable', () => {
  const unclassified = callersOfGetSiteUrl().filter((file) => !(file in CALLERS))

  assert.deepEqual(
    unclassified,
    [],
    `New getSiteUrl caller(s) with no entry in CALLERS:\n  ${unclassified.join('\n  ')}\n\n` +
      `getSiteUrl() returns a PREVIEW deployment's own hostname when SITE_URL is unset. Decide which\n` +
      `this is and add it to the registry in this file:\n` +
      `  - informational: renders a URL for someone to read now. A preview hostname is correct.\n` +
      `  - durable: mints a URL someone KEEPS (persisted, emailed, or handed over as a credential).\n` +
      `    A preview-derived URL there dies with the preview and the holder cannot tell why — so it\n` +
      `    must be unreachable on a preview, and you must name the Production-scoped gate that makes\n` +
      `    it so.`
  )
})

// ── Be exact about what the next check proves, because it is less than it sounds ─────────────
// It asserts each durable file still USES its declared gate, in code rather than only in an import.
// It does NOT prove the gate guards execution — no string check can. A file could call
// `isSignupEnabled()` and ignore the result, and this would stay green.
//
// That is a deliberate limit, not an oversight. Proving "this identifier dominates every path to
// the URL construction" is a control-flow question, and a regex pretending to answer it would be a
// guard that reports success while understanding nothing — the failure mode this repo has shipped
// three times. What this DOES catch is the realistic regression: a gate deleted, renamed, or
// reduced to a dead import while the durable URL path stays. Naming the limit is what keeps the
// next reader from treating the green as more than it is.
//
// Renamed from "still carries the gate that keeps it off a preview" after Codex pointed out that
// the old name claimed the strong property while the body checked the weak one. A test name is a
// comment: it claims something and owes the same proof.
test('every durable-URL caller still USES its declared gate, not just imports it', () => {
  for (const [file, entry] of Object.entries(CALLERS)) {
    if (entry.kind !== 'durable') continue
    const source = readFileSync(join(WEB_ROOT, file), 'utf8')

    // Strip import statements, so a gate reduced to an unused import fails rather than passes.
    //
    // Two patterns, and the lookahead in the first is load-bearing: `[\s\S]*?` alone will happily
    // span from a SIDE-EFFECT import (`import 'server-only'`, which has no `from`) all the way to
    // the `from` of a later import, swallowing every line between them — including a gate usage.
    // `(?!\bimport\b)` stops the span at the next import keyword. Reproduced before fixing: the
    // naive version ate a whole `const` declaration sitting between two imports.
    // (agy, PR #116 round 3 — a guard gets the same suspicion as the code it guards.)
    // A trailing-comment tolerance on both, covering `//` AND `/* … */`: an import with a trailing comment
    // (`import { isSignupEnabled } from '@/lib/flags' // auth gate`) does not match a bare `$`
    // anchor, so it would survive the strip and leave the gate identifier in `body` — a FALSE PASS
    // on the dangerous side. (agy, PR #116 round 4.)
    const body = source
      .replace(
        /^\s*import\s(?:(?!\bimport\b)[\s\S])*?from\s*['"][^'"]+['"];?(?:\s*(?:\/\/.*|\/\*[\s\S]*?\*\/))*\s*$/gm,
        ''
      )
      .replace(/^\s*import\s*['"][^'"]+['"];?(?:\s*(?:\/\/.*|\/\*[\s\S]*?\*\/))*\s*$/gm, '')

    assert.ok(
      body.includes(entry.gatedBy),
      `${file} mints a durable URL and no longer USES ${entry.gatedBy} outside its imports.\n\n` +
        `That reference is what keeps this path off preview deployments: ${entry.gatedBy} depends on\n` +
        `something scoped to Production only, so a preview cannot reach this code. Without it, a\n` +
        `preview could mint a URL pointing at a hostname that disappears when the preview does, and\n` +
        `the person holding that URL has no way to find out why it broke.\n\n` +
        `If the gate genuinely moved, update the registry entry above. If it was removed, this path\n` +
        `now needs a different answer to "why can a preview not run this?" — and that answer is a\n` +
        `conversation, not a test edit.`
    )
  }
})

test('the registry does not name a file that no longer imports getSiteUrl', () => {
  // The other direction: a stale registry entry is a guard asserting something about a file that
  // has moved on, and it makes the durable list read as bigger coverage than it has.
  const callers = new Set(callersOfGetSiteUrl())
  const stale = Object.keys(CALLERS).filter((file) => !callers.has(file))
  assert.deepEqual(
    stale,
    [],
    `CALLERS lists file(s) that no longer import getSiteUrl:\n  ${stale.join('\n  ')}`
  )
})

test('nothing re-exports getSiteUrl, which would route callers around this registry', () => {
  // The remaining hole in specifier-based discovery: a barrel that re-exported `getSiteUrl` would
  // let a file import it from somewhere this sweep never looks. Rather than chase every possible
  // barrel path, the barrel itself is forbidden — there is none today, and `getSiteUrl` having
  // exactly one import specifier is what makes the registry above complete.
  //
  // (Codex raised the barrel case in review of PR #116. It is closed by prohibition rather than by
  // detection, which is the cheaper and more durable half of "make the failure unrepresentable".)
  const offenders: string[] = []
  for (const file of walk(WEB_ROOT)) {
    const relative = file.slice(WEB_ROOT.length + 1)
    if (SEAM_FILES.includes(relative) || /\.test\.tsx?$/.test(file)) continue
    const source = readFileSync(file, 'utf8')
    if (
      /export\s*\{[^}]*\bgetSiteUrl\b[^}]*\}/.test(source) ||
      /export\s*\*\s*from\s*['"][^'"]*\bsite-url(-resolve)?(\.[cm]?[jt]sx?)?['"]/.test(source)
    ) {
      offenders.push(relative)
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `These file(s) re-export getSiteUrl:\n  ${offenders.join('\n  ')}\n\n` +
      `A re-export lets a caller import getSiteUrl from a path this registry does not sweep, so a\n` +
      `new durable-URL surface could appear unclassified. Import it from '@/lib/site-url' directly.`
  )
})
