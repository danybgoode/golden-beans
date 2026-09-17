import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citations, evaluate, frontmatter, ITEMS, parseTreeUrl, refKey } from './epic-dod.mjs';

const README_SHIPPED = '---\nstatus: shipped   # closed\nslug: demo\n---\n# Epic\n';
const README_OPEN = '---\nstatus: in-progress\nslug: demo\n---\n# Epic\n';
const SPRINT_DONE = { name: 'sprint-1.md', text: '# S1\n\n**Status:** ✅ shipped — o/r#12 merged\n' };
const SPRINT_OPEN = { name: 'sprint-2.md', text: '# S2\n\n**Status:** ⬜ not started\n' };
const RETRO_REAL = '# Retro\n\n_Closed: 2026-09-17_\n';
const RETRO_STUB = '# Retro\n\n_Closed: <date>_\n';
const merged = (...refs) => new Map(refs.map((r) => [r, 'merged']));

const closedEpic = {
  slug: 'demo',
  readme: README_SHIPPED,
  sprints: [SPRINT_DONE],
  retro: RETRO_REAL,
  verified: merged('pr:o/r#12'),
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
    verified: merged('pr:o/r#12'),
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
  const sprint = { name: 'sprint-1.md', text: '**Status:** ✅ done — o/r#12 and o/r#13\n' };
  const verified = new Map([
    ['pr:o/r#12', 'merged'],
    ['pr:o/r#13', 'unmerged'],
  ]);
  const r = evaluate({ ...closedEpic, sprints: [sprint], verified });
  assert.equal(r.items['sprints-merged'].state, 'fail');
  assert.match(r.items['sprints-merged'].detail, /UNMERGED/);
});

test('an epic whose sprint docs live in another repo reports them as external, not failed', () => {
  const readme =
    '---\nstatus: shipped\nslug: demo\nsprints_in: https://github.com/o/foundation/tree/main/Roadmap/x\n---\n';
  const r = evaluate({ ...closedEpic, readme, sprints: [], retro: null, externalVerified: true });
  assert.equal(r.items['sprints-ticked'].state, 'external');
  assert.equal(r.items['retro-written'].state, 'external');
  assert.equal(r.ok, true);
  // A typo'd or unreachable sprints_in must not turn the sprint items green.
  const missing = evaluate({ ...closedEpic, readme, sprints: [], retro: null, externalVerified: false });
  assert.equal(missing.items['sprints-ticked'].state, 'fail');
  assert.equal(missing.ok, false);
  const unknown = evaluate({ ...closedEpic, readme, sprints: [], retro: null, externalVerified: null });
  assert.equal(unknown.items['sprints-merged'].state, 'unavailable');
  assert.equal(unknown.ok, false);
  assert.deepEqual(parseTreeUrl('https://github.com/o/r/tree/main/Roadmap/09-x/slug'), {
    repo: 'o/r',
    ref: 'main',
    path: 'Roadmap/09-x/slug',
  });
  assert.equal(parseTreeUrl('see the other repo'), null);
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

test('an exemption never turns UNAVAILABLE into a pass', () => {
  const exempt = [{ epic: 'demo', item: 'branch-deleted', reason: 'closed before the convention' }];
  const r = evaluate({ ...closedEpic, branches: null, exemptions: exempt });
  assert.equal(r.items['branch-deleted'].state, 'unavailable');
  assert.equal(r.ok, false);
});

test('an explicit owner/repo#N is not ALSO read as a local #N', () => {
  const keys = citations('merged as o/r#12 only').map(refKey);
  assert.deepEqual(keys, ['pr:o/r#12']);
});

test('citations: PR links, owner/repo#N, known repo names and commits — never a guessed bare #N', () => {
  const aliases = { backend: 'o/backend', 'product-repo': 'o/product-management' };
  const text =
    'merged (product-repo #106, backend PR [#33]), https://github.com/o/front/pull/100, commit b13ae84, run 29305671818, o/r#9, AGENTS rule #3';
  const keys = citations(text, { aliases }).map(refKey);
  assert.ok(keys.includes('pr:o/product-management#106'));
  assert.ok(keys.includes('pr:o/backend#33'));
  assert.ok(keys.includes('pr:o/front#100'));
  assert.ok(keys.includes('pr:o/r#9'));
  assert.ok(keys.includes('commit:b13ae84'));
  assert.ok(!keys.some((k) => k.includes('29305671818')), 'a CI run id is not a citation');
  assert.ok(!keys.some((k) => k.endsWith('#3')), 'an unaliased bare #3 is ambiguous and must not be guessed');
  // With a declared single repo, a bare #N is that repo.
  assert.ok(citations('see #45', { bareRefsRepo: 'o/solo' }).map(refKey).includes('pr:o/solo#45'));
});

test('a sprint with only bare #N refs and no bareRefsRepo is UNAVAILABLE, not a fail and not a pass', () => {
  const sprint = { name: 'sprint-1.md', text: '**Status:** ✅ shipped — #12\n' };
  const r = evaluate({ ...closedEpic, sprints: [sprint], verified: new Map() });
  assert.equal(r.items['sprints-merged'].state, 'unavailable');
});

test('real status markers and close lines seen on shipped epics are accepted', () => {
  const green = { name: 'sprint-1.md', text: '**Status:** 🟩 shipped — o/r#12\n' };
  assert.equal(evaluate({ ...closedEpic, sprints: [green] }).items['sprints-ticked'].state, 'pass');
  const longClose = '# Retro\n\n_Closed: 2026-08-12 · S1–S5 shipped, verified live_\n';
  assert.equal(evaluate({ ...closedEpic, retro: longClose }).items['retro-written'].state, 'pass');
});

test('frontmatter strips inline comments and quotes', () => {
  assert.deepEqual(frontmatter('---\nstatus: shipped   # note\nslug: "x"\n---\n'), {
    status: 'shipped',
    slug: 'x',
  });
});
