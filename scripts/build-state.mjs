#!/usr/bin/env node
// build-state.mjs — ONE resolver for "what is being built right now" (build-visualization-claude-mods S3).
//
//   node scripts/build-state.mjs              # the build view, as the five lines the CLI mod renders
//   node scripts/build-state.mjs --json       # everything, as JSON (the mod, standup, anything else)
//   node scripts/build-state.mjs --offline    # never call `gh` (git + files only) — what the mod uses (D4)
//   node scripts/build-state.mjs --repo-root <dir>   # default: this script's repo
//
// It reads EXISTING artefacts only — the epic/sprint frontmatter contract (lib/roadmap-contract.mjs), git,
// the session journal and, unless --offline, one `gh` call. It never writes anything and never becomes a
// second source of truth: every field it prints is either a frontmatter value or a fact git/gh reports.
//
// ── Which epic, which story, which status ────────────────────────────────────────────────────────────
// Epic   — the branch: `feat/<slug>`, `fix/…`, `chore/…`, optionally `-s<N>` / `-sprint-<N>` for a stacked
//          sprint. A branch that names no epic under Roadmap/ is "nothing in flight", said plainly. So are
//          the default branch and a detached HEAD. It never guesses the nearest epic.
// Story  — D2: the newest commit on the branch (base..HEAD) whose subject names `S<n>.<m>` / `Story n.m`,
//          else the newest session-journal entry naming one AND this epic's slug, else `unknown`. A named
//          story that no sprint of this epic lists is `unknown` too — a confident wrong story is the
//          failure this exists to prevent. The journal is read from the LOCAL refs (as last fetched): this runs every turn, and a
//          network fetch has no place there.
// Status — D7: the WRITTEN `phase:` of the sprint in flight (else the epic's). Evidence may only ADVANCE
//          it on the two rungs the cadence makes directly observable: story commits on the branch lift
//          anything below Building to Building (git), and an open PR lifts to In review (gh). Locking
//          architecture, Verifying and Shipped are never inferred. `phase_written` and `status_source` are
//          always in the JSON, so a disagreement is visible rather than smoothed over.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { PHASES, parseDocFrontmatter } from './lib/roadmap-contract.mjs';
import { parseJournal, JOURNAL_BRANCH, JOURNAL_PATH } from './lib/session-journal.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BRANCH_RE = /^(?:feat|fix|chore|spike|bug)\/(.+?)(?:-(?:s|sprint-?)(\d+))?$/;
const STORY_IN_TEXT_RE = /\b(?:S|Story\s+)(\d+)\.(\d+)\b/g;
const rank = (phase) => PHASES.indexOf(phase);

/** Every story id a piece of text names, in order ("S1.1–S1.4 …" → ['S1.1', 'S1.4']). */
export function storyIdsIn(text) {
  return [...String(text).matchAll(STORY_IN_TEXT_RE)].map((m) => `S${Number(m[1])}.${Number(m[2])}`);
}

/** `feat/foo-s3` → { slug: 'foo', sprint: 3 }; null for a branch that is not an epic branch. */
export function parseBranch(branch) {
  const m = String(branch || '').match(BRANCH_RE);
  return m ? { slug: m[1], sprint: m[2] ? Number(m[2]) : null } : null;
}

