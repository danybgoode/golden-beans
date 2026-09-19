// prose-guard — the mechanical check that stands between a machine draft and a human reader.
//
// Both directions matter and they fail in opposite ways:
//   too LOOSE  → the measured hallucinations (invented beneficiary, unsupported fix claim, a
//                fabricated deadline, "it's live" about a flag-OFF epic) sail through, which is the
//                whole reason this file exists;
//   too STRICT → a legitimate report about a real fix for real merchants gets rejected, the retry
//                produces something worse, and whoever maintains this learns to bypass the guard.
//
// So every "must flag" case below is paired with a "must NOT flag" case. Ported from golden-beans
// with its suite, plus the flag-state-claim block that is ours (README D6).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkProse,
  findingsToRevisionNote,
  countWords,
  countSentences,
  flagTokens,
  BANNED_TOOL_NAMES,
} from './prose-guard.mjs';

const codes = (r) => r.findings.map((f) => f.code);

// A clean internal report: names the real beneficiary, claims no fix, no tool names, no liveness.
const CLEAN_INTERNAL =
  'Whoever ships next gets faster feedback. A whole class of mistake is now caught in seconds ' +
  'rather than after a deploy, and the checks run on every change without anyone remembering to.';

test('a clean internal report passes', () => {
  const r = checkProse(CLEAN_INTERNAL, { allowsFixClaim: false, allowsBeneficiary: false });
  assert.equal(r.ok, true, `unexpected findings: ${JSON.stringify(r.findings)}`);
});

// ── The two measured hallucinations ─────────────────────────────────────────────────────────

test('MEASURED FAILURE 1: an invented beneficiary is flagged on an internal change', () => {
  // Verbatim shape of the real run: internal test tooling described as benefiting tenants.
  const draft = 'Tenants now benefit from a faster test suite that validates core functions in milliseconds.';
  const r = checkProse(draft, { allowsBeneficiary: false });
  assert.ok(codes(r).includes('invented-beneficiary'));
  assert.equal(r.ok, false);
});

test('…but a REAL merchant-facing change may name merchants', () => {
  const draft = 'Merchants can hand a partner a portfolio and see what that partner did with it.';
  const r = checkProse(draft, { allowsBeneficiary: true });
  assert.ok(!codes(r).includes('invented-beneficiary'));
});

test('an explicit no-impact disclosure is allowed for internal work', () => {
  for (const beneficiary of ['customer', 'client', 'shopper', 'subscriber']) {
    const draft = `The roadmap now records the agreed operating boundary. There was no ${beneficiary}-visible effect.`;
    const r = checkProse(draft, { allowsBeneficiary: false });
    assert.ok(!codes(r).includes('invented-beneficiary'), `${beneficiary}: ${JSON.stringify(r.findings)}`);
  }
});

test('a no-impact sentence does not launder a separate positive beneficiary claim', () => {
  const draft = 'There was no customer-visible effect. Users now benefit from faster and safer publishing.';
  const r = checkProse(draft, { allowsBeneficiary: false });
  assert.ok(codes(r).includes('invented-beneficiary'));
});

test('MEASURED FAILURE 2: an unsupported fix claim is flagged', () => {
  // Verbatim shape of the real run: a commit that only ADDED TESTS claiming it closed the bug.
  const draft =
    'The previous backslash bypass is blocked, eliminating a potential open-redirect attack for everyone.';
  const r = checkProse(draft, { allowsFixClaim: false, allowsBeneficiary: true });
  assert.ok(codes(r).includes('unsupported-fix-claim'));
});

test('…but a genuine fix may be reported as a fix', () => {
  const draft = 'A sign-in that failed for some people is fixed; they can reach their account again.';
  const r = checkProse(draft, { allowsFixClaim: true, allowsBeneficiary: true });
  assert.ok(!codes(r).includes('unsupported-fix-claim'), JSON.stringify(r.findings));
});

test('every fix-claim phrasing is caught, not just the word "fixed"', () => {
  for (const draft of [
    'This resolves the crash people were hitting.',
    'The leak is now closed.',
    'Sign-in no longer breaks on a slow connection.',
    'The vulnerability was removed.',
    'The flow is now secure.',
    'This prevents the duplicate charge.',
  ]) {
    const r = checkProse(draft, { allowsFixClaim: false, allowsBeneficiary: true, minWords: 1 });
    assert.ok(codes(r).includes('unsupported-fix-claim'), `missed a fix claim: ${draft}`);
  }
});

// ── Register and length ─────────────────────────────────────────────────────────────────────

