// roadmap-comments.test.mjs — no tracked Roadmap doc opens an HTML comment it never closes.
//
// `doc-format`'s `unclosed-html-comment` rule only runs where doc-format runs: skills-ci, over the plugin's own tree.
// This repo's `doc-format --check` is already red on older docs (think-skills C4), so it can't tell a new unclosed
// comment from that noise, and the defect it was written for (an epic README rendering as one big comment) would ship
// here again on a green gate. This test runs the same rule over every tracked Markdown file under Roadmap/. It is
// clean today, so it is enforced from the start, in the root unit suite and the pre-push hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unclosedComments } from './doc-format.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

test('no tracked Roadmap doc opens <!-- without closing it', () => {
  const files = execFileSync('git', ['ls-files', '-z', 'Roadmap/*.md', 'Roadmap/**/*.md'], {
    cwd: REPO,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  assert.ok(files.length > 100, `found only ${files.length} Roadmap docs — the glob is wrong`);
  const broken = files.flatMap((file) =>
    unclosedComments(readFileSync(join(REPO, file), 'utf8')).map((o) => `${file}: ${o.detail}`)
  );
  assert.deepEqual(broken, []);
});
