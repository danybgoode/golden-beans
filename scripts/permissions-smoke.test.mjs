import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bashRuleMatches,
  checkContract,
  describeUserMode,
  looksLiteral,
  refusedCommands,
  scoreLive,
} from './permissions-smoke.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf8'));
const ledger = JSON.parse(readFileSync(join(root, '.claude', 'permissions-ledger.json'), 'utf8'));
const kinds = (f) => f.map((x) => x.kind).sort();

test('the committed settings + ledger satisfy the contract', () => {
  assert.deepEqual(checkContract({ settings, ledger }), []);
});

test('the deny list names the guardrails the process promises', () => {
  const deny = settings.permissions.deny;
  for (const probe of ['vercel deploy --prod', 'vercel --prod --yes', 'supabase db push', 'git push --force origin x', 'rm -rf build']) {
    assert.ok(deny.some((r) => bashRuleMatches(r.slice(5, -1), probe)), `no deny rule refuses: ${probe}`);
  }
});

test('ordinary builder commands are NOT caught by the deny list (a guard must allow the negation)', () => {
  const deny = settings.permissions.deny.filter((r) => r.startsWith('Bash('));
  for (const ok of ['git push origin feat/x', 'git push -u origin feat/x', 'git commit --amend --no-edit', 'git commit -m "fix: add -a flag docs"', 'git add scripts/a.mjs', 'rm -r build', 'vercel env ls', 'supabase migration list', 'git push --follow-tags origin feat/x']) {
    assert.ok(!deny.some((r) => bashRuleMatches(r.slice(5, -1), ok)), `deny list wrongly refuses: ${ok}`);
  }
});

test('matcher: trailing " *" matches the bare command; a mid wildcard does not', () => {
  assert.equal(bashRuleMatches('git add -A *', 'git add -A'), true);
  assert.equal(bashRuleMatches('ls *', 'lsof'), false);
  assert.equal(bashRuleMatches('vercel *--prod*', 'vercel deploy --prod'), true);
  assert.equal(bashRuleMatches('git push * -f', 'git push origin main'), false);
});

test('deleting the whole deny list and its ledger together still fails (consistency is not coverage)', () => {
  const s = structuredClone(settings);
  s.permissions.deny = [];
  s.permissions.ask = [];
  const f = checkContract({ settings: s, ledger: { entries: [] } });
  assert.ok(f.length >= 7 && f.every((x) => x.kind === 'missing-guardrail'), JSON.stringify(kinds(f)));
});

test('an uncited deny rule fails', () => {
  const s = structuredClone(settings);
  s.permissions.deny.push('Bash(terraform destroy *)');
  assert.deepEqual(kinds(checkContract({ settings: s, ledger })), ['uncited-rule']);
});

test('a ledger entry whose rule was deleted fails as stale', () => {
  const s = structuredClone(settings);
  s.permissions.deny = s.permissions.deny.filter((r) => r !== 'Bash(supabase db reset *)');
  assert.deepEqual(kinds(checkContract({ settings: s, ledger })), ['stale-ledger']);
});

test('a probe its own rule does not match fails (catches a typo in the rule)', () => {
  const l = structuredClone(ledger);
  l.entries.find((e) => e.rule === 'Bash(supabase db push *)').probe = 'supabase db pushh';
  assert.deepEqual(kinds(checkContract({ settings, ledger: l })), ['probe-mismatch']);
});

test('a file-tool deny rule protecting a path that does not exist fails', () => {
  const f = checkContract({ settings, ledger, exists: (rel) => rel !== 'Roadmap/00-ideas/BUILD-ORDER.md' });
  assert.deepEqual(kinds(f), ['probe-mismatch', 'probe-mismatch']);
});

test('staging or committing the whole tree by any common spelling is refused', () => {
  const deny = settings.permissions.deny.filter((r) => r.startsWith('Bash('));
  for (const probe of ['git add -A', 'git add .', 'git add -u', 'git add --update', 'git commit -a -m x', 'git commit -am x', 'git commit --all -m x', 'git commit -m x -a']) {
    assert.ok(deny.some((r) => bashRuleMatches(r.slice(5, -1), probe)), `not refused: ${probe}`);
  }
});

test('a literal past command in allow fails; verb classes pass', () => {
  assert.equal(looksLiteral(`Bash(sed -n '1,60p' app/page.tsx)`), true);
  assert.equal(looksLiteral('Bash(echo "tsc exit=$?")'), true);
  assert.equal(looksLiteral('Read(//Users/someone/**)'), true);
  assert.equal(looksLiteral('Bash(rm -rf .git)'), true, 'an exact command with no wildcard is a one-off');
  assert.equal(looksLiteral('Bash(npm ci)'), false);
  assert.equal(looksLiteral('Bash(codex --version)'), false);
  assert.equal(looksLiteral('Bash(npm run *)'), false);
  assert.equal(looksLiteral('Bash(node scripts/*)'), false);
  const s = structuredClone(settings);
  s.permissions.allow.push(`Bash(sed -n '1,60p' x.ts)`);
  assert.deepEqual(kinds(checkContract({ settings: s, ledger })), ['literal-allow']);
});

test('auto or bypass mode in a PROJECT settings file fails (it is ignored and masks the user default)', () => {
  for (const mode of ['auto', 'bypassPermissions']) {
    const f = checkContract({ settings, ledger, projectFiles: [{ path: '.claude/settings.json', json: { permissions: { defaultMode: mode } } }] });
    assert.deepEqual(kinds(f), ['project-mode']);
  }
  assert.deepEqual(checkContract({ settings, ledger, projectFiles: [{ path: '.claude/settings.json', json: { permissions: { defaultMode: 'plan' } } }] }), []);
});

test('user mode has three states — unreadable is unavailable, never "fine"', () => {
  assert.equal(describeUserMode(() => ({ permissions: { defaultMode: 'auto' } })).state, 'auto');
  assert.equal(describeUserMode(() => ({})).state, 'other');
  assert.equal(describeUserMode(() => { throw new Error('ENOENT'); }).state, 'unavailable');
});

test('live scoring: refused only when denied AND the shim never ran; control must run', () => {
  const probes = ['vercel deploy --prod', 'rm -rf smoke-victim', 'supabase db push'];
  const refused = refusedCommands({ permission_denials: [{ tool_input: { command: 'vercel deploy --prod' } }, { tool_input: { command: 'rm -rf smoke-victim' } }] });
  const s = scoreLive({ probes, refused, shimLog: ['probe-ok control', 'supabase db push'] });
  assert.equal(s.ok, false);
  assert.deepEqual(s.results.map((r) => r.verdict), ['refused', 'refused', 'RAN']);
  const silent = scoreLive({ probes: ['vercel deploy --prod'], refused: new Set(['vercel deploy --prod']), shimLog: [] });
  assert.equal(silent.ok, false, 'a session that ran nothing proves nothing');
  const good = scoreLive({ probes: ['vercel deploy --prod'], refused: new Set(['vercel deploy --prod']), shimLog: ['probe-ok control'] });
  assert.equal(good.ok, true);
});