test('marketing vocabulary is flagged', () => {
  const r = checkProse('This seamlessly leverages a robust pipeline to empower the whole org.', {
    allowsBeneficiary: true,
  });
  assert.ok(codes(r).includes('marketing-language'));
});

test('tool, framework and model names are flagged', () => {
  const r = checkProse('The Playwright suite now runs against Supabase, drafted by Gemini.', {
    allowsBeneficiary: true,
  });
  assert.ok(codes(r).includes('names-implementation'));
});

test("a project's OWN stack names are flagged when it configures them (prose.extraBannedToolNames)", () => {
  // The shipped list is universal; a project's commerce engine, auth provider and integrations are
  // not, so they arrive through config. Unconfigured, they must NOT be flagged — this list ships to
  // every project and one project's product noun is another's ordinary word.
  const extraBannedToolNames = ['acmecart', 'authly', 'cloud run', 'mega ?market'];
  for (const draft of [
    'The Acmecart module now owns the write path for the whole catalog.',
    'Authly sessions survive the redirect, so nobody is signed out twice.',
    'The service runs on Cloud Run in a single region with a warm instance.',
    'The Mega Market sync pulls orders every ten minutes without a manual step.',
    'The MegaMarket sync pulls orders every ten minutes without a manual step.',
  ]) {
    const r = checkProse(draft, { allowsBeneficiary: true, minWords: 1, extraBannedToolNames });
    assert.ok(codes(r).includes('names-implementation'), `missed a configured stack name: ${draft}`);
    const bare = checkProse(draft, { allowsBeneficiary: true, minWords: 1 });
    assert.ok(!codes(bare).includes('names-implementation'), `flagged an unconfigured name: ${draft}`);
  }
});

test('the finding names the offending tool in readable form, not as a regex fragment', () => {
  const r = checkProse('The Mega Market bridge and the Node.js runner both changed.', {
    allowsBeneficiary: true,
    minWords: 1,
    extraBannedToolNames: ['mega ?market'],
  });
  const note = r.findings.find((f) => f.code === 'names-implementation').note;
  assert.match(note, /mega market/);
  assert.match(note, /node\.js/);
  assert.ok(!note.includes('?'), `regex metacharacters leaked into a human note: ${note}`);
});

test('ordinary words that merely LOOK like tool names are not flagged', () => {
  // The guard must not fire on "next" the adverb or "react" the verb — a false positive here
  // rejects a perfectly good sentence and teaches people to distrust the check.
  const r = checkProse(
    'Whoever ships next sees the change immediately, and the page does not react to a stale value.',
    { allowsBeneficiary: false }
  );
  assert.ok(!codes(r).includes('names-implementation'), JSON.stringify(r.findings));
});

test('the deliberate omissions stay omitted — this list is the contract, not an accident', () => {
  // Pinned so a future "helpful" addition of bare `react`/`next`/`stripe` has to argue with a test
  // rather than slip in. The reasoning lives in prose-guard.mjs beside the list.
  for (const bare of ['react', 'next', 'stripe']) {
    assert.ok(!BANNED_TOOL_NAMES.includes(bare), `${bare} must stay out of BANNED_TOOL_NAMES`);
  }
});

test('an unfinished last sentence is flagged', () => {
  const r = checkProse('The checks now run on every change and future work adds', {
    allowsBeneficiary: false,
  });
  assert.ok(codes(r).includes('unfinished'));
});

test('a complete sentence ending in a quote or bracket is NOT flagged as unfinished', () => {
  // The golden-beans original only tested "…it)." — the period is last there, so the optional
  // closing-delimiter group in endsCleanly was never exercised and the spec passed for the wrong
  // reason (proved by mutation: dropping the group left it green). These endings actually need it.
  for (const draft of [
    'The empty state now explains itself (and says how to get out of it).',
    'The empty state now says "add your first product."',
    'The whole check runs on every change (nobody has to remember it.)',
    "Whoever ships next sees it, and the reason sits beside the rule that needs it.'",
  ]) {
    const r = checkProse(draft, { allowsBeneficiary: false, minWords: 1 });
    assert.ok(!codes(r).includes('unfinished'), `false 'unfinished' on: ${draft}`);
  }
});

test('length is bounded in both directions', () => {
  const long = 'word '.repeat(80).trim() + '.';
  assert.ok(codes(checkProse(long, { allowsBeneficiary: false })).includes('too-long'));
  assert.ok(codes(checkProse('Done.', { allowsBeneficiary: false })).includes('too-short'));
});

