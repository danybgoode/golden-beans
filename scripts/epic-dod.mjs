#!/usr/bin/env node
// epic-dod.mjs — the mechanical half of the epic Definition of Done, DERIVED instead of recited.
//
//   node scripts/epic-dod.mjs --check <macro>/<slug>     # e.g. 09-platform-infra/dobby-foundation
//
// The epic DoD used to be a nine-item checklist an agent ticked from memory at close — and "ticked from
// memory" is how a README said `shipped` while a sprint still said ⬜, or a feature branch outlived its
// merge by a month. Five of those items are facts about files, frontmatter and git, so they are checked
// here (ways-of-work-lean-pass S3.3, D13). The three that need judgement — is the poster honest, does the
// retro say what happened, is each smoke walkthrough followable — stay prose in WAYS-OF-WORKING.
//
// ── The five derived items ─────────────────────────────────────────────────────────────────────────
//   readme-shipped   README frontmatter `status: shipped`
//   sprints-ticked   every sprint-N.md's `**Status:**` line starts with ✅
//   sprints-merged   every sprint cites ≥1 PR/commit, ≥1 citation VERIFIES as merged, none verifies unmerged
//   retro-written    RETROSPECTIVE.md exists with a real `_Closed: YYYY-MM-DD_` (not the `<date>` stub)
//   branch-deleted   no `feat/<slug>` or `feat/<slug>-*` branch left on origin
//
// ── Three states, never two ────────────────────────────────────────────────────────────────────────
// Each item is `pass`, `fail` or `unavailable` (gh unauthenticated, a citation into a repo this checkout
// cannot see). Unavailable is NOT pass — the run exits non-zero and names what it could not check. A
// green run that verified nothing is worse than no script (AGENTS rule).
//
// An epic whose sprint docs live in another repo (frontmatter `sprints_in:`) reports the sprint items as
// `external` — true, checked where the docs are, and not a failure here.
//
// ── Exemptions, with the check-plugin-leaks discipline ─────────────────────────────────────────────
// `scripts/epic-dod.exemptions.json` lists {epic, item, reason} for epics closed before a convention
// existed. An exemption for an item that now PASSES is itself a failure: a stale exemption is a promise
// the ledger no longer needs to make, and it hides the next real regression.
//
// Zero deps — Node 18+. Pure core (`evaluate`) + an injected I/O shell.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
export const ITEMS = [
  'readme-shipped',
  'sprints-ticked',
  'sprints-merged',
  'retro-written',
  'branch-deleted',
];

/** Frontmatter keys → values (flat, comment-stripped). */
export function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(String(text));
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Every PR / commit citation in a sprint doc.
 *   `#123`                → this repo's PR 123
 *   `golden-beans #10`    → PR 10 in the aliased repo
 *   `owner/repo#12`       → explicit
 *   a 7–40 char hex word with at least one letter → a commit
 * Numbers without `#` (CI run ids, dates) are deliberately not citations.
 */
