import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citations, evaluate, frontmatter, ITEMS, refKey } from './epic-dod.mjs';

const README_SHIPPED = '---\nstatus: shipped   # closed\nslug: demo\n---\n# Epic\n';
const README_OPEN = '---\nstatus: in-progress\nslug: demo\n---\n# Epic\n';
const SPRINT_DONE = { name: 'sprint-1.md', text: '# S1\n\n**Status:** ✅ shipped — PR #12 merged\n' };
const SPRINT_OPEN = { name: 'sprint-2.md', text: '# S2\n\n**Status:** ⬜ not started\n' };
const RETRO_REAL = '# Retro\n\n_Closed: 2026-09-17_\n';
const RETRO_STUB = '# Retro\n\n_Closed: <date>_\n';
const merged = (...refs) => new Map(refs.map((r) => [r, 'merged']));

const closedEpic = {
  slug: 'demo',
  readme: README_SHIPPED,
  sprints: [SPRINT_DONE],
  retro: RETRO_REAL,
  verified: merged('pr:.#12'),
  branches: ['main', 'feat/other'],
};

test('a known-CLOSED epic passes every derivable item', () => {
  const r = evaluate(closedEpic);
  assert.equal(r.ok, true, JSON.stringify(r.items));
  for (const k of ITEMS) assert.equal(r.items[k].state, 'pass', k);
});

test('a known-OPEN epic reports exactly what is outstanding — it never claims done', () => {
  const r = evaluate({
    slug: 'demo',
    readme: README_OPEN,
    sprints: [SPRINT_DONE, SPRINT_OPEN],
    retro: RETRO_STUB,
    verified: merged('pr:.#12'),
    branches: ['main', 'feat/demo-s2'],
  });
  assert.equal(r.ok, false);
  assert.equal(r.items['readme-shipped'].state, 'fail');
  assert.match(r.items['sprints-ticked'].detail, /sprint-2\.md/);
  assert.match(r.items['sprints-merged'].detail, /sprint-2\.md cites no PR/);
  assert.match(r.items['retro-written'].detail, /stub/);
  assert.match(r.items['branch-deleted'].detail, /feat\/demo-s2/);
});

test('UNAVAILABLE is not pass — an unverifiable citation or an unreadable remote fails the run', () => {
  const r = evaluate({ ...closedEpic, verified: new Map(), branches: null });
  assert.equal(r.ok, false);
  assert.equal(r.items['sprints-merged'].state, 'unavailable');
  assert.equal(r.items['branch-deleted'].state, 'unavailable');
});

test('a sprint citing an UNMERGED PR fails even when another citation is merged', () => {
  const sprint = { name: 'sprint-1.md', text: '**Status:** ✅ done — #12 and #13\n' };
  const verified = new Map([
    ['pr:.#12', 'merged'],
    ['pr:.#13', 'unmerged'],
  ]);
  const r = evaluate({ ...closedEpic, sprints: [sprint], verified });
  assert.equal(r.items['sprints-merged'].state, 'fail');
  assert.match(r.items['sprints-merged'].detail, /UNMERGED/);
});

test('an epic whose sprint docs live in another repo reports them as external, not failed', () => {
  const readme =
    '---\nstatus: shipped\nslug: demo\nsprints_in: https://github.com/o/foundation/tree/main/Roadmap/x\n---\n';
  const r = evaluate({ ...closedEpic, readme, sprints: [], retro: null });
  assert.equal(r.items['sprints-ticked'].state, 'external');
  assert.equal(r.items['retro-written'].state, 'external');
  assert.equal(r.ok, true);
});

test('an exemption excuses a failure with its reason; an exemption on a PASSING item is stale and fails', () => {
  const exempt = [{ epic: 'demo', item: 'branch-deleted', reason: 'closed before the convention' }];
  const excused = evaluate({ ...closedEpic, branches: ['feat/demo'], exemptions: exempt });
  assert.equal(excused.items['branch-deleted'].state, 'exempt');
  assert.equal(excused.ok, true);
  const stale = evaluate({ ...closedEpic, exemptions: exempt });
  assert.equal(stale.items['branch-deleted'].state, 'fail');
  assert.match(stale.items['branch-deleted'].detail, /STALE exemption/);
  assert.equal(stale.ok, false);
});

test('citations: PRs, aliased repos, explicit owner/repo and commits — but never bare numbers', () => {
  const text =
    'merged (product-repo #106, plugin-repo #5 + #6), commit b13ae84, run 29305671818, o/r#9';
  const refs = citations(text, { aliases: { 'product-repo': 'o/product-management' } });
  const keys = refs.map(refKey);
  assert.ok(keys.includes('pr:o/product-management#106'));
  assert.ok(keys.includes('pr:.#6'));
  assert.ok(keys.includes('pr:o/r#9'));
  assert.ok(keys.includes('commit:b13ae84'));
  assert.ok(!keys.some((k) => k.includes('29305671818')), 'a CI run id is not a citation');
});

test('frontmatter strips inline comments and quotes', () => {
  assert.deepEqual(frontmatter('---\nstatus: shipped   # note\nslug: "x"\n---\n'), {
    status: 'shipped',
    slug: 'x',
  });
});