test('an empty draft is a finding, not a pass', () => {
  for (const empty of ['', '   ', null, undefined]) {
    const r = checkProse(empty, {});
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), ['empty']);
  }
});

// ── The retry note ──────────────────────────────────────────────────────────────────────────

test('findings become a concrete, numbered revision instruction', () => {
  // A guard that only says "rejected" produces another guess; one that says what is wrong produces
  // a correction. So the note must carry every finding's text.
  const r = checkProse('Tenants are delighted that the bug is fixed.', {
    allowsFixClaim: false,
    allowsBeneficiary: false,
  });
  const note = findingsToRevisionNote(r.findings);
  for (const f of r.findings) assert.ok(note.includes(f.note), `note omitted: ${f.code}`);
  assert.match(note, /^\d+\./m, 'findings must be numbered');
  assert.match(note, /Output only the corrected report/);
});

test('counters are honest about words and sentences', () => {
  assert.equal(countWords('one two three'), 3);
  assert.equal(countWords('  '), 0);
  assert.equal(countSentences('One. Two! Three?'), 3);
  assert.equal(countSentences('no terminator'), 0);
});

// ── MEASURED FAILURE 3: invented commitments (2026-07-25, golden-beans' standup rail) ────────

test('MEASURED FAILURE 3: a fabricated deadline is flagged, with no way to unlock it', () => {
  // Verbatim from the real draft. Git history contains no deadlines, so this is invented by
  // construction — and it is the most corrosive of the three, because it makes people chase work
  // nobody agreed to and it reads as perfectly ordinary standup language.
  const draft =
    'Nothing is currently blocked, though design sign-off on the Sprint 2 layout is owed before tomorrow.';
  const r = checkProse(draft, { allowsFixClaim: true, allowsBeneficiary: true, minWords: 1 });
  assert.ok(codes(r).includes('invented-commitment'));
  // Unconditional: no evidence flag may legitimately permit a fabricated date.
  const permissive = checkProse(draft, {
    allowsFixClaim: true,
    allowsBeneficiary: true,
    liveFlags: ['everything.enabled'],
    minWords: 1,
    maxWords: 500,
  });
  assert.ok(codes(permissive).includes('invented-commitment'), 'no flag may unlock a fabricated deadline');
});

test('every fabricated-deadline phrasing is caught', () => {
  for (const draft of [
    'The review is due by Friday.',
    'This will ship next week.',
    'Approval is pending and needed by end of week.',
    'The migration is scheduled for tomorrow.',
    'It will be ready by Monday.',
  ]) {
    const r = checkProse(draft, { allowsFixClaim: true, allowsBeneficiary: true, minWords: 1 });
    assert.ok(codes(r).includes('invented-commitment'), `missed a fabricated commitment: ${draft}`);
  }
});

test('an honest owed-item WITHOUT a date is not flagged', () => {
  // The correct way to report an obligation: name it, name who holds it, attach no invented date.
  const draft =
    'The product owner still needs to add a repository secret before the automatic push turns on, and to read the three views themselves.';
  const r = checkProse(draft, { allowsFixClaim: false, allowsBeneficiary: false });
  assert.ok(!codes(r).includes('invented-commitment'), JSON.stringify(r.findings));
});

// ── flag-state-claim — OUR rule (README D6) ─────────────────────────────────────────────────
// Ours is a flag-gated shop: five epics in two weeks shipped dark behind a default-OFF flag. A
// report calling one of them "live" is the highest-risk falsehood this guard can catch, because it
// is the sentence that would stop the product owner doing the flip the epic is waiting on.

test('D6: a flag-OFF epic CANNOT be reported as live', () => {
  // partner_portfolio_enabled shipped OFF on 2026-07-25 and is still OFF. This is the sentence.
  const draft =
    'The partner portfolio is live, so anyone handed a shop can now see what they are responsible for.';
  const r = checkProse(draft, { allowsBeneficiary: true, liveFlags: [], minWords: 1 });
  assert.ok(codes(r).includes('flag-state-claim'), JSON.stringify(r.findings));
  assert.equal(r.ok, false);
});

test('D6: the finding quotes the offending sentence back, so the retry knows what to rewrite', () => {
  const draft = 'The rail landed cleanly. The partner portfolio is live for everyone it was built for.';
  const r = checkProse(draft, { allowsBeneficiary: true, liveFlags: [], minWords: 1 });
  const note = r.findings.find((f) => f.code === 'flag-state-claim').note;
  assert.match(note, /The partner portfolio is live/);
  assert.ok(!note.includes('The rail landed cleanly'), 'only the offending clause should be quoted');
});

