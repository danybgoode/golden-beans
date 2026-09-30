#!/usr/bin/env node
// check-script-parity.mjs — keep `scripts/` and `skills/template/scripts/` from forking (distribute-what-we-use D6).
//
//   node scripts/check-script-parity.mjs        # exit 0 ok, 1 drift, 2 could not look
//
// ── Why parity and not deletion ─────────────────────────────────────────────────────────────────
// This repo runs its own copy of the shared scripts, and the kit ships the template's copy to strangers.
// Two copies of one file is a fork waiting to happen; a fork nobody notices is how the last three-way
// split happened. So every path present in BOTH trees must be byte-identical, or be listed in
// `scripts/script-parity.allowlist.json` with a one-line reason (a project-owned file, for example).
//
// The allowlist is checked in BOTH directions. A STALE entry — listed but now identical, or listed but no
// longer present in both trees — fails too, because a stale entry silently excuses the next real drift.
//
// Exit codes: 0 = parity holds, 1 = drift or a bad allowlist, 2 = could not look (a tree or the allowlist is
// missing or unreadable). "Could not look" is its own code (LEARNINGS): it must never read as a verdict.
//
// Zero deps — Node 18+.

import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECT_DIR = join(repoRoot, 'scripts');
export const TEMPLATE_DIR = join(repoRoot, 'skills', 'template', 'scripts');
export const ALLOWLIST_PATH = join(PROJECT_DIR, 'script-parity.allowlist.json');

/** Every file under `dir`, as `/`-separated relative paths, skipping node_modules. */
export function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(relative(base, full).split(sep).join('/'));
  }
  return out;
}

/**
 * Compare the two trees against the allowlist (`{ path: reason }`).
 * Returns `{ state: 'ok' | 'drift' | 'could-not-look', identical, allowed, problems }`.
 */
export function checkParity({ projectDir, templateDir, allowed = {} }) {
  const missing = [projectDir, templateDir].filter((d) => !existsSync(d) || !statSync(d).isDirectory());
  if (missing.length) {
    return {
      state: 'could-not-look',
      identical: 0,
      allowed: 0,
      problems: missing.map((d) => `tree not found: ${d}`),
    };
  }
  const inTemplate = new Set(listFiles(templateDir));
  const shared = listFiles(projectDir).filter((f) => inTemplate.has(f));
  const sharedSet = new Set(shared);
  const problems = [];
  let identical = 0;
  let allowedCount = 0;

  for (const rel of shared) {
    let same;
    try {
      same = readFileSync(join(projectDir, rel)).equals(readFileSync(join(templateDir, rel)));
    } catch (e) {
      // Unreadable is could-not-look (exit 2), never drift (exit 1) and never a stack trace.
      return {
        state: 'could-not-look',
        identical,
        allowed: allowedCount,
        problems: [`${rel}: unreadable (${e.code || e.message})`],
      };
    }
    const listed = Object.hasOwn(allowed, rel);
    if (listed && (typeof allowed[rel] !== 'string' || !allowed[rel].trim())) {
      problems.push(
        `${rel}: allowlisted without a reason. Fix: give it a non-empty one-line reason in script-parity.allowlist.json.`
      );
    } else if (same && listed) {
      problems.push(
        `${rel}: STALE allowlist entry, the two copies are now identical. Fix: remove it from script-parity.allowlist.json.`
      );
    } else if (same) {
      identical++;
    } else if (listed) {
      allowedCount++;
    } else {
      problems.push(
        `${rel}: differs between scripts/ and skills/template/scripts/. Fix: make them byte-identical, or list it in script-parity.allowlist.json with a one-line reason.`
      );
    }
  }
  for (const rel of Object.keys(allowed)) {
    if (!sharedSet.has(rel)) {
      problems.push(
        `${rel}: STALE allowlist entry, no longer present in both trees. Fix: remove it from script-parity.allowlist.json.`
      );
    }
  }
  return { state: problems.length ? 'drift' : 'ok', identical, allowed: allowedCount, problems };
}

/** Read the allowlist's `allowed` map. Throws when the file is missing or is not JSON. */
export function readAllowlist(path = ALLOWLIST_PATH) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return parsed && typeof parsed.allowed === 'object' && parsed.allowed !== null ? parsed.allowed : {};
}

// realpath on both sides: invoked through a symlinked path (macOS /tmp → /private/tmp) a plain compare is
// false, and the script would exit 0 having checked nothing (#189 review).
const isMain = (() => {
  try {
    return (
      !!process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
})();
if (isMain) {
  let allowed;
  try {
    allowed = readAllowlist();
  } catch (err) {
    process.stderr.write(`check-script-parity: could not read ${ALLOWLIST_PATH}: ${err.message}\n`);
    process.exit(2);
  }
  const r = checkParity({ projectDir: PROJECT_DIR, templateDir: TEMPLATE_DIR, allowed });
  if (r.state === 'could-not-look') {
    process.stderr.write(`check-script-parity: could not look.\n  ${r.problems.join('\n  ')}\n`);
    process.exit(2);
  }
  if (r.state === 'drift') {
    process.stderr.write(`check-script-parity: FAIL\n  ${r.problems.join('\n  ')}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `check-script-parity: ok, ${r.identical} identical, ${r.allowed} allowed with reasons.\n`
  );
}
