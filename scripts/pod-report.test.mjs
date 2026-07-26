// pod-report — the gatherer's adapter layer.
//
// The adapter is where a real dishonesty crept in and had to be fixed, so it is what is tested
// here. The lens reads `reviewComments[].isAgentReviewer` and `ciCheckNames`; `gh` returns
// `comments[]` and `statusCheckRollup[]`. Handing the lens gh's raw shape meant it saw 98 pull
// requests with no review data and reported the practice as ABSENT — `not_met`, which asserts
// something strictly stronger than "not measured". Understating the pod is still a false claim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalisePrForLens,
  parseRiskTier,
  checkSucceeded,
  checkName,
  readCommits,
  windowDays,
  BENCHMARKS,
  buildArtifact,
  gatherSourceRef,
  resolvePushConfig,
  buildPushEnvelope,
  POD_REPORT_SCHEMA_VERSION,
} from './pod-report.mjs';

test('an agent review comment is detected by BODY, never by author identity', () => {
  // Forced by the data, not a preference: these comments are posted under the human maintainer's
  // own account, so there is no bot login to filter on. Filtering by author would find zero
  // reviewed PRs across a repo that reviews most of them.
  const pr = normalisePrForLens({
    number: 1,
    comments: [
      { author: { login: 'danybgoode' }, body: '### 🔎 Cross-agent review (Antigravity)\n\nNo findings.' },
      { author: { login: 'danybgoode' }, body: 'looks good to me' },
    ],
  });
  assert.equal(pr.reviewComments[0].isAgentReviewer, true, 'a human-posted agent review still counts');
  assert.equal(pr.reviewComments[1].isAgentReviewer, false, 'ordinary chatter must not count');
});

test('every reviewer-comment shape this repo actually produces is recognised', () => {
  for (const body of [
    '### 🔎 Cross-agent review (Antigravity)',
    '## Fresh-reviewer findings — disposition',
    'This is the judgment-layer review, not a second CI',
  ]) {
    const pr = normalisePrForLens({ number: 1, comments: [{ body }] });
    assert.equal(pr.reviewComments[0].isAgentReviewer, true, `missed: ${body}`);
  }
});

test('gh check names are mapped to the field the lens actually reads', () => {
  const pr = normalisePrForLens({
    number: 2,
    statusCheckRollup: [{ name: 'guards' }, { name: 'inflight' }, { notAName: true }],
  });
  assert.deepEqual(
    pr.ciCheckNames,
    ['guards', 'inflight'],
    'nameless entries are dropped, not passed as undefined'
  );
});

test('a PR with no comments or checks yields empty arrays, never undefined fields', () => {
  // The lens distinguishes "absent" from "empty"; the adapter must not blur that by emitting
  // undefined where gh simply returned nothing for this PR.
  const pr = normalisePrForLens({ number: 3 });
  assert.deepEqual(pr.reviewComments, []);
  assert.deepEqual(pr.ciCheckNames, []);
});

test('windowDays measures the real span and never returns zero for a live repo', () => {
  assert.equal(windowDays([{ date: '2026-06-06' }, { date: '2026-07-25' }]), 49);
  // A single-day repo is one day, not zero — a zero window would make every per-week rate null.
  assert.equal(windowDays([{ date: '2026-07-25' }]), 1);
  assert.equal(windowDays([]), 0);
  assert.equal(windowDays([{ date: 'garbage' }]), 0);
});