function makeGit(root) {
  return (args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function tryGit(git, args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function findEpic(root, slug) {
  const roadmap = join(root, 'Roadmap');
  if (!existsSync(roadmap)) return null;
  for (const macro of readdirSync(roadmap).sort()) {
    if (!/^\d{2}-/.test(macro)) continue;
    const dir = join(roadmap, macro, slug);
    if (existsSync(join(dir, 'README.md')) && statSync(dir).isDirectory()) return { macro, dir };
  }
  return null;
}

function readEpic(root, slug) {
  const found = findEpic(root, slug);
  if (!found) return null;
  const readme = parseDocFrontmatter(readFileSync(join(found.dir, 'README.md'), 'utf8'));
  const sprints = readdirSync(found.dir)
    .filter((f) => /^sprint-\d+\.md$/.test(f))
    .map((f) => ({ n: Number(f.match(/\d+/)[0]), file: f }))
    .sort((a, b) => a.n - b.n)
    .map(({ n, file }) => {
      const p = parseDocFrontmatter(readFileSync(join(found.dir, file), 'utf8'));
      return {
        n,
        file,
        title: p.data.title ?? null,
        phase: p.data.phase ?? null,
        stories: Array.isArray(p.data.stories) ? p.data.stories : [],
        contract: p.hasFrontmatter && !p.error,
      };
    });
  return {
    slug,
    path: `Roadmap/${found.macro}/${slug}/README.md`,
    title: readme.data.title ?? slug,
    area: readme.data.area ?? found.macro,
    risk: readme.data.risk ?? null,
    phase: readme.data.phase ?? null,
    lifecycle: readme.data.status ?? null,
    contract: readme.hasFrontmatter && !readme.error && 'phase' in readme.data,
    sprints,
  };
}

/** The default branch's tip to measure "this branch's commits" from, or null. */
function baseRef(git) {
  const head = tryGit(git, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD']);
  for (const ref of [head, 'origin/main', 'main', 'origin/master', 'master'].filter(Boolean)) {
    if (tryGit(git, ['rev-parse', '--verify', '-q', `${ref}^{commit}`])) return ref;
  }
  return null;
}

function readJournalLocal(git) {
  for (const ref of [JOURNAL_BRANCH, `origin/${JOURNAL_BRANCH}`]) {
    const text = tryGit(git, ['show', `${ref}:${JOURNAL_PATH}`]);
    if (text) return { entries: parseJournal(text), ref };
  }
  return { entries: [], ref: null };
}

function ghOpenPr(root, branch) {
  try {
    const out = execFileSync(
      'gh',
      ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url', '--limit', '1'],
      { cwd: root, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const [pr] = JSON.parse(out);
    return { ok: true, pr: pr || null };
  } catch {
    return { ok: false, pr: null };
  }
}

const notInFlight = (reason, extra = {}) => ({ in_flight: false, reason, ...extra });

/** Does `text` name `slug` as a whole slug — `aws` in "aws S1.1", but not inside "aws-s3 S1.1"? */
export function namesSlug(text, slug) {
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9-])${esc}($|[^A-Za-z0-9-])`).test(String(text));
}

/**
 * Resolve the build state. Every external read is injectable so the tests drive real fixture repos with
 * a fake `gh`: { root, offline, git, gh }. It NEVER throws — it runs once per turn inside a CLI hook, and
 * an exception there is a blank view: any failure is reported as "not in flight", with the reason.
 */
export function resolveBuildState(opts = {}) {
  try {
    return resolve_(opts);
  } catch (err) {
    return notInFlight(
      `the resolver could not read this checkout (${err && err.message ? err.message : err})`
    );
  }
}

function resolve_({ root, offline = false, git = makeGit(root), gh = ghOpenPr } = {}) {
  if (tryGit(git, ['rev-parse', '--is-inside-work-tree']) !== 'true')
    return notInFlight('not inside a git checkout (or git is not installed)');
  const branch = tryGit(git, ['symbolic-ref', '-q', '--short', 'HEAD']);
  if (!branch) return notInFlight('detached HEAD — no branch, so no epic in flight');
  let parsed = parseBranch(branch);
  if (!parsed)
    return notInFlight(`on ${branch} — not an epic branch (feat/<slug>…), so no epic in flight`, { branch });
  // An EXACT epic slug wins over reading `-s<N>` as a sprint suffix: with both `aws` and `aws-s3` on the
  // board, `feat/aws-s3` is the `aws-s3` epic, never sprint 3 of `aws` (codex, on a consumer copy-in).
  let epic = null;
  if (parsed.sprint !== null) {
    const whole = branch.slice(branch.indexOf('/') + 1);
    epic = readEpic(root, whole);
    if (epic) parsed = { slug: whole, sprint: null };
  }
  if (!epic) epic = readEpic(root, parsed.slug);
  if (!epic)
    return notInFlight(`${branch} names no epic under Roadmap/ (looked for */${parsed.slug}/README.md)`, {
      branch,
    });
  if (!epic.contract)
    return notInFlight(`${epic.path} predates the frontmatter contract — run scripts/roadmap-backfill.mjs`, {
      branch,
    });

  // All stories of the epic, in build order — the ordinal is "Story X of Y".
  const allStories = epic.sprints.flatMap((s) => s.stories.map((st) => ({ ...st, sprint: s.n })));
  const byId = new Map(allStories.map((st, i) => [st.id, { ...st, ordinal: i + 1 }]));
  // A story counts only if THIS epic lists it — and, on a stacked sprint branch (`-s4`), only if it is that
  // sprint's: base..HEAD on a stacked branch still carries the previous sprint's commits, and reporting
  // them would be a confident wrong answer (found by the fresh reviewer on #27).
  const accepts = (id) => byId.has(id) && (parsed.sprint === null || byId.get(id).sprint === parsed.sprint);
  const scope = parsed.sprint === null ? 'this epic' : `sprint ${parsed.sprint} of this epic`;

  // D2 — commits first, then the journal, then unknown.
  const base = baseRef(git);
  const range = base ? `${base}..HEAD` : null;
  const subjects = range
    ? (tryGit(git, ['log', '--format=%s', range]) || '').split('\n').filter(Boolean)
    : [];
  const storyCommits = subjects.filter((s) => storyIdsIn(s).some(accepts)).length;
  const foreign = [...new Set(subjects.flatMap(storyIdsIn).filter((id) => !accepts(id)))];
  let story = null;
  let storySource = 'unknown';
  for (const subject of subjects) {
    const ids = storyIdsIn(subject).filter(accepts);
    if (ids.length) {
      story = byId.get(ids.at(-1));
      storySource = 'commit';
      break;
    }
  }
  // The journal: only an entry that NAMES this epic's slug. Every epic has an S1.1, and the journal is
  // shared by every session in the repo — parallel epics write to it at the same time — so neither an id
  // nor a timestamp says which epic an entry meant (codex, on both consumer copy-ins).
  // Journal a story as: node scripts/session-note.mjs --kind doing "<epic-slug> S2.1 — …"
  let journalRef = null;
  if (!story) {
    const journal = readJournalLocal(git);
    journalRef = journal.ref;
    for (const entry of [...journal.entries].reverse()) {
      const text = [entry.text, ...(entry.refs || [])].join(' ');
      const ids = namesSlug(text, epic.slug) ? storyIdsIn(text).filter(accepts) : [];
      if (ids.length) {
        story = byId.get(ids.at(-1));
        storySource = 'journal';
        break;
      }
    }
  }
  const storyNote = story
    ? null
    : foreign.length
      ? `commits here name ${foreign.join(', ')} — none of them ${scope}'s; no journal entry names one either`
      : `no commit on this branch names a story of ${scope}, and the session journal names none either`;

  // The sprint: the story's, else the branch's -s<N>, else none — never "the first unshipped one".
  const sprintN = story ? story.sprint : parsed.sprint;
  const sprint = epic.sprints.find((s) => s.n === sprintN) || null;

  // D7 — the written phase, advanced only by direct evidence.
  const phaseWritten = (sprint && sprint.phase) || epic.phase;
  let status = phaseWritten;
  let statusSource = 'written';
  if (storyCommits > 0 && rank(status) < rank('Building')) {
    status = 'Building';
    statusSource = 'git';
  }
  let pr = null;
  let ghChecked = false;
  if (!offline) {
    const res = gh(root, branch);
    ghChecked = res.ok;
    pr = res.pr;
    if (pr && rank(status) < rank('In review')) {
      status = 'In review';
      statusSource = 'gh';
    }
  }

  return {
    in_flight: true,
    branch,
    epic: {
      slug: epic.slug,
      title: epic.title,
      area: epic.area,
      risk: epic.risk,
      phase: epic.phase,
      path: epic.path,
    },
    sprint: sprint ? { n: sprint.n, title: sprint.title, phase: sprint.phase } : null,
    story: story
      ? {
          id: story.id,
          title: story.title,
          as_a: story.as_a,
          i_want: story.i_want,
          so_that: story.so_that,
          status: story.status,
        }
      : null,
    story_source: storySource,
    story_note: storyNote,
    progress: {
      story: story ? story.ordinal : null,
      stories: allStories.length,
      sprint: sprint ? epic.sprints.indexOf(sprint) + 1 : null,
      sprints: epic.sprints.length,
    },
    status,
    status_source: statusSource,
    phase_written: phaseWritten,
    evidence: {
      base,
      story_commits: storyCommits,
      pr,
      gh: offline ? 'skipped (--offline)' : ghChecked ? 'ok' : 'unavailable',
      journal: journalRef,
    },
  };
}

/**
 * The build view as the CLI shows it — a pure function of resolveBuildState's output (Sprint 4's mod
 * renders exactly these lines and nothing else: D3). Five lines under the heading, no box.
 */
export function renderLines(state) {
  if (!state.in_flight) return [`No epic in flight — ${state.reason}`];
  const { epic, story, progress } = state;
  const pad = (label) => `  ${label.padEnd(9)}`;
  const cont = ' '.repeat(11);
  const risk = epic.risk ? ` · risk ${epic.risk.toUpperCase()}` : '';
  const lines = ['Currently building', `${pad('Epic')}${epic.title}    ${epic.area}${risk}`];
  if (story) {
    lines.push(`${pad('Story')}${story.id}${story.title ? ` — ${story.title}` : ''}`);
    lines.push(
      story.as_a && story.i_want && story.so_that
        ? `${cont}As ${story.as_a}, I want ${story.i_want}, so that ${story.so_that}.`
        : `${cont}(the docs carry no user story for ${story.id})`
    );
  } else {
    lines.push(`${pad('Story')}unknown`);
    lines.push(`${cont}${state.story_note}`);
  }
  const storyPart = `Story ${progress.story ?? '?'} of ${progress.stories}`;
  const sprintPart = `Sprint ${progress.sprint ?? '?'} of ${progress.sprints}`;
  lines.push(`${pad('Progress')}${storyPart} · ${sprintPart}`);
  lines.push(`${pad('Status')}${state.status}`);
  return lines;
}

// realpath on both sides: a plugin or checkout reached through a symlink (macOS /tmp → /private/tmp) would
// otherwise never equal the module URL, and the CLI would print nothing and exit 0 — a blank build view.
const isMain = (() => {
  try {
    return (
      !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
})();
if (isMain) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--repo-root');
  if (i !== -1 && (!argv[i + 1] || argv[i + 1].startsWith('--'))) {
    process.stderr.write('build-state: --repo-root needs a directory\n');
    process.exit(2);
  }
  const root = resolve(i === -1 ? join(__dirname, '..') : argv[i + 1]);
  const state = resolveBuildState({ root, offline: argv.includes('--offline') });
  if (argv.includes('--json'))
    process.stdout.write(`${JSON.stringify({ ...state, lines: renderLines(state) }, null, 2)}\n`);
  else process.stdout.write(`${renderLines(state).join('\n')}\n`);
}
