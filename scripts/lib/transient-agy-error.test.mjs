// isTransientAgyError — the classifier that decides whether an agy failure earns the fallback model.
//
// Why this needs its own test file rather than a line in an existing one: the two directions of this
// function fail in opposite, equally bad ways, and the balance between them is the whole design.
//
//   Too NARROW → a passing provider blip aborts the run. That is what happened on 2026-07-25:
//     `gpt-oss-120b-medium` returned "Our servers are experiencing high traffic right now" with a
//     non-zero exit, and because the fallback was wired only to the empty-output signal, the second
//     model — a separate capacity pool, sitting right there — was never tried.
//
//   Too BROAD → genuine breakage gets silently retried on another model and looks like success.
//     That is the 1.0.10 incident this repo already paid for once: agy changed its print contract,
//     the failure was absorbed, and empty reviews shipped for weeks. A classifier that matches
//     "error" or "failed" would recreate it.
//
// So the negative cases below matter at least as much as the positive ones.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTransientAgyError } from './cross-agent-cli.mjs';

test('transient: the exact live message that motivated this classifier', () => {
  assert.equal(
    isTransientAgyError(
      'Error: Our servers are experiencing high traffic right now, please try again in a minute.'
    ),
    true
  );
});

test('transient: capacity, rate-limit and upstream-status signals', () => {
  for (const msg of [
    'RESOURCE_EXHAUSTED 429: Individual quota reached',
    'Error: rate limit exceeded',
    'HTTP 429 Too Many Requests',
    'upstream returned 503',
    'model is overloaded, retry',
    'service temporarily unavailable',
    'please try again later',
    'request timed out',
    'read ECONNRESET',
    'connect ETIMEDOUT 10.0.0.1:443',
    'getaddrinfo EAI_AGAIN api.example.com',
  ]) {
    assert.equal(isTransientAgyError(msg), true, `expected transient: ${msg}`);
  }
});

test('NOT transient: a real interface break must fail loud, never fall back', () => {
  // Each of these means "the tool or our invocation is wrong". Retrying on a second model would
  // hide the defect and produce a confident, empty or wrong result — the 1.0.10 failure mode.
  for (const msg of [
    'unexpected arguments: [list]',
    'unknown flag: --modle',
    'Error: unknown subcommand "modles"',
    'panic: runtime error: invalid memory address',
    'agy: command not found',
    'permission denied',
    'invalid model name',
    'authentication required — please run agy login',
    'unauthorized',
  ]) {
    assert.equal(isTransientAgyError(msg), false, `expected NON-transient: ${msg}`);
  }
});

test('NOT transient: generic error words alone are not enough', () => {
  // The guard against a lazy future widening of the pattern.
  for (const msg of ['error', 'failed', 'Error: something went wrong', '']) {
    assert.equal(isTransientAgyError(msg), false, `expected NON-transient: ${JSON.stringify(msg)}`);
  }
});

test('null and undefined are handled as non-transient, not thrown', () => {
  assert.equal(isTransientAgyError(null), false);
  assert.equal(isTransientAgyError(undefined), false);
});
