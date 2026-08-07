// The vibe reviewer's INVOCATION contract.
//
// Two properties matter and they pull against each other: the reviewer must be able to READ the repo
// it is reviewing, and it must never be able to WRITE to it. Before 2026-08-07 the code had the
// second and silently lost the first — `--trust` skips the trust-the-folder prompt but approves no
// tool calls, so every read was auto-denied, each denial burned a turn against `--max-turns 4`, and
// the reviewer was left judging a diff it could not open a single file of.
//
// These tests pin both halves at the argv level, because that is where the guarantee lives. The
// runtime half — that a write is genuinely impossible under this flag set — was verified by
// attempting it (see VIBE_READ_ONLY_TOOLS' comment); this file makes sure the flags that made it
// impossible cannot quietly disappear.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runVibe, VIBE_READ_ONLY_TOOLS, VIBE_MAX_TURNS } from './cross-agent-cli.mjs';

/** Capture the argv runVibe would spawn, without running anything. */
function argvFor(prompt = 'review this') {
  let captured = null;
  const spawn = (_bin, args) => {
    captured = args;
    return { status: 0, stdout: 'findings', stderr: '' };
  };
  runVibe(prompt, {}, { spawn });
  return captured;
}

test('the reviewer can read: auto-approve is passed, and scoped by an allow-list', () => {
  const args = argvFor();
  assert.ok(args.includes('--auto-approve'), 'without this every tool call is denied and turns are burned');

  // `--enabled-tools` in programmatic mode disables every tool NOT listed. That is the only reason
  // --auto-approve is safe here, so the two must always travel together.
  for (const tool of VIBE_READ_ONLY_TOOLS) {
    const at = args.indexOf(tool);
    assert.notEqual(at, -1, `${tool} must be enabled`);
    assert.equal(args[at - 1], '--enabled-tools', `${tool} must be granted via --enabled-tools`);
  }
});

test('the reviewer cannot write: no write-capable tool is ever enabled', () => {
  const args = argvFor();
  // vibe's full toolset: skill, task, web_fetch, bash, edit, grep, read_file, web_search, todo,
  // write_file. `bash` counts as a write path — a shell can create a file as easily as `write_file`.
  for (const forbidden of ['bash', 'edit', 'write_file', 'task', 'skill', 'web_fetch', 'web_search']) {
    assert.ok(!args.includes(forbidden), `${forbidden} must never be enabled for an advisory reviewer`);
  }
  assert.deepEqual(
    args.filter((a, i) => args[i - 1] === '--enabled-tools').sort(),
    [...VIBE_READ_ONLY_TOOLS].sort(),
    'the enabled set must be exactly the read-only allow-list — no additions by accident'
  );
});

test('--agent plan stays, as a second layer rather than the only one', () => {
  const args = argvFor();
  assert.equal(args[args.indexOf('--agent') + 1], 'plan');
});

test('the turn budget is high enough that a real review is not truncated', () => {
  // 4 was the value that produced "<vibe_stop_event>Turn limit of 4 reached</vibe_stop_event>" on
  // large diffs — intermittently, depending on how many denied calls a run happened to attempt.
  // With reads granted a turn is productive, and the agent stops on its own when it is done.
  assert.ok(Number(VIBE_MAX_TURNS) >= 8, `expected a workable budget, got ${VIBE_MAX_TURNS}`);
  assert.equal(argvFor()[argvFor().indexOf('--max-turns') + 1], String(VIBE_MAX_TURNS));
});

test('a turn-limit stop is reported as OUR budget, not as a quota cap', () => {
  // The distinction is the whole point of the message: quota means "wait or top up", a turn limit
  // means "raise the number". Reporting the first when it is the second sends someone to the wrong fix.
  const spawn = () => ({
    status: 1,
    stdout: '',
    stderr: '<vibe_stop_event>Turn limit of 4 reached</vibe_stop_event>',
  });
  // `fail(soft)` warns on stderr and returns null, so the message is captured there.
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
