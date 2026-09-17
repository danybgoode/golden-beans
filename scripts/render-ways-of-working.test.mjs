import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseFillIns,
  REQUIRED_FILLS,
  render,
  slotsIn,
  TEMPLATE_PATH,
  FILLINS_PATH,
  OUT_PATH,
} from './render-ways-of-working.mjs';

const TEMPLATE =
  '<!-- maintainer note -->\n# Doc\n\nOwner: {{fill:owner}}.\n\n{{fill:posture}}\n\n## Section\n\n{{fill:rail}}\n';

test('rendering twice is a byte-for-byte no-op — regeneration must be boring', () => {
  const values = { owner: 'the PO', posture: '', rail: 'Merge = deploy.' };
  const once = render(TEMPLATE, values);
  assert.equal(render(TEMPLATE, values), once);
});

test('the committed template renders to exactly the committed WAYS-OF-WORKING.md', () => {
  // The same assertion `--check` makes in CI; here it also pins that the committed pair is consistent.
  const out = render(readFileSync(TEMPLATE_PATH, 'utf8'), parseFillIns(readFileSync(FILLINS_PATH, 'utf8')));
  assert.equal(out, readFileSync(OUT_PATH, 'utf8'));
});

test('a slot with no value is a hard error — a silently empty slot deletes a paragraph', () => {
  assert.throws(() => render(TEMPLATE, { owner: 'x', posture: '' }), /missing: rail/);
});

test('a fill-in the template no longer asks for is a hard error — a stale promise', () => {
  assert.throws(
    () => render(TEMPLATE, { owner: 'x', posture: '', rail: 'r', tooling: 'gone' }),
    /no longer asks for: tooling/
  );
});

test('an EMPTY block slot drops its line cleanly; a filled one is substituted', () => {
  const out = render(TEMPLATE, { owner: 'the PO', posture: '', rail: 'Merge = deploy.' });
  assert.doesNotMatch(out, /\{\{fill:/);
  assert.doesNotMatch(out, /\n{3,}/, 'a removed slot must not leave a blank-line seam that churns diffs');
  assert.match(out, /Owner: the PO\./);
  assert.match(out, /## Section\n\nMerge = deploy\./);
});

test('the rendered file carries a GENERATED banner and drops the source-only maintainer comment', () => {
  const out = render(TEMPLATE, { owner: 'x', posture: '', rail: 'r' });
  assert.match(out.split('\n')[0], /GENERATED FILE — do not edit by hand/);
  assert.doesNotMatch(out, /maintainer note/);
});

test('fill-ins parser: block and quoted scalars; anything else is refused with its line number', () => {
  const v = parseFillIns('# c\nowner: "the \\"PO\\""\n\nrail: |\n  line one\n\n  line two\n\nposture: ""\n');
  assert.equal(v.owner, 'the "PO"');
  assert.equal(v.rail, 'line one\n\nline two');
  assert.equal(v.posture, '');
  assert.throws(() => parseFillIns('owner: unquoted\n'), /line 1/);
  assert.throws(() => parseFillIns('a: "x"\na: "y"\n'), /duplicate key 'a'/);
  assert.throws(() => parseFillIns('list:\n  - one\n'), /only 'key: \|'/);
});

test('an UNINDENTED heading inside a block is a hard error, never a silently dropped comment', () => {
  const text = 'rail: |\n  intro line\n\n# Heading meant as content\n  more block text\nnext: "x"\n';
  assert.throws(() => parseFillIns(text), /column 0 but is followed by indented block text/);
  // A real comment between keys is still fine.
  assert.deepEqual(parseFillIns('a: "1"\n\n# a comment\nb: "2"\n'), { a: '1', b: '2' });
});

test('slotsIn lists each slot once, in order', () => {
  assert.deepEqual(slotsIn('{{fill:a}} {{fill:b}} {{fill:a}}'), ['a', 'b']);
});

test('a REQUIRED slot left empty is a hard error — an empty deploy rail deletes the rule', () => {
  // Found by codex on #17: `deploy_rail: ""` rendered a file with no deploy rail, and `--check` called
  // that current. The slots a project may honestly not have stay optional.
  const tpl = '# T\n\n{{fill:deploy_rail}}\n\n{{fill:operating_posture}}\n';
  assert.throws(
    () => render(tpl, { deploy_rail: '   ', operating_posture: '' }),
    /required slot\(s\) EMPTY: deploy_rail/
  );
  const out = render(tpl, { deploy_rail: 'merge = deploy', operating_posture: '' });
  assert.match(out, /merge = deploy/);
});

test('every REQUIRED_FILLS key is a slot the real template actually asks for', () => {
  // A renamed slot would leave the guard pointing at nothing — so it is pinned against the real template.
  const slots = slotsIn(readFileSync(TEMPLATE_PATH, 'utf8'));
  for (const k of REQUIRED_FILLS) assert.ok(slots.includes(k), `REQUIRED_FILLS names a missing slot: ${k}`);
});
