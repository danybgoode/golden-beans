// The codex→agy self-heal must never become a same-family review (distribute-what-we-use D1).
//
// runWithCodexFallback changes the REVIEWING family when codex cannot run. cross-review's pairing guard
// checks the family the operator asked for (`--agent codex`), so without a second check a diff agy built
// could be cleared by agy after a lapsed codex token — a same-family pass wearing a cross-family label.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runWithCodexFallback,
  decideCodexFallback,
  codexModelFrom,
  codexExecArgs,
} from './cross-agent-cli.mjs';

/** Deps where codex fails with `codex` and agy answers; `fail` throws so the test can see the message. */
function deps(codex) {
  const calls = [];
  return {
    calls,
    deps: {
      tryCodex: () => codex,
      runAntigravity: (argv) => {
        calls.push(argv);
        return 'agy findings';
      },
      hasCmd: () => true,
      fail: (msg) => {
        throw new Error(msg);
      },
      warn: () => {},
    },
  };
}
const LAPSED = {
  ok: false,
  text: '',
  authFailed: true,
  cliOutdated: false,
  contextOverflow: false,
  stderr: '401',
};
const STALE = {
  ok: false,
  text: '',
  authFailed: false,
  cliOutdated: true,
  contextOverflow: false,
  stderr: '',
};

test('an agy-built diff is never healed onto agy: the fallback fails loud instead', () => {
  const { calls, deps: d } = deps(LAPSED);
  assert.throws(
    () => runWithCodexFallback({ prompt: 'p', stdin: 's', antigravityArgv: 'a', builder: 'agy' }, d),
    /SAME-FAMILY/
  );
  assert.equal(calls.length, 0, 'agy must not even be invoked');
});

test('a claude-built diff still heals onto agy (a different family)', () => {
  const { calls, deps: d } = deps(LAPSED);
  const out = runWithCodexFallback({ prompt: 'p', stdin: 's', antigravityArgv: 'a', builder: 'claude' }, d);
  assert.deepEqual(out, { findings: 'agy findings', fellBack: true, from: 'codex', to: 'antigravity' });
  assert.equal(calls.length, 1);
});

test('an unstated builder keeps the old behaviour (heals)', () => {
  const { deps: d } = deps(LAPSED);
  assert.equal(runWithCodexFallback({ prompt: 'p', stdin: 's', antigravityArgv: 'a' }, d).fellBack, true);
});

test('a stale codex CLI heals like a lapsed token, and the message names the doctor', () => {
  let warned = '';
  const { deps: d } = deps(STALE);
  d.warn = (m) => (warned += m);
  assert.equal(runWithCodexFallback({ prompt: 'p', stdin: 's', antigravityArgv: 'a' }, d).fellBack, true);
  assert.match(warned, /cross-agent-doctor\.mjs codex/);
});

test('decideCodexFallback: the pairing refusal outranks the heal, never the overflow', () => {
  const base = { codexOk: false, authFailed: true, contextOverflow: false, agyAvailable: true };
  assert.equal(decideCodexFallback({ ...base, fallbackPairingError: 'x' }), 'fail-fallback-same-family');
  assert.equal(
    decideCodexFallback({ ...base, contextOverflow: true, fallbackPairingError: 'x' }),
    'fail-context-overflow'
  );
  assert.equal(
    decideCodexFallback({ ...base, agyAvailable: false, fallbackPairingError: 'x' }),
    'fail-both-dead'
  );
  assert.equal(decideCodexFallback(base), 'fallback');
});

test('CODEX_MODEL: unset is the pin, `default` is codex’s own default, anything else is used verbatim', () => {
  assert.equal(codexModelFrom(undefined), 'gpt-5.6-terra');
  assert.equal(codexModelFrom('  '), 'gpt-5.6-terra');
  assert.equal(codexModelFrom('default'), null);
  assert.equal(codexModelFrom('DEFAULT'), null);
  assert.equal(codexModelFrom('gpt-5.6-sol'), 'gpt-5.6-sol');
});

test('codex exec argv: a pinned model carries its effort; `default` passes neither', () => {
  assert.deepEqual(codexExecArgs('P', { model: 'm', effort: 'high' }), [
    'exec',
    '--model',
    'm',
    '-c',
    'model_reasoning_effort=high',
    'P',
  ]);
  assert.deepEqual(codexExecArgs('P', { model: null, effort: 'high' }), ['exec', 'P']);
});
