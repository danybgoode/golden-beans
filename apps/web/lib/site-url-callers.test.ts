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
const SEARCH_DIRS = ['app', 'lib', 'components']

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

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Files that actually IMPORT `getSiteUrl`, static or dynamic.
 *
 * Deliberately not a search for the string `getSiteUrl()`: this repo's comments discuss that
 * function constantly, and a comment-stripping pass is its own bug surface — `check-design-drift.mjs`
 * shipped one that reported the wrong line for every violation of its entire existence. An import
 * cannot appear in prose, so this needs no stripping to be exact.
 */
function callersOfGetSiteUrl(): string[] {
  const found: string[] = []
  for (const dir of SEARCH_DIRS) {
    for (const file of walk(join(WEB_ROOT, dir))) {
      if (/\.test\.tsx?$/.test(file)) continue
      const source = readFileSync(file, 'utf8')
      const importsIt =
        /import\s*\{[^}]*\bgetSiteUrl\b[^}]*\}\s*from\s*['"][^'"]*site-url['"]/.test(source) ||
        /\bgetSiteUrl\b[^\n]*=\s*await\s+import\(['"][^'"]*site-url['"]\)/.test(source) ||
        /await\s+import\(['"][^'"]*site-url['"]\)[\s\S]{0,80}?\bgetSiteUrl\b/.test(source)
      if (importsIt) found.push(file.slice(WEB_ROOT.length + 1))
    }
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
    const body = source.replace(/^\s*import\s[\s\S]*?from\s*['"][^'"]+['"];?\s*$/gm, '')

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
  assert.deepEqual(stale, [], `CALLERS lists file(s) that no longer import getSiteUrl:\n  ${stale.join('\n  ')}`)
})
