import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  citations,
  effectiveBareRefsRepo,
  evaluate,
  frontmatter,
  isRealClosedDate,
  ITEMS,
  parseTreeUrl,
  refKey,
} from './epic-dod.mjs';

const README_SHIPPED = '---\nstatus: shipped   # closed\nslug: demo\n---\n# Epic\n';
const README_OPEN = '---\nstatus: in-progress\nslug: demo\n---\n# Epic\n';
const SPRINT_DONE = {
  name: 'sprint-1.md',
  text: '# S1\n\n**Status:** ✅ shipped — o/r#12 merged\n',
};
const SPRINT_OPEN = {
  name: 'sprint-2.md',
  text: '# S2\n\n**Status:** ⬜ not started\n',
};
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
  const sprint = {
    name: 'sprint-1.md',
    text: '**Status:** ✅ done — o/r#12 and o/r#13\n',
  };
  const verified = new Map([
    ['pr:o/r#12', 'merged'],
    ['pr:o/r#13', 'unmerged'],
  ]);
  const r = evaluate({ ...closedEpic, sprints: [sprint], verified });
  assert.equal(r.items['sprints-merged'].state, 'fail');
  assert.match(r.items['sprints-merged'].detail, /UNMERGED/);
});

test('a merged citation does not vouch for an UNVERIFIABLE one alongside it', () => {
  // Found by codex on #17: `states.includes('merged')` passed a sprint whose other citation was a commit
  // this checkout has never seen — "I could not check" silently read as "checked".
  const sprint = {
    name: 'sprint-1.md',
    text: '**Status:** ✅ done — o/r#12 and deadbeef1\n',
  };
  const verified = new Map([['pr:o/r#12', 'merged']]);
  const r = evaluate({ ...closedEpic, sprints: [sprint], verified });
  assert.equal(r.items['sprints-merged'].state, 'unavailable');
  assert.match(r.items['sprints-merged'].detail, /1 of 2 citation\(s\) could be verified by nobody/);
  assert.equal(r.ok, false);
});

test('sprint docs in ANOTHER repo are READ and checked by the same rules — existence is not a pass', () => {
  const readme =
    '---\nstatus: shipped\nslug: demo\nsprints_in: https://github.com/o/foundation/tree/main/Roadmap/x\n---\n';
  const docs = {
    sprints: [{ name: 'sprint-1.md', text: '**Status:** ✅ done — o/r#12\n' }],
    retro: '_Closed: 2026-09-16_\n',
  };
  const verified = new Map([['pr:o/r#12', 'merged']]);
  const ok = evaluate({
    ...closedEpic,
    readme,
    sprints: [],
    retro: null,
    verified,
    externalDocs: docs,
  });
  assert.equal(ok.items['sprints-ticked'].state, 'pass');
  assert.equal(ok.items['sprints-merged'].state, 'pass');
  assert.equal(ok.items['retro-written'].state, 'pass');
  assert.match(ok.items['sprints-ticked'].detail, /read from https:/);
  assert.equal(ok.ok, true);

  // The hole codex found on #17: a directory that exists but holds no sprint docs used to pass.
  const empty = evaluate({
    ...closedEpic,
    readme,
    sprints: [],
    retro: null,
    externalDocs: { sprints: [], retro: null },
  });
  assert.equal(empty.items['sprints-ticked'].state, 'fail');
  assert.equal(empty.items['retro-written'].state, 'fail');
  assert.equal(empty.ok, false);

  // The docs are there but unticked / the retro is a stub: the same rules, so the same verdict.
  const unticked = evaluate({
    ...closedEpic,
    readme,
    sprints: [],
    retro: null,
    verified,
    externalDocs: {
      sprints: [{ name: 'sprint-1.md', text: '**Status:** ⬜ — o/r#12\n' }],
      retro: null,
    },
  });
  assert.equal(unticked.items['sprints-ticked'].state, 'fail');

  // A typo'd sprints_in (404) fails; an unreadable one is UNAVAILABLE, never green.
  const missing = evaluate({
    ...closedEpic,
    readme,
    sprints: [],
    retro: null,
    externalDocs: false,
  });
  assert.equal(missing.items['sprints-ticked'].state, 'fail');
  assert.equal(missing.ok, false);
  const unknown = evaluate({
    ...closedEpic,
    readme,
    sprints: [],
    retro: null,
    externalDocs: null,
  });
  assert.equal(unknown.items['sprints-merged'].state, 'unavailable');
  assert.equal(unknown.items['retro-written'].state, 'unavailable');
  assert.equal(unknown.ok, false);
  assert.deepEqual(parseTreeUrl('https://github.com/o/r/tree/main/Roadmap/09-x/slug'), {
    repo: 'o/r',
    ref: 'main',
    path: 'Roadmap/09-x/slug',
  });
  assert.equal(parseTreeUrl('see the other repo'), null);
});