export function citations(text, { aliases = {} } = {}) {
  const t = String(text);
  const refs = [];
  const seen = new Set();
  const add = (r) => {
    const k = JSON.stringify(r);
    if (!seen.has(k)) {
      seen.add(k);
      refs.push(r);
    }
  };
  for (const m of t.matchAll(/\b([\w.-]+\/[\w.-]+)#(\d+)\b/g))
    add({ kind: 'pr', repo: m[1], number: Number(m[2]) });
  for (const m of t.matchAll(/(?:\b([a-z][\w-]*)\s+)?(?:PR\s*)?\[?#(\d{1,5})\b/gi)) {
    const alias = m[1] && aliases[m[1].toLowerCase()];
    add({ kind: 'pr', repo: alias || null, number: Number(m[2]) });
  }
  for (const m of t.matchAll(/(?<![\w/#-])([0-9a-f]{7,40})(?![\w-])/g)) {
    if (/[a-f]/.test(m[1])) add({ kind: 'commit', sha: m[1] });
  }
  return refs;
}

/**
 * THE DECISION. Pure. Facts in, one verdict per item out.
 * sprints: [{ name, text }] · verified: Map(refKey → 'merged' | 'unmerged' | 'unavailable')
 * branches: string[] of remote branch names, or null when the remote could not be read.
 */
export function evaluate({
  slug,
  readme,
  sprints,
  retro,
  verified,
  branches,
  aliases = {},
  exemptions = [],
}) {
  const fm = frontmatter(readme);
  const items = {};
  const external = Boolean(fm.sprints_in) && sprints.length === 0;

  items['readme-shipped'] =
    fm.status === 'shipped'
      ? { state: 'pass', detail: 'status: shipped' }
      : { state: 'fail', detail: `README frontmatter status is '${fm.status || '(missing)'}'` };

  if (external) {
    items['sprints-ticked'] = { state: 'external', detail: `sprint docs live in ${fm.sprints_in}` };
    items['sprints-merged'] = { state: 'external', detail: `sprint docs live in ${fm.sprints_in}` };
  } else if (!sprints.length) {
    items['sprints-ticked'] = { state: 'fail', detail: 'no sprint-N.md files' };
    items['sprints-merged'] = { state: 'fail', detail: 'no sprint-N.md files' };
  } else {
    const unticked = sprints.filter((s) => !/^\*\*Status:\*\*\s*✅/m.test(s.text)).map((s) => s.name);
    items['sprints-ticked'] = unticked.length
      ? { state: 'fail', detail: `not ✅: ${unticked.join(', ')}` }
      : { state: 'pass', detail: `${sprints.length} sprint(s) ✅` };

    const problems = [];
    let unavailable = false;
    for (const s of sprints) {
      const refs = citations(s.text, { aliases });
      if (!refs.length) {
        problems.push(`${s.name} cites no PR or commit`);
        continue;
      }
      const states = refs.map((r) => verified.get(refKey(r)) || 'unavailable');
      if (states.includes('unmerged')) problems.push(`${s.name} cites an UNMERGED PR`);
      else if (!states.includes('merged')) {
        unavailable = true;
        problems.push(`${s.name}: none of ${refs.length} citation(s) could be verified`);
      }
    }
    items['sprints-merged'] = !problems.length
      ? { state: 'pass', detail: 'every sprint cites a verified-merged change' }
      : {
          state: unavailable && problems.every((p) => /could be verified/.test(p)) ? 'unavailable' : 'fail',
          detail: problems.join('; '),
        };
  }

  items['retro-written'] =
    retro == null && Boolean(fm.sprints_in)
      ? { state: 'external', detail: `retrospective lives in ${fm.sprints_in}` }
      : retro == null
        ? { state: 'fail', detail: 'RETROSPECTIVE.md missing' }
        : /_Closed:\s*20\d\d-\d\d-\d\d_/.test(retro)
          ? { state: 'pass', detail: 'closed with a real date' }
          : { state: 'fail', detail: 'RETROSPECTIVE.md is still the stub (no `_Closed: YYYY-MM-DD_`)' };

  if (branches == null)
    items['branch-deleted'] = { state: 'unavailable', detail: 'could not list origin branches' };
  else {
    const left = branches.filter((b) => b === `feat/${slug}` || b.startsWith(`feat/${slug}-`));
    items['branch-deleted'] = left.length
      ? { state: 'fail', detail: `still on origin: ${left.join(', ')}` }
      : { state: 'pass', detail: 'no feature branch left' };
  }

  // Exemptions: an exempted failure passes with its reason; an exemption on a passing item is STALE.
  const epicExemptions = exemptions.filter((e) => e.epic === slug);
  for (const e of epicExemptions) {
    const it = items[e.item];
    if (!it) continue;
    if (it.state === 'pass' || it.state === 'external') {
      items[e.item] = {
        state: 'fail',
        detail: `STALE exemption — '${e.item}' passes now, so remove it from epic-dod.exemptions.json`,
      };
    } else {
      items[e.item] = { state: 'exempt', detail: `${it.detail} — exempt: ${e.reason}` };
    }
  }
  const ok = ITEMS.every((k) => ['pass', 'external', 'exempt'].includes(items[k].state));
  return { ok, items };
}

export function refKey(r) {
  return r.kind === 'commit' ? `commit:${r.sha}` : `pr:${r.repo || '.'}#${r.number}`;
}

// ── I/O shell ─────────────────────────────────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', cwd: REPO, ...opts });
}

function verify(refs, deps = {}) {
  const exec = deps.run ?? run;
  const out = new Map();
  for (const r of refs) {
    const key = refKey(r);
    if (out.has(key)) continue;
    if (r.kind === 'commit') {
      const known = exec('git', ['cat-file', '-e', `${r.sha}^{commit}`]);
      if (known.status !== 0) {
        out.set(key, 'unavailable');
        continue;
      }
      const anc = exec('git', ['merge-base', '--is-ancestor', r.sha, 'origin/main']);
      out.set(key, anc.status === 0 ? 'merged' : 'unmerged');
      continue;
    }
    const args = [
      'api',
      r.repo ? `repos/${r.repo}/pulls/${r.number}` : `repos/{owner}/{repo}/pulls/${r.number}`,
      '--jq',
      '[.merged_at, .state] | @tsv',
    ];
    const res = exec('gh', args);
    if (res.status !== 0) {
      out.set(key, 'unavailable');
      continue;
    }
    const [mergedAt, state] = String(res.stdout).trim().split('\t');
    out.set(
      key,
      mergedAt && mergedAt !== 'null'
        ? 'merged'
        : state === 'closed' || state === 'open'
          ? 'unmerged'
          : 'unavailable'
    );
  }
  return out;
}

function main() {
  const i = process.argv.indexOf('--check');
  const target = i >= 0 ? process.argv[i + 1] : null;
  if (!target || !/^[\w.-]+\/[\w.-]+$/.test(target)) {
    process.stderr.write('usage: node scripts/epic-dod.mjs --check <macro>/<slug>\n');
    process.exit(2);
  }
  const dir = join(REPO, 'Roadmap', target);
  if (!existsSync(join(dir, 'README.md'))) {
    process.stderr.write(`✗ no epic at Roadmap/${target}/README.md\n`);
    process.exit(2);
  }
  const slug = target.split('/')[1];
  const cfgPath = join(__dirname, 'epic-dod.exemptions.json');
  const cfg = existsSync(cfgPath)
    ? JSON.parse(readFileSync(cfgPath, 'utf8'))
    : { aliases: {}, exemptions: [] };
  const aliases = Object.fromEntries(Object.entries(cfg.aliases || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const sprints = readdirSync(dir)
    .filter((f) => /^sprint-\d+\.md$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map((f) => ({ name: f, text: readFileSync(join(dir, f), 'utf8') }));
  const retroPath = join(dir, 'RETROSPECTIVE.md');
  run('git', ['fetch', '-q', 'origin']);
  const refs = sprints.flatMap((s) => citations(s.text, { aliases }));
  const verified = verify(refs);
  const ls = run('git', ['ls-remote', '--heads', 'origin']);
  const branches =
    ls.status === 0
      ? ls.stdout
          .split('\n')
          .filter(Boolean)
          .map((l) => l.split('refs/heads/')[1])
      : null;
  const { ok, items } = evaluate({
    slug,
    readme: readFileSync(join(dir, 'README.md'), 'utf8'),
    sprints,
    retro: existsSync(retroPath) ? readFileSync(retroPath, 'utf8') : null,
    verified,
    branches,
    aliases,
    exemptions: cfg.exemptions || [],
  });
  const icon = { pass: '✓', fail: '✗', unavailable: '?', external: '↗', exempt: '~' };
  process.stdout.write(`epic-dod — ${target}\n`);
  for (const k of ITEMS)
    process.stdout.write(
      `  ${icon[items[k].state]} ${k.padEnd(15)} ${items[k].state.padEnd(11)} ${items[k].detail}\n`
    );
  process.stdout.write(
    ok
      ? '✓ the derivable half of the DoD holds. Still yours: poster honest, retro true + learnings promoted, smoke walkthroughs followable.\n'
      : '✗ not done — see above. `?` means UNCHECKED, not passed.\n'
  );
  process.exit(ok ? 0 : 1);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