test('D6: a capability the pack proves is ON may be reported as live', () => {
  // The corroborating half. Without this the rule would be "never say live", which is not the rule.
  const draft = 'The activation crm is live, and the emission rail behind it now runs on every change.';
  const r = checkProse(draft, {
    allowsBeneficiary: true,
    liveFlags: ['promoter.activation_crm_enabled'],
    minWords: 1,
  });
  assert.ok(!codes(r).includes('flag-state-claim'), JSON.stringify(r.findings));
});

test('D6: one live capability does not launder a DIFFERENT liveness claim', () => {
  // The laundering case: something genuinely on, plus something that is not, in one paragraph.
  const draft =
    'The activation crm is live. The partner portfolio is live too, ready for whoever gets handed one.';
  const r = checkProse(draft, {
    allowsBeneficiary: true,
    liveFlags: ['promoter.activation_crm_enabled'],
    minWords: 1,
    maxWords: 200,
  });
  const note = r.findings.find((f) => f.code === 'flag-state-claim')?.note;
  assert.ok(note, 'the uncorroborated claim must still be caught');
  assert.match(note, /partner portfolio/);
});

test('D6: the honest dark-shipping sentence is NOT flagged', () => {
  // D5 asks for exactly this sentence ("the rail exists; nothing fires yet"). A guard that rejects
  // the truth it exists to protect would be worse than no guard.
  for (const draft of [
    'The rail is built and nothing is live yet, because the flag it sits behind has never been flipped.',
    'Everything landed dark; no part of it is enabled for anyone until the product owner flips the switch themselves.',
    'The portfolio is not live and will stay dark until someone reads it end to end.',
  ]) {
    const r = checkProse(draft, { allowsBeneficiary: true, liveFlags: [], minWords: 1 });
    assert.ok(!codes(r).includes('flag-state-claim'), `false positive on an honest sentence: ${draft}`);
  }
});

test('D6: a negation in a LATER clause does not excuse the claim', () => {
  // The reason the negator window is scoped to the words before the claim rather than the whole
  // sentence — a sentence-wide check excused exactly this shape.
  const draft = 'The partner portfolio is live for every shop, and no smoke test has been run against it.';
  const r = checkProse(draft, { allowsBeneficiary: true, liveFlags: [], minWords: 1 });
  assert.ok(codes(r).includes('flag-state-claim'), JSON.stringify(r.findings));
});

test('D6: every liveness phrasing is caught, not just "is live"', () => {
  for (const draft of [
    'The portfolio is live.',
    'The reminder cron is now enabled.',
    'The scorecard went live this morning.',
    'The intake form is rolled out to everyone.',
    'The emission rail is running in production.',
    'The consent preview is now available.',
  ]) {
    const r = checkProse(draft, { allowsBeneficiary: true, liveFlags: [], minWords: 1 });
    assert.ok(codes(r).includes('flag-state-claim'), `missed a liveness claim: ${draft}`);
  }
});

// This test previously asserted the OPPOSITE — that a bare "can now" was always legal. Cross-review
// showed that pinned a hole: with the flag off, "a shop owner can now …" is simply false, and it is
// the exact shape prose-lessons.md warns about. The register is protected by EVIDENCE, not by an
// omission: the same sentence passes the moment the pack can prove the capability is on.
test('D6: "can now" is a liveness claim — caught when nothing corroborates it', () => {
  const draft = 'A shop owner can now hand a partner one shop instead of the whole account.';
  const r = checkProse(draft, { allowsBeneficiary: true, liveFlags: [], minWords: 1 });
  assert.ok(codes(r).includes('flag-state-claim'), JSON.stringify(r.findings));
});

test('D6: the SAME "can now" sentence passes once the pack proves the capability is on', () => {
  const draft = 'A shop owner can now hand a partner one shop instead of the whole account.';
  const r = checkProse(draft, {
    allowsBeneficiary: true,
    liveFlags: ['promoter.partner_portfolio_enabled'],
    minWords: 1,
  });
  assert.ok(!codes(r).includes('flag-state-claim'), JSON.stringify(r.findings));
});

test('D6: an explicitly dark "can now" is still legal — the negation valve holds', () => {
  const draft = 'Nobody can now hand a partner a shop, because the rail stays dark until the flag flips.';
  const r = checkProse(draft, { allowsBeneficiary: true, liveFlags: [], minWords: 1 });
  assert.ok(!codes(r).includes('flag-state-claim'), JSON.stringify(r.findings));
});

