import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectDesignSource, withoutComments } from './check-design-drift.mjs';

test('comments may explain retired pictographs without making them UI', () => {
  const source = `// replaced ✅ with Badge\n{/* ⚙ was the old tool marker */}\n<Badge status="live">LIVE</Badge>`;
  assert.equal(withoutComments(source).includes('✅'), false);
  assert.deepEqual(inspectDesignSource(source), []);
});

test('rendered pictographs, raw hex and landing inline styles are rejected', () => {
  const source = `<span style={{ color: '#fff' }}>✅ live</span>`;
  assert.deepEqual(
    inspectDesignSource(source, { disallowInlineStyle: true }).map((finding) => finding.rule),
    ['ui-pictograph', 'raw-hex', 'landing-inline-style']
  );
});

test('multi-line and computed style props cannot bypass the landing rail', () => {
  const source = `<div\n  style={\n    dynamicStyle\n  }\n/>`;
  assert.deepEqual(
    inspectDesignSource(source, { disallowInlineStyle: true }).map((finding) => finding.rule),
    ['landing-inline-style']
  );
});

test('URL fragments that happen to look hexadecimal are not colors', () => {
  const source = `<><a href="#dead">Jump</a><a href="/proof#c001">Proof</a></>`;
  assert.deepEqual(inspectDesignSource(source), []);
});

test('token classes and accessible icon components are accepted', () => {
  const source = `<Badge status="live"><Icon name="check" />LIVE</Badge>`;
  assert.deepEqual(inspectDesignSource(source, { disallowInlineStyle: true }), []);
});