test('an exemption excuses a failure with its reason; an exemption on a PASSING item is stale and fails', () => {
  const exempt = [
    {
      epic: 'demo',
      item: 'branch-deleted',
      reason: 'closed before the convention',
    },
  ];
  const excused = evaluate({
    ...closedEpic,
    branches: ['feat/demo'],
    exemptions: exempt,
  });
  assert.equal(excused.items['branch-deleted'].state, 'exempt');
  assert.equal(excused.ok, true);
  const stale = evaluate({ ...closedEpic, exemptions: exempt });
  assert.equal(stale.items['branch-deleted'].state, 'fail');
  assert.match(stale.items['branch-deleted'].detail, /STALE exemption/);
  assert.equal(stale.ok, false);
});

test('an exemption never turns UNAVAILABLE into a pass', () => {
  const exempt = [
    {
      epic: 'demo',
      item: 'branch-deleted',
      reason: 'closed before the convention',
    },
  ];
  const r = evaluate({ ...closedEpic, branches: null, exemptions: exempt });
  assert.equal(r.items['branch-deleted'].state, 'unavailable');
  assert.equal(r.ok, false);
});

test('an explicit owner/repo#N is not ALSO read as a local #N', () => {
  const keys = citations('merged as o/r#12 only').map(refKey);
  assert.deepEqual(keys, ['pr:o/r#12']);
});

test('citations: PR links, owner/repo#N, known repo names and commits — never a guessed bare #N', () => {
  const aliases = {
    backend: 'o/backend',
    'product-repo': 'o/product-management',
  };
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
  const sprint = {
    name: 'sprint-1.md',
    text: '**Status:** ✅ shipped — #12\n',
  };
  const r = evaluate({ ...closedEpic, sprints: [sprint], verified: new Map() });
  assert.equal(r.items['sprints-merged'].state, 'unavailable');
});

test('real status markers and close lines seen on shipped epics are accepted', () => {
  const green = {
    name: 'sprint-1.md',
    text: '**Status:** 🟩 shipped — o/r#12\n',
  };
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

test('bareRefsRepo is honoured ONLY in a single-repo project — a sibling alias makes #N ambiguous again', () => {
  // Found by codex on #17: resolving a bare `#143` against this repo when the epic also cites a sibling
  // repo's #143 certifies the WRONG PR — a false green, not a miss.
  assert.deepEqual(effectiveBareRefsRepo({ bareRefsRepo: 'o/r', aliases: { r: 'o/r' } }), {
    repo: 'o/r',
    note: 'bare #N means o/r',
  });
  const multi = effectiveBareRefsRepo({ bareRefsRepo: 'o/r', aliases: { r: 'o/r', sib: 'o/sibling' } });
  assert.equal(multi.repo, null);
  assert.match(multi.note, /IGNORED.*o\/sibling/);
  assert.equal(effectiveBareRefsRepo({}).repo, null);
});

test('an epic with BOTH sprints_in and local sprint files fails — one epic, one source', () => {
  const readme =
    '---\nstatus: shipped\nslug: demo\nsprints_in: https://github.com/o/f/tree/main/Roadmap/x\n---\n';
  const r = evaluate({
    ...closedEpic,
    readme,
    externalDocs: { sprints: [{ name: 'sprint-1.md', text: '**Status:** ✅ o/r#1\n' }], retro: null },
  });
  assert.equal(r.items['sprints-ticked'].state, 'fail');
  assert.match(r.items['sprints-merged'].detail, /one epic, one source/);
  assert.equal(r.ok, false);
});

test('a retrospective date must EXIST, not merely match the shape', () => {
  assert.equal(isRealClosedDate('_Closed: 2026-09-16_'), true);
  assert.equal(isRealClosedDate('_Closed: 2026-99-99_'), false);
  assert.equal(isRealClosedDate('_Closed: 2026-02-30_'), false);
  assert.equal(isRealClosedDate('_Closed: <date>_'), false);
  const r = evaluate({ ...closedEpic, retro: '_Closed: 2026-13-01_\n' });
  assert.equal(r.items['retro-written'].state, 'fail');
});
