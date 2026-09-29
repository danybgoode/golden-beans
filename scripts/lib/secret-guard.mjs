// secret-guard.mjs — never POST a reviewer's reply that carries one of this machine's secrets.
//
// ── Why this exists (distribute-what-we-use S1, the fresh pr-reviewer's round 2 on #188) ──────────────
// A reviewer CLI is fed an attacker-controllable diff. The rail removes every tool it can (Vibe runs with
// all tools disabled, Devin is refused, Claude runs `--tools ""`, codex runs `--sandbox read-only
// --ignore-user-config`), but codex's read-only sandbox still lets it READ host files, and there is no
// flag that stops that. An injected diff can therefore ask for `cat .env.local`, and cross-review would
// post the answer as a comment — on a public repo, to anyone.
//
// Refusing codex would leave no working reviewer, so the CHANNEL is closed instead: before anything is
// posted, the reply is checked for (1) any value from the project's own env files or from this process's
// secret-named env vars, and (2) the shapes of the credentials a developer machine commonly holds. A match
// fails the run and posts nothing; the reply is printed locally (it is the operator's own machine) with
// every match redacted, so a false positive costs a look, never a leak.
//
// Deliberately NOT a general secret scanner: GitHub push protection and CodeQL own that for commits. This
// guards one path — a model's text on its way to a PR comment. Zero npm deps.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Shorter values are too likely to occur in ordinary review prose ("development", a port, a flag). */
export const MIN_SECRET_LENGTH = 16;

/** Credential shapes with a distinctive prefix — low false-positive by construction. */
export const SECRET_SHAPES = Object.freeze([
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/ },
  { name: 'OpenAI/Anthropic-style key', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}\b/ },
  { name: 'Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Slack webhook', re: /hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/ },
  { name: 'Telegram bot token', re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Supabase access token', re: /\bsbp_[a-f0-9]{40}\b/ },
]);

const SECRET_KEY_RE = /(KEY|TOKEN|SECRET|PASSWORD|PASS|PRIVATE|CREDENTIAL|WEBHOOK|DSN)/i;

/** `KEY=value` pairs from a dotenv-shaped text; quotes stripped, comments and blanks ignored. */
export function parseEnvValues(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const v = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (v) out.push({ key: m[1], value: v });
  }
  return out;
}

/**
 * The secret VALUES this machine could leak for this project: every value in the root's `.env*` files (a
 * dotenv file is secrets by convention), plus this process's env vars whose NAME says secret. Values
 * shorter than MIN_SECRET_LENGTH are skipped. Unreadable files are skipped — could not look is not a leak.
 */
export function collectSecretValues({
  root = process.cwd(),
  env = process.env,
  read = readFileSync,
  list = readdirSync,
  exists = existsSync,
} = {}) {
  const values = new Set();
  let names = [];
  try {
    names = exists(root) ? list(root).filter((n) => /^\.env(\..+)?$/.test(n) && !/\.example$/.test(n)) : [];
  } catch {
    names = [];
  }
  for (const name of names) {
    try {
      for (const { value } of parseEnvValues(read(join(root, name), 'utf8')))
        if (value.length >= MIN_SECRET_LENGTH) values.add(value);
    } catch {
      /* unreadable: skip */
    }
  }
  for (const [k, v] of Object.entries(env || {}))
    if (SECRET_KEY_RE.test(k) && typeof v === 'string' && v.length >= MIN_SECRET_LENGTH) values.add(v);
  return [...values];
}

/**
 * Pure: which secrets does `text` carry? Returns `{ leaks: [{kind, name}], redacted }`, where `redacted`
 * is `text` with every match replaced by `[REDACTED <name>]`. Names only — never the value itself.
 */
export function findSecretLeaks(text, { values = [] } = {}) {
  let redacted = String(text || '');
  const leaks = [];
  for (const v of values) {
    if (v && redacted.includes(v)) {
      leaks.push({ kind: 'env-value', name: `an env value (${v.length} chars)` });
      redacted = redacted.split(v).join('[REDACTED env value]');
    }
  }
  for (const { name, re } of SECRET_SHAPES) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    if (g.test(redacted)) {
      leaks.push({ kind: 'shape', name });
      redacted = redacted.replace(new RegExp(re.source, g.flags), `[REDACTED ${name}]`);
    }
  }
  return { leaks, redacted };
}
