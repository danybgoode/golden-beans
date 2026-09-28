// Vibe must be able to inspect surrounding code without gaining any write-capable tool.
// These tests pin that guarantee at the argv boundary where it is enforced.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runVibe, VIBE_MAX_TURNS } from './cross-agent-cli.mjs';

function argvFor(prompt = 'review this') {
  let captured = null;
  const spawn = (_bin, args) => {
    captured = args;
    return { status: 0, stdout: 'findings', stderr: '' };
  };
  runVibe(prompt, {}, { spawn });
  return captured;
}

test('Vibe receives the bounded diff with every model-driven host tool disabled', () => {
  const args = argvFor();
  assert.ok(!args.includes('--auto-approve'), 'auto-approval bypasses Vibe sensitivity/workdir checks');
  assert.ok(!args.includes('--enabled-tools'), 'no model-driven read or write tool is needed for an embedded diff');
  assert.equal(args[args.indexOf('--disabled-tools') + 1], '*');
});

test('plan mode and a workable turn budget remain mandatory', () => {
  const args = argvFor();
  assert.equal(args[args.indexOf('--agent') + 1], 'plan');
  assert.ok(Number(VIBE_MAX_TURNS) >= 24, `expected the live-probed budget, got ${VIBE_MAX_TURNS}`);
  assert.equal(args[args.indexOf('--max-turns') + 1], String(VIBE_MAX_TURNS));
});

test('turn-limit failure names our budget rather than misreporting quota', () => {
  const spawn = () => ({
    status: 1,
    stdout: '',
    stderr: '<vibe_stop_event>Turn limit of 4 reached</vibe_stop_event>',
  });
  const original = process.stderr.write.bind(process.stderr);
  let warned = '';
  process.stderr.write = (chunk) => {
    warned += chunk;
    return true;
  };
  try {
    assert.equal(runVibe('review this', { soft: true }, { spawn }), null);
  } finally {
    process.stderr.write = original;
  }
  assert.match(warned, /turns, not quota/i);
  assert.match(warned, /VIBE_MAX_TURNS/);
});

test('a disabled-tool request is not accepted as a completed review', () => {
  const spawn = () => ({
    status: 0,
    stdout: 'read_file{"path":"/tmp/private-file"}',
    stderr: '',
  });
  const original = process.stderr.write.bind(process.stderr);
  let warned = '';
  process.stderr.write = (chunk) => {
    warned += chunk;
    return true;
  };
  try {
    assert.equal(runVibe('review this', { soft: true }, { spawn }), null);
  } finally {
    process.stderr.write = original;
  }
  assert.match(warned, /requested a disabled tool/i);
  assert.match(warned, /no review was produced/i);
});