test('benchmarks are CITED and linked, never republished', () => {
  assert.ok(BENCHMARKS.length >= 3);
  for (const b of BENCHMARKS) {
    assert.ok(b.id && b.label, 'every benchmark needs an identity');
    assert.match(b.url, /^https:\/\//, 'a citation without a link is not a citation');
    assert.ok(b.note.length > 20, 'state what the published level is, and that it is cited');
  }
});

test('the artifact always carries its caveats, whatever it is built from', () => {
  // The renderer cannot drop what it never had to opt into.
  const a = buildArtifact({ delivery: {}, source: {}, generatedAt: 'x' });
  assert.ok(a.caveats.length >= 3);
  assert.ok(a.caveats.some((c) => /not instrumented/i.test(c)));
  assert.ok(a.caveats.some((c) => /published benchmarks/i.test(c)));
  assert.equal(a.schemaVersion, 1);
});

test('the maturity section is included only when computed, never as an empty shell', () => {
  assert.equal(buildArtifact({ delivery: {}, source: {}, generatedAt: 'x' }).maturity, undefined);
  assert.ok(
    buildArtifact({ delivery: {}, source: {}, generatedAt: 'x', maturity: { verdict: {} } }).maturity
  );
});

// ── Regressions from cross-review round 2 (PR #32) ──────────────────────────────────────────
// The adapter dropped three fields the gatherer was already fetching, so the risk-tier and
// self-verification criteria read `not_instrumented` on every real repo and the ladder was capped
// at step 1. The same bug class as round 1 — fetch the data, forget to map it — in a second place.

test('the adapter maps riskTier, mergedByIsAgent and ciPassedBeforeMerge', () => {
  const pr = normalisePrForLens({
    number: 1,
    mergedAt: '2026-07-01T00:00:00Z',
    mergedBy: { login: 'danybgoode', is_bot: false },
    body: 'Risk tier: HIGH\n\nSome description.',
    statusCheckRollup: [{ name: 'ci', conclusion: 'SUCCESS' }],
  });
  assert.equal(pr.riskTier, 'HIGH');
  assert.equal(pr.mergedByIsAgent, false);
  assert.equal(pr.ciPassedBeforeMerge, true);
});

test('both risk-tier spellings in the dataset are parsed', () => {
  // This repo's template writes `Risk tier:`; the sibling roadmap docs write `**Risk:** LOW`.
  assert.equal(parseRiskTier('Risk tier: LOW'), 'LOW');
  assert.equal(parseRiskTier('- [x] **Risk tier:** HIGH'), 'HIGH');
  assert.equal(parseRiskTier('**Risk:** MED'), 'MED');
  assert.equal(parseRiskTier('**Risk:** MEDIUM'), 'MED', 'MEDIUM normalises to MED');
  assert.equal(parseRiskTier('risk TIER : high'), 'HIGH', 'case and spacing are tolerated');
});

test('an UNDECLARED risk tier is undefined — never guessed, never defaulted', () => {
  // Coverage is partial by nature: many PR bodies declare no tier. Undefined means "not measured"
  // to the lens; any default would be a claim the body does not support.
  assert.equal(parseRiskTier('no tier here'), undefined);
  assert.equal(parseRiskTier(''), undefined);
  assert.equal(parseRiskTier(null), undefined);
  assert.equal(parseRiskTier(undefined), undefined);
});

test('a PR with NO checks reports ciPassedBeforeMerge as undefined, not false', () => {
  // "This PR ran no checks" and "we don't know whether checks passed" are different facts, and
  // `false` would assert the first.
  assert.equal(normalisePrForLens({ number: 1, statusCheckRollup: [] }).ciPassedBeforeMerge, undefined);
  assert.equal(normalisePrForLens({ number: 1 }).ciPassedBeforeMerge, undefined);
  // A failing check is a real false.
  assert.equal(
    normalisePrForLens({ number: 1, statusCheckRollup: [{ name: 'ci', conclusion: 'FAILURE' }] })
      .ciPassedBeforeMerge,
    false
  );
});

test('an UNMERGED pr has no merged-by verdict', () => {
  assert.equal(normalisePrForLens({ number: 1, mergedBy: { is_bot: true } }).mergedByIsAgent, undefined);
});

// ── Regressions from cross-review round 3 ───────────────────────────────────────────────────

test('a classic commit STATUS counts as success, not just a check-run conclusion', () => {
  // GitHub check-RUNS carry `conclusion`; classic commit STATUSES carry `state`. medusa-bonsai uses
  // check-runs exclusively (94 of 94), so this dataset never exercises the second shape — but this
  // tool runs against CUSTOMER repos, and one posting statuses from an external CI would have had
  // every PR silently reported as failing its gate.
  assert.equal(checkSucceeded({ conclusion: 'SUCCESS' }), true);
  assert.equal(checkSucceeded({ state: 'SUCCESS' }), true);
  assert.equal(checkSucceeded({ state: 'success' }), true, 'case is tolerated');
  assert.equal(checkSucceeded({ conclusion: 'FAILURE' }), false);
  assert.equal(checkSucceeded({ state: 'PENDING' }), false);
  assert.equal(checkSucceeded({}), false);
  assert.equal(checkSucceeded(null), false);
});

test('the ADAPTER honours a classic commit status, not just the helper in isolation', () => {
  // This test exists because its absence let a real bug ship past three review rounds. Round 3
  // added `checkSucceeded` (handling both `conclusion` and `state`) and tested it DIRECTLY — but
  // the edit wiring it into the adapter silently failed, so `normalisePrForLens` kept its own
  // conclusion-only comparison. Every test still passed, because none of them exercised a classic
  // `state` through the adapter: the coverage was real for the helper and unreachable for the
  // integration. Exactly the "spec passes but cannot fail" trap Roadmap/LEARNINGS.md records.
  //
  // The distinguishing case is a SUCCEEDING classic status: it yields true only if the adapter
  // actually calls the helper, and false under the old conclusion-only code.
  const classicPass = normalisePrForLens({
    number: 1,
    statusCheckRollup: [{ name: 'ci', state: 'SUCCESS' }],
  });
  assert.equal(classicPass.ciPassedBeforeMerge, true, 'a passing classic status must count as passing');

  // A failing one must still fail — and note this case alone proves nothing, since it is false
  // under both implementations. That is why the assertion above has to exist.
  const classicFail = normalisePrForLens({
    number: 1,
    statusCheckRollup: [{ name: 'ci', state: 'FAILURE' }],
  });
  assert.equal(classicFail.ciPassedBeforeMerge, false);

  // Mixed shapes: every check must pass, whichever field carries its verdict.
  const mixed = normalisePrForLens({
    number: 1,
    statusCheckRollup: [{ conclusion: 'SUCCESS' }, { state: 'SUCCESS' }],
  });
  assert.equal(mixed.ciPassedBeforeMerge, true);
  const mixedFail = normalisePrForLens({
    number: 1,
    statusCheckRollup: [{ conclusion: 'SUCCESS' }, { state: 'FAILURE' }],
  });
  assert.equal(mixedFail.ciPassedBeforeMerge, false, 'one failing classic status fails the whole gate');
});

// ── Regression from cross-review round 6 ────────────────────────────────────────────────────

test('readCommits populates isRevert, and matches the SUBJECT not the body', () => {
  // `scoreTrustedSelfVerificationLoop` filters on `c.isRevert`; leaving it undefined made
  // revertCount 0 for EVERY repository — a 0% revert rate that means "never computed". It happened
  // to match this dataset (medusa-bonsai genuinely has no reverts), which is exactly how it went
  // unnoticed for six rounds: accidentally right here, wrong everywhere else.
  const SEP = '\x1e';
  const US = '\x1f';
  const log = [
    `abc${US}2026-07-01${US}Revert "feat: the thing"${SEP}`,
    `def${US}2026-07-02${US}Revert: an older style${SEP}`,
    `ghi${US}2026-07-03${US}feat: ordinary work${SEP}`,
    // The false positive this repo's own history actually contains: a commit whose BODY explains
    // how to revert. Matching the body would count it, and it is not a revert.
    `jkl${US}2026-07-04${US}chore: adopt the plugin\n\nRevert path: git revert <sha> on main.${SEP}`,
  ].join('');
  const commits = readCommits('/irrelevant', () => log);

  assert.deepEqual(
    commits.map((c) => c.isRevert),
    [true, true, false, false],
    'only a genuine revert SUBJECT counts'
  );
});

test('readCommits still parses sha, date and agent authorship from a multi-line body', () => {
  const SEP = '\x1e';
  const US = '\x1f';
  const log = `abc${US}2026-07-01${US}feat: thing\n\nSome body.\n\nCo-Authored-By: Claude Opus 5 <x@y>${SEP}`;
  const [c] = readCommits('/irrelevant', () => log);
  assert.equal(c.sha, 'abc');
  assert.equal(c.date, '2026-07-01');
  assert.equal(c.agentCoAuthored, true, 'the trailer lives in the BODY, not the subject');
});

// ── Regression from cross-review round 8 ────────────────────────────────────────────────────

test('a check NAME is read from either shape — `name` or classic `context`', () => {
  // The third half-migration of the same two-shape API: round 3 taught `checkSucceeded` about
  // classic `state`, and the NAME beside it kept reading only `name`. A repo posting classic
  // statuses produced an empty ciCheckNames and a false `not_met` on code-quality enforcement.
  assert.equal(checkName({ name: 'Static gate + build' }), 'Static gate + build');
  assert.equal(checkName({ context: 'ci/circleci: build' }), 'ci/circleci: build');
  assert.equal(checkName({}), null);
  assert.equal(checkName(null), null);
});

test('the adapter collects names from BOTH check shapes', () => {
  const pr = normalisePrForLens({
    number: 1,
    statusCheckRollup: [
      { name: 'gate', conclusion: 'SUCCESS' },
      { context: 'ci/external', state: 'SUCCESS' },
    ],
  });
  assert.deepEqual(pr.ciCheckNames, ['gate', 'ci/external']);
  assert.equal(pr.ciPassedBeforeMerge, true, 'and both count toward the gate');
});

// ── Sprint 2.5a — wiring `--push` for real ───────────────────────────────────────────────────
// The bug this closes: the old `--push` printed a warning and exited 0 whether or not anything was
// actually stored. These pure helpers are what main() calls to decide WHERE to push, WITH what
// credential, and WHAT to send — each is worth pinning on its own, without a network or a real
// medusa-bonsai checkout.

test('gatherSourceRef reads the ANALYSED repo, not this one, via an injectable git runner', () => {
  const calls = [];
  const run = (repo, args) => {
    calls.push([repo, args]);
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'deadbeef1234';
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return 'main';
    return '';
  };
  const ref = gatherSourceRef('/some/medusa-bonsai', run);
  assert.deepEqual(ref, { commit: 'deadbeef1234', ref: 'main' });
  assert.ok(
    calls.every(([repo]) => repo === '/some/medusa-bonsai'),
    'every git call must target the analysed repo, never this checkout'
  );
});

test('gatherSourceRef returns null, never empty string, when git yields nothing', () => {
  // null (not '' and not undefined) matches buildPushEnvelope's own `?? null` and
  // scripts/roadmap-push.mjs's stated reason: JSON.stringify drops undefined keys silently, and an
  // empty string is a value a caller could mistake for a real (if odd) ref.
  assert.deepEqual(gatherSourceRef('/irrelevant', () => ''), { commit: null, ref: null });
});

test('resolvePushConfig prefers POD_REPORT_API_KEY over SELF_PROJECT_API_KEY', () => {
  const cfg = resolvePushConfig({
    POD_REPORT_API_KEY: 'pod-key',
    SELF_PROJECT_API_KEY: 'self-key',
  });
  assert.equal(cfg.apiKey, 'pod-key', 'the Pod Report may push to a different tenant than the roadmap');
});

test('resolvePushConfig falls back to SELF_PROJECT_API_KEY when POD_REPORT_API_KEY is unset', () => {
  const cfg = resolvePushConfig({ SELF_PROJECT_API_KEY: 'self-key' });
  assert.equal(cfg.apiKey, 'self-key');
});

test('resolvePushConfig yields a null apiKey when neither env var is set — the clean-skip signal', () => {
  const cfg = resolvePushConfig({});
  assert.equal(cfg.apiKey, null);
  assert.equal(cfg.baseUrl, 'http://localhost:3000', 'matches roadmap-push.mjs\'s own default');
});

test('resolvePushConfig reads GROWTH_ENGINE_URL when set', () => {
  const cfg = resolvePushConfig({ GROWTH_ENGINE_URL: 'https://golden-beans-gamma.vercel.app' });
  assert.equal(cfg.baseUrl, 'https://golden-beans-gamma.vercel.app');
});

test('buildPushEnvelope adds git provenance WITHOUT displacing the dataset counts', () => {
  const artifact = buildArtifact({
    delivery: { cycleTimeDays: 1 },
    source: { repo: 'medusa-bonsai', commits: 841, epics: 133, mergedPrs: 98, windowDays: 400 },
    generatedAt: '2026-07-25T00:00:00.000Z',
  });
  const envelope = buildPushEnvelope(artifact, { commit: 'abc1234', ref: 'main' });

  assert.equal(envelope.schemaVersion, POD_REPORT_SCHEMA_VERSION);
  assert.equal(envelope.generatedAt, artifact.generatedAt);
  assert.deepEqual(envelope.delivery, artifact.delivery);
  assert.deepEqual(envelope.caveats, artifact.caveats);

  // Git provenance rides in its OWN key. An earlier draft put it in `source`, which meant the push
  // overwrote Story 2.1's dataset provenance — so every PUSHED report rendered "measured over ⟨⟩"
  // with no counts, while a locally printed one looked perfect. This pair of assertions is what
  // distinguishes the two implementations, so it is the pair that has to exist.
  assert.deepEqual(envelope.pushSource, { commit: 'abc1234', ref: 'main' });
  assert.deepEqual(envelope.source, artifact.source, 'the dataset counts must survive the push');
  assert.equal(envelope.source.commits, 841);
});

test('buildPushEnvelope emits explicit nulls, never undefined, for a missing commit/ref', () => {
  const artifact = buildArtifact({ delivery: {}, source: {}, generatedAt: 'x' });
  const envelope = buildPushEnvelope(artifact, {});
  assert.equal(envelope.pushSource.commit, null);
  assert.equal(envelope.pushSource.ref, null);
  const round = JSON.parse(JSON.stringify(envelope));
  assert.ok('commit' in round.pushSource, 'commit must survive serialisation as an explicit null');
  assert.ok('ref' in round.pushSource, 'ref must survive serialisation as an explicit null');
});

test('the script and the server agree on POD_REPORT_SCHEMA_VERSION', () => {
  // Duplicated on purpose (this zero-dependency .mjs cannot import the TypeScript module behind
  // Next's `@/` alias) — the same convention roadmap-push.test.mjs pins for ROADMAP_SCHEMA_VERSION.
  const ts = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'lib', 'pod-report-schema.ts'),
    'utf8'
  );
  const m = ts.match(/export const POD_REPORT_SCHEMA_VERSION = (\d+)/);
  assert.ok(m, 'could not find POD_REPORT_SCHEMA_VERSION in the schema module — did it move?');
  assert.equal(
    Number(m[1]),
    POD_REPORT_SCHEMA_VERSION,
    'scripts/pod-report.mjs and lib/pod-report-schema.ts disagree on the schema version'
  );
});