test('flagTokens: a flag key reduces to the words a report would actually say', () => {
  assert.deepEqual(flagTokens('promoter.partner_portfolio_enabled'), ['partner', 'portfolio']);
  assert.deepEqual(flagTokens('growth.founding_merchants_enabled'), ['founding', 'merchants']);
  // Short segments are dropped — a two-letter token would match half the alphabet's worth of prose.
  assert.deepEqual(flagTokens('mcp.ui_enabled'), []);
  assert.deepEqual(flagTokens(''), []);
});

test('flagTokens: a plain capability name works, for a change with no flag at all', () => {
  // The escape valve, and it is shaped like evidence rather than like a boolean.
  assert.deepEqual(flagTokens('standup prose rail'), ['standup', 'prose', 'rail']);
});

// ---- `unfinished` vs structural markdown (regression: the first real prose-draft run) ----
//
// Measured 2026-07-26: every `--kind poster` draft ends with the house table row and was flagged
// `unfinished` on BOTH writers through all four attempts. A guard that rejects correct output trains
// people to ignore it, which hides the findings it exists to surface.

test('unfinished: a markdown table row is a clean ending when the surface allows markdown', () => {
  const draft =
    'A real poster paragraph that ends properly.\n\n| [slug](slug/) | what it does | ✅ **Shipped 2026-07-02** |';
  assert.equal(
    checkProse(draft, { allowsMarkdown: true, maxWords: 4000, minWords: 5 }).findings.some(
      (f) => f.code === 'unfinished'
    ),
    false
  );
});

test('unfinished: the SAME draft is still flagged on a prose-only surface', () => {
  const draft =
    'A real poster paragraph that ends properly.\n\n| [slug](slug/) | what it does | ✅ **Shipped 2026-07-02** |';
  assert.ok(
    checkProse(draft, { allowsMarkdown: false, maxWords: 4000, minWords: 5 }).findings.some(
      (f) => f.code === 'unfinished'
    )
  );
});

test('unfinished: headings, list items and fenced blocks also end cleanly under allowsMarkdown', () => {
  for (const tail of [
    '## Gaps / follow-ups',
    '- one owed smoke',
    '```',
    '[GAP: no close date in the sources]',
  ]) {
    const draft = `Some real content in a sentence.\n\n${tail}`;
    assert.equal(
      checkProse(draft, { allowsMarkdown: true, maxWords: 4000, minWords: 5 }).findings.some(
        (f) => f.code === 'unfinished'
      ),
      false,
      `expected "${tail}" to count as a clean ending`
    );
  }
});

test('unfinished: allowsMarkdown does NOT excuse a genuine mid-clause fragment', () => {
  const draft =
    'The rail is built and the reminder schedule still has no runner, so broader error handling is';
  assert.ok(
    checkProse(draft, { allowsMarkdown: true, maxWords: 4000, minWords: 5 }).findings.some(
      (f) => f.code === 'unfinished'
    )
  );
});

// ---- beneficiary mentions that DENY impact (regression: the guard contradicted its own brief) ----
//
// prose-lessons.md ends with "Say 'no user-visible effect' when that is the truth", and the persona
// tells the writer to state plainly that customers are unaffected for internal work. The beneficiary
// rule then fired on exactly that compliant sentence (measured 2026-07-26). A guard that rejects the
// sentence its own lessons demand teaches the writer to avoid the honest phrasing.

test('invented-beneficiary: a NO-IMPACT mention is allowed even when allowsBeneficiary is false', () => {
  for (const draft of [
    'Most of today went into the delivery rail rather than anything a shopper would see, and the work is internal.',
    'This has no user-visible effect; the beneficiary is whoever builds here next and the effect is a bug class caught earlier.',
    'Merchants are unaffected by this work, which tightened an internal check that used to depend on memory.',
  ]) {
    const findings = checkProse(draft, { allowsBeneficiary: false, maxWords: 200, minWords: 5 }).findings;
    assert.equal(
      findings.some((f) => f.code === 'invented-beneficiary'),
      false,
      `a no-impact mention must not be flagged: ${draft}`
    );
  }
});

test('invented-beneficiary: a POSITIVE claim about the same nouns is still flagged', () => {
  const draft = 'Merchants can now hand a shop to a partner and buyers get a faster checkout as a result.';
  assert.ok(
    checkProse(draft, { allowsBeneficiary: false, maxWords: 200, minWords: 5 }).findings.some(
      (f) => f.code === 'invented-beneficiary'
    )
  );
});
