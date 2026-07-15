#!/usr/bin/env node
// roadmap-to-notion.mjs — project the Roadmap docs into the Notion "Marketplace Roadmap" board.
// ONE-WAY, docs → Notion. Docs are the only source of truth; the board is a rebuilt projection.
//
// Modes:
//   --extract           print the projected rows as JSON (no Notion needed; the testable core)
//   --sync              upsert rows into Notion (needs env NOTION_TOKEN + NOTION_DB_ID)
//
// Grain (full funnel, 3 grains):
//   • Epic   — one row per epic folder under Roadmap/<NN-macro>/<slug>/ (has a README.md)
//   • Sprint — one row per sprint-N.md inside an epic, linked to its Epic via the "Epic" relation
//   • Seed   — one row per seed in 00-ideas/seeds/ whose frontmatter epic == null (un-scaffolded funnel)
//
// Status derivation (docs win, re-derived every run):
//   EPIC: the AUTHORITATIVE source is the epic README's frontmatter `status:` field
//     (shipped|in-progress|scaffolded|queued|archived), set at epic close. Sprint/retro derivation is
//     kept ONLY as a fallback when the frontmatter field is ABSENT, and is also emitted as `status_derived`
//     so the board can flag an advisory drift (frontmatter vs derived) when a close-out forgets to set it.
//     A PRESENT but unrecognized value HARD-FAILS the run — it used to silently fall back to the derived
//     status, which made status === status_derived by construction, so the drift check structurally could
//     not fire on invalid enum values (how `mercadolibre-sync` sat at `status: ready` while fully live;
//     Roadmap/00-ideas/audits/roadmap-grooming-audit-2026-07-06.md §1). Seed `status:` is enforced the
//     same way against its own enum.
//   SPRINT: read its `Status:` line (controlled vocab below) → else count story ticks.
//     Planned (none started) · In progress (some stories ✅) · In review (all ✅, not yet closed out /
//     "built — awaiting review/draft PR") · Shipped (✅ merged/shipped, or all ✅ + smoke walkthrough written).
//   EPIC fallback: rolled up from its sprints — all Shipped ⇒ Shipped · any active ⇒ In progress · all Planned ⇒ Scaffolded.
//   SEED: its frontmatter status (raw|ready|queued|archived). A seed with `epic:` set is funnel-only —
//     its status is NOT read for epic status (the epic README frontmatter owns that).
//
// NOTE on the sprint `**Status:**` line: the "Wrap S<n>" step (SESSION-KICKOFFS §7) should set it to one of
//   ⬜ Planned · 🏗 In progress · 🟦 In review · ✅ Shipped — that keeps this projection trivially reliable.
//   Legacy freeform lines are still mapped best-effort below.

import { readFileSync, readdirSync, existsSync, statSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const ROADMAP = join(REPO, 'Roadmap');
const SEEDS = join(ROADMAP, '00-ideas', 'seeds');

// Area labels are DERIVED from this repo's own Roadmap macro-section folders
// (`Roadmap/NN-slug/` → "NN Slug Title-Cased") — never hardcoded. The previous hardcoded map was
// the origin project's (Miyagi) area list, which mislabeled every golden-beans line on the board
// ("02 Checkout & Payments" for 02 Commercial); fixed 2026-07-15 (E3 groom session bookkeeping).
// A number with no folder yet (e.g. a seed in a future macro-section) falls back to the raw number.
const AREA_NAMES = Object.fromEntries(
  readdirSync(ROADMAP)
    .filter((d) => /^\d{2}-/.test(d) && statSync(join(ROADMAP, d)).isDirectory())
    .map((d) => {
      const [, num, slug] = d.match(/^(\d{2})-(.+)$/);
      const label = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return [num, `${num} ${label}`];
    })
);
const SEED_STATUS_LABEL = {
  raw: 'Raw', ready: 'Ready', queued: 'Queued', scaffolded: 'Scaffolded',
  'in-progress': 'In progress', shipped: 'Shipped', archived: 'Archived',
};
const PRIORITY_LABEL = {
  'wave-0': 'Wave 0 Enablers', 'wave-1': 'Wave 1', 'wave-2': 'Wave 2',
  'wave-3': 'Wave 3', 'wave-4': 'Wave 4',
};
const TYPE_LABEL = { feature: 'Feature', spike: 'Spike', chore: 'Chore', epic: 'Epic' };

function parseFrontmatter(md) {
  if (!md.startsWith('---')) return {};
  const end = md.indexOf('\n---', 3);
  if (end === -1) return {};
  const block = md.slice(3, end).trim();
  const fm = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v[0] === '"' || v[0] === "'") {
      const q = v[0]; const e = v.indexOf(q, 1);
      v = e > 0 ? v.slice(1, e) : v.slice(1);             // quoted: take inside quotes (keeps '#5')
    } else {
      const h = v.search(/\s#/); if (h >= 0) v = v.slice(0, h); // strip inline ` # comment`
      v = v.trim();
      if (v === 'null' || v === '') v = null;
    }
    fm[m[1]] = v;
  }
  return fm;
}

function readSeeds() {
  if (!existsSync(SEEDS)) return [];
  return readdirSync(SEEDS).filter((f) => f.endsWith('.md')).map((f) => {
    const fm = parseFrontmatter(readFileSync(join(SEEDS, f), 'utf8'));
    seedStatusLabel(fm.status, `Roadmap/00-ideas/seeds/${f}`); // hard-fail on an invalid enum value
    return { ...fm, _file: `Roadmap/00-ideas/seeds/${f}` };
  });
}

// Seed frontmatter `status:` → board label. Absent → 'Raw' (legacy tolerance); a PRESENT but
// unrecognized value THROWS — a typo'd status would otherwise silently land the seed in the wrong
// funnel bucket (e.g. `status: seed` read as Raw). Validated for EVERY seed, funnel-only ones
// included, so the documented enum holds repo-wide.
export function seedStatusLabel(status, file = 'seed') {
  if (status == null) return 'Raw';
  const label = SEED_STATUS_LABEL[status];
  if (!label) {
    throw new Error(`${file}: unrecognized seed frontmatter status "${status}" — valid values: ${Object.keys(SEED_STATUS_LABEL).join(' | ')}`);
  }
  return label;
}

function listEpicDirs() {
  const out = [];
  for (const macro of readdirSync(ROADMAP)) {
    if (!/^[0-9]{2}-/.test(macro)) continue; // macro-section folders only
    const macroPath = join(ROADMAP, macro);
    if (!statSync(macroPath).isDirectory()) continue;
    for (const slug of readdirSync(macroPath)) {
      const epicPath = join(macroPath, slug);
      if (!statSync(epicPath).isDirectory()) continue;
      if (!existsSync(join(epicPath, 'README.md'))) continue;
      out.push({ macro, slug, path: epicPath, area: macro.slice(0, 2) });
    }
  }
  return out;
}

function epicTitle(epicPath, slug) {
  try {
    const first = readFileSync(join(epicPath, 'README.md'), 'utf8').split('\n').find((l) => l.startsWith('# '));
    if (first) return first.replace(/^#\s+(Epic\s*[—·:\-]\s*)?/i, '').trim();
  } catch {}
  return slug;
}

// --- story counting: tolerant of the real heading drift. Stories appear at BOTH `## US-1` (level-2,
// e.g. support-widget) and `### S1.1` (level-3), as `Story 1.1` / `S1` / `US-1`, and the #3c B/C/D
// epics label them by epic-letter (`## C.1`, `### B1.1`, `## D.2`). Matching only `### S/US/Story`
// silently undercounted ~22 epics to "0 stories" (status then leaned on the retro-floor by luck). The
// letter form requires a `.digit` (`[A-Z]\d*\.\d+`) so it can't false-fire on `## QA` / `## Stories`. ---
const STORY_RE = /^#{2,3}\s+(?:Story\s+\d+|S\d+(?:\.\d+)?(?:\s*\([^)]*\))?|US-\d+|[A-Z]\d*\.\d+)\b/i;
function countStories(body) {
  let total = 0, done = 0;
  for (const line of body.split('\n')) {
    if (STORY_RE.test(line)) { total++; if (line.includes('✅')) done++; }
  }
  return { total, done };
}

// --- sprint status: the `Status:` line first, then story ticks. Accept both `**Status:**` (bold) and a
// plain `Status:` line — real sprint files use both (e.g. support-widget writes `Status: ✅ shipped`). ---
function deriveSprintStatus(body) {
  const hasSmoke = /Smoke walkthrough \(do these|—\s*Smoke walkthrough/i.test(body);
  const m = body.match(/^(?:\*\*)?Status:(?:\*\*)?\s*(.+)$/mi);
  const line = (m ? m[1] : '').trim();
  const s = line.toLowerCase();
  if (line) {
    if (/⬜|not started|^planned\b/.test(s)) return 'Planned';
    if (/🟦|in review|awaiting\s*(pr|review)|draft\s*\[?pr|built\s*—.*(awaiting|review|draft)/.test(s)) return 'In review';
    if (/✅/.test(line) && /(shipped|merged|live|in prod|to\s*`?main`?|on\s*`?main`?)/.test(s)) return 'Shipped';
    if (/✅\s*built|built\s*\(/.test(s)) return 'In review';           // "built" with no merge word ⇒ not yet shipped
    if (/🏗|in progress|wip|building\b/.test(s)) return 'In progress';
    if (/✅/.test(line)) return 'Shipped';
  }
  const { total, done } = countStories(body);
  if (total > 0) {
    if (done === total) return hasSmoke ? 'Shipped' : 'In review';
    if (done > 0) return 'In progress';
    return 'Planned';
  }
  return 'Planned';
}

function sprintTitleFrom(body, n) {
  const first = body.split('\n').find((l) => l.startsWith('# ')) || '';
  const m = first.match(/Sprint\s+\d+\s*[:—\-]\s*(.+)$/i);
  return m ? m[1].trim() : `Sprint ${n}`;
}

function epicSprints(epicPath) {
  return readdirSync(epicPath)
    .filter((f) => /^sprint-(\d+)\.md$/.test(f))
    .map((f) => Number(f.match(/^sprint-(\d+)\.md$/)[1]))
    .sort((a, b) => a - b)
    .map((n) => {
      const body = readFileSync(join(epicPath, `sprint-${n}.md`), 'utf8');
      const { total, done } = countStories(body);
      return { n, title: sprintTitleFrom(body, n), status: deriveSprintStatus(body), total, done };
    });
}

// A written, DATED retrospective is the strongest "this epic closed" signal. The scaffold template only
// carries a literal `<date>` placeholder, so requiring a real ISO date avoids false-firing on stubs.
function epicShippedByRetro(epicPath) {
  const f = join(epicPath, 'RETROSPECTIVE.md');
  if (!existsSync(f)) return false;
  const t = readFileSync(f, 'utf8');
  // A retrospective is written at epic CLOSE (the epic DoD) and carries a real date; the scaffold STUB
  // only has a literal `_Closed: <date>_` placeholder (no real date). So a real ISO date anywhere in the
  // retro ⇒ the epic was closed/shipped. This avoids false-firing on un-built scaffolds.
  // NOTE: do NOT anchor with \b on either side. The scaffold renders the close date markdown-italicised
  // as `_Closed: 2026-06-09_`, and `_` is a word character, so a trailing \b fails immediately after the
  // date and a real underscore-wrapped close-date would be missed (this regressed agent-readable-about-
  // surface Shipped→In progress). A bare date pattern matches it; the literal `<date>` stub has no digits.
  return /20\d\d-\d\d-\d\d/.test(t);
}

// `epicFmStatus` is the raw README frontmatter `status:` (or undefined). Archival is a frontmatter-only
// decision — it cannot be derived from sprints/retro — so when the epic declares `archived`, the
// derivation must also say Archived; otherwise an archived epic with open-looking sprints false-flags
// drift (status=Archived vs status_derived=In progress) on EVERY board regeneration, forever.
export function deriveEpicStatus(sprints, retroShipped, epicFmStatus) {
  if (epicFmStatus === 'archived') return 'Archived';
  if (retroShipped) return 'Shipped';
  if (sprints.length && sprints.every((s) => s.status === 'Shipped')) return 'Shipped';
  if (sprints.some((s) => s.status === 'Shipped' || s.status === 'In progress' || s.status === 'In review')) return 'In progress';
  return 'Scaffolded'; // scaffolded-only / all Planned
}

// AUTHORITATIVE epic status: the README frontmatter `status:` field (set at epic close). Returns the
// board bucket, or null when the README has NO frontmatter status (→ caller falls back to derivation).
// A PRESENT but unrecognized value THROWS: it used to return null and silently fall back to the derived
// status, which made `status === status_derived` by construction — so the advisory drift check could
// never fire on exactly the class of error it exists to catch (an epic mislabeled with an out-of-enum
// value, e.g. `mercadolibre-sync` at `status: ready` while fully shipped; audit 2026-07-06 §1).
const EPIC_FM_TO_BUCKET = { shipped: 'Shipped', 'in-progress': 'In progress', scaffolded: 'Scaffolded', queued: 'Scaffolded', archived: 'Archived' };
function epicFrontmatter(epicPath) {
  return parseFrontmatter(readFileSync(join(epicPath, 'README.md'), 'utf8'));
}
export function frontmatterStatusBucket(fm, doc = 'epic README') {
  if (!fm.status) return null;
  const bucket = EPIC_FM_TO_BUCKET[fm.status];
  if (!bucket) {
    throw new Error(`${doc}: unrecognized epic frontmatter status "${fm.status}" — valid values: ${Object.keys(EPIC_FM_TO_BUCKET).join(' | ')}`);
  }
  return bucket;
}

// Coerce a `build_order` frontmatter value: numeric → Number (so the Notion views sort right), a legacy
// non-numeric seed value (e.g. "#3c") passes through unchanged, empty/absent → null.
export function normalizeBuildOrder(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '') return null;
  return /^-?\d+$/.test(s) ? Number(s) : v;
}

// Numeric sort key for build order: "#3" → 3, "#3c" → 3, 4 → 4, absent → null. The display value
// ("Build order ID") stays as-is; this feeds a Notion NUMBER property so the "Build order" view
// sorts 2 before 10 (rich_text sorted "#10" before "#2", which is why the board couldn't sort by it).
export function buildOrderNum(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).match(/\d+/);
  return m ? Number(m[0]) : null;
}

// --- Status date: when a row ENTERED its current status (added 2026-07-15, board-sort polish). -----
// One DATE property means ONE board sort ("Status date" descending) does the right thing per column:
// Shipped sorts by ship date, In progress by latest-started, Scaffolded by scaffold/re-groom date;
// Planned/Raw/Ready rows simply keep their last real change date (they "never update" by definition).
// Derivation: the last commit whose diff touched the status-BEARING line (`status:` frontmatter for
// epics/seeds via -G; the `Status:` line for sprints) — i.e. the moment the status last changed —
// falling back to the file's last commit (fresh docs / status-line-less files), then to today
// (a brand-new uncommitted scaffold entered its status "now"). Docs + git stay the only SSOT.
function gitDate(args) {
  try { return execFileSync('git', ['log', '-1', '--format=%as', ...args], { cwd: REPO, encoding: 'utf8' }).trim(); } catch { return ''; }
}
function statusDate(relFile, statusLineRegex) {
  return (
    (statusLineRegex && gitDate([`-G${statusLineRegex}`, '--', relFile])) ||
    gitDate(['--', relFile]) ||
    new Date().toISOString().slice(0, 10)
  );
}

// Floor a sprint's derived status against its epic's AUTHORITATIVE status, so the Sprints board never
// shows an archived epic full of "Planned" sprints (S1.1) nor a Shipped epic with stale "Planned" ones.
// Real in-flight signals (In progress / In review) are preserved on non-archived epics.
export function floorSprintStatus(epicStatus, sprintStatus) {
  // A TERMINAL epic forces ALL its sprints to that terminal state — a shipped/archived epic cannot have
  // an "In progress"/"In review"/"Planned" sprint (those leaked onto the board as stale in-flight rows
  // when this only floored Planned). Only a non-terminal epic keeps the real per-sprint signal.
  if (epicStatus === 'Archived') return 'Archived';
  if (epicStatus === 'Shipped') return 'Shipped';
  return sprintStatus;
}

// A sprint whose (floored) status is Shipped has shipped ALL its stories. Completion is very often
// recorded in the sprint's `Status:` line or a per-story summary table instead of a ✅ on each story
// heading — countStories() only sees heading ticks, which understated progress for ~20 epics (a fully
// shipped epic read "0/15 stories"; audit 2026-07-06 §6). Applied to the FLOORED status (not the raw
// derivation) so both undercount patterns heal: sprints that declare ✅ merged themselves, and
// stale-Planned sprints inside a frontmatter-`shipped` epic. Archived is NOT floored — archived
// stories were dropped, not done.
export function floorSprintDone(sprintStatus, total, done) {
  return sprintStatus === 'Shipped' && total > 0 ? total : done;
}

// Decide the live PR overlay label from the PR state — the SINGLE source the workflow (`--lifecycle`)
// and its node:test both read, so the bash and the test can't drift. Draft PR → In progress;
// ready PR → In review; closed (merged or not) → clear (notion-sync.yml re-derives Status on merge).
export function lifecycleForPr({ action, draft }) {
  if (action === 'closed') return { clear: true };
  return { status: draft ? 'In progress' : 'In review' };
}

// Per-sprint Claude Code kickoff — the SESSION-KICKOFFS.md §2 "Build a sprint" thin-pointer template,
// filled from values already in scope. Generated (not stored per-sprint) so it can't drift; surfaced as a
// Notion "Kickoff" property so an open Sprint card carries its ready-to-paste prompt. Mirror §2 if it changes.
function sprintKickoff({ epicKey, slug, n, risk }) {
  const tier = risk === 'High' ? 'HIGH' : 'LOW';
  // TEMPLATE FILL-IN: replace <AGENTS-path> with this project's real AGENTS.md path (see
  // SESSION-KICKOFFS.md §2, which this function mirrors).
  let k = [
    `Read <AGENTS-path> (Start here) + Roadmap/LEARNINGS.md, then`,
    `Roadmap/${epicKey}/README.md + sprint-${n}.md.`,
    `Build Sprint ${n} of "${slug}" per WAYS-OF-WORKING, in your OWN git worktree off latest main on`,
    `feat/${slug}. Plan mode → confirm stories with me → build one story at a time. Commit per story`,
    `PATH-SCOPED (git add <your files> && git commit -- <those paths>; never -A). One api spec`,
    `per testable story. Keep the CI gate green; open a draft PR declaring risk ${tier}, and flip it`,
    `ready-for-review (+ sprint Status → 🟦 In review) once the gate is green and self-QA is posted.`,
    `Write the sprint smoke walkthrough into sprint-${n}.md before calling it done.`,
  ].join('\n');
  if (risk === 'High') k += `\nHIGH-risk: all stories HIGH → the product owner merges; the authed money-path browser smoke is owed to them.`;
  return k;
}

function buildRows() {
  const seeds = readSeeds();
  const seedByEpic = new Map();
  for (const s of seeds) if (s.epic) seedByEpic.set(s.epic, s);

  const rows = [];

  for (const e of listEpicDirs()) {
    const epicKey = `${e.macro}/${e.slug}`;
    const seed = seedByEpic.get(epicKey) || {};
    const sprints = epicSprints(e.path);
    const retroShipped = epicShippedByRetro(e.path);
    const epicFm = epicFrontmatter(e.path);                          // read README frontmatter once
    const statusDerived = deriveEpicStatus(sprints, retroShipped, epicFm.status); // prose/retro fallback + drift signal (archived short-circuits)
    const status = frontmatterStatusBucket(epicFm, `Roadmap/${epicKey}/README.md`) || statusDerived; // README frontmatter is authoritative; invalid value throws
    const buildOrder = normalizeBuildOrder(epicFm.build_order ?? seed.build_order); // epic FM is SSOT, seed fallback
    // Board view of each sprint: status floored against the authoritative epic status, done-count
    // floored against THAT (a Shipped sprint shipped all its stories — see floorSprintDone). The raw
    // `sprints` array stays untouched above so statusDerived / the drift signal never feed on the floor.
    const boardSprints = sprints.map((sp) => {
      const st = floorSprintStatus(status, sp.status);
      return { ...sp, status: st, done: floorSprintDone(st, sp.total, sp.done) };
    });
    const totStories = boardSprints.reduce((a, s) => a + s.total, 0);
    const doneStories = boardSprints.reduce((a, s) => a + s.done, 0);
    const area = AREA_NAMES[e.area] || e.area;
    const priority = seed.priority ? PRIORITY_LABEL[seed.priority] || seed.priority : null;
    const risk = seed.risk ? (seed.risk === 'high' ? 'High' : 'Low') : null;

    // Epic row
    rows.push({
      name: epicTitle(e.path, e.slug),
      slug: e.slug,
      grain: 'Epic',
      status,
      status_derived: statusDerived,   // prose/retro derivation — for the advisory drift check on the board
      status_date: statusDate(`Roadmap/${epicKey}/README.md`, '^status:'),
      area,
      priority,
      type: TYPE_LABEL[seed.type] || 'Epic',
      risk,
      sprint_progress: totStories ? `${doneStories}/${totStories} stories` : `${sprints.length} sprints`,
      build_order: buildOrder,
      build_order_num: buildOrderNum(buildOrder),
      doc_link: `Roadmap/${epicKey}/README.md`,
      epic_slug: null,
    });

    // Sprint rows (one per sprint-N.md), related to the Epic by slug. boardSprints already carries
    // the floored status (archived epic ⇒ Archived sprints; Shipped epic's stale "Planned" sprints ⇒
    // Shipped; real in-flight signals preserved — floorSprintStatus) and the floored done-count
    // (Shipped sprint ⇒ all stories done — floorSprintDone).
    for (const sp of boardSprints) {
      rows.push({
        name: `${epicTitle(e.path, e.slug)} — S${sp.n}: ${sp.title}`,
        slug: `${e.slug}--s${sp.n}`,
        grain: 'Sprint',
        status: sp.status,
        status_date: statusDate(`Roadmap/${epicKey}/sprint-${sp.n}.md`, '^(\\*\\*)?Status:'),
        area,
        priority,
        type: 'Sprint',
        risk,
        sprint_progress: sp.total ? `${sp.done}/${sp.total} stories` : '—',
        build_order: buildOrder, // sprints inherit their epic's build order
        build_order_num: buildOrderNum(buildOrder),
        doc_link: `Roadmap/${epicKey}/sprint-${sp.n}.md`,
        epic_slug: e.slug, // resolved to the Epic page id at sync time
        kickoff: sprintKickoff({ epicKey, slug: e.slug, n: sp.n, risk }),
      });
    }
  }

  // Seed rows: only seeds with no scaffolded epic (epic == null)
  for (const s of seeds.filter((x) => !x.epic)) {
    rows.push({
      name: s.title || s.slug,
      slug: s.slug,
      grain: 'Seed',
      status: seedStatusLabel(s.status, s._file),
      status_date: statusDate(s._file, '^status:'),
      area: AREA_NAMES[s.area] || s.area || null,
      priority: s.priority ? PRIORITY_LABEL[s.priority] || s.priority : null,
      type: TYPE_LABEL[s.type] || 'Feature',
      risk: s.risk ? (s.risk === 'high' ? 'High' : 'Low') : null,
      sprint_progress: null,
      build_order: s.build_order || null,
      build_order_num: buildOrderNum(s.build_order),
      doc_link: s._file,
      epic_slug: null,
    });
  }
  return rows;
}

// --- CLI dispatch. Wrapped in main() + guarded by isMain so the pure helpers above (floorSprintStatus,
// lifecycleForPr, normalizeBuildOrder, buildRows) can be imported by node:test without running the CLI
// (a bare module load would otherwise hit writeSync/process.exit). ----------------------------------
async function main() {
  const args = process.argv.slice(2);
  const hasFlag = (f) => args.includes(f);
  const flagVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

  // --lifecycle: print the overlay label the notion-pr-sync.yml workflow should send for the current PR
  // state (PR_ACTION + PR_DRAFT env). "clear" or the Lifecycle label. No docs/Notion read needed.
  if (hasFlag('--lifecycle')) {
    const decision = lifecycleForPr({ action: process.env.PR_ACTION, draft: process.env.PR_DRAFT === 'true' });
    writeSync(1, (decision.clear ? 'clear' : decision.status) + '\n');
    return;
  }

  const mode = hasFlag('--sync') ? 'sync' : hasFlag('--pr') ? 'pr' : 'extract';
  const rows = buildRows();

  if (mode === 'extract') {
    // writeSync to fd 1 is synchronous on a PIPE too — `console.log` then `process.exit(0)` truncates
    // piped stdout (the async write hasn't flushed when exit fires), which crashed build-order.mjs's
    // execFileSync with "Unexpected end of JSON input". Synchronous write guarantees the full payload.
    writeSync(1, JSON.stringify(rows, null, 2) + '\n');
    return;
  }

  // --- sync mode: upsert into Notion by slug (docs always win) ---
  const TOKEN = process.env.NOTION_TOKEN;
  const DB = process.env.NOTION_DB_ID;
  const needsNotion = mode === 'sync' || (mode === 'pr' && !hasFlag('--dry'));
  if (needsNotion && (!TOKEN || !DB)) { console.error('set NOTION_TOKEN and NOTION_DB_ID'); process.exitCode = 1; return; }
  const NV = '2022-06-28';
  const api = (path, init = {}) => fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': NV, 'Content-Type': 'application/json', ...(init.headers || {}) },
  }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j; });

  const sel = (v) => (v ? { select: { name: String(v) } } : { select: null });
  const rt = (v) => ({ rich_text: v ? [{ text: { content: String(v) } }] : [] });
  function props(row, epicId) {
    const p = {
      Name: { title: [{ text: { content: row.name } }] },
      Slug: rt(row.slug),
      Status: sel(row.status),
      Area: sel(row.area),
      Priority: sel(row.priority),
      Type: sel(row.type),
      Risk: sel(row.risk),
      Grain: sel(row.grain),
      'Sprint progress': rt(row.sprint_progress),
      'Build order ID': rt(row.build_order),
      'Build order': { number: row.build_order_num ?? null },   // numeric sort key (board polish 2026-07-15)
      'Status date': row.status_date ? { date: { start: row.status_date } } : { date: null }, // when the row entered its status
      'Doc link': rt(row.doc_link),
      Kickoff: rt(row.kickoff),
      'Last synced': { date: { start: new Date().toISOString().slice(0, 10) } },
    };
    if (row.grain === 'Sprint') p.Epic = { relation: epicId ? [{ id: epicId }] : [] };
    return p;
  }

  // --- in-flight (PR) mode: scope-limited PATCH of ONLY the named epic's row(s). -------------------
  // Used by the pull_request workflow so an open PR shows its epic's live Lifecycle (In progress for a
  // draft PR, In review when ready) WITHOUT running the full --sync rebuild from a feature branch (which
  // would clobber every other epic's row with one branch's worldview). This adds NO new rebuild path: it
  // reuses api()/sel() and writes ONLY the two overlay properties below, never the docs-derived Status
  // (the one-way docs → Status contract stays intact). Scoped by slug, so parallel PRs on different epics
  // never touch the same row. The --status label is free-form (the workflow passes the --lifecycle result).
  //   node roadmap-to-notion.mjs --pr <epic-slug>[,<slug2>] --status "In progress" --link <pr-url>
  //   node roadmap-to-notion.mjs --pr <epic-slug> --clear     # PR closed/merged → drop the overlay
  //   add --dry to preview the targeted rows from the projection without touching Notion (smoke-safe).
  if (mode === 'pr') {
    const PR_PROP = 'Lifecycle';     // a NEW Notion Select, separate from docs-derived Status (Daniel ratifies)
    const PR_LINK_PROP = 'PR link';  // a NEW Notion URL property                            (Daniel ratifies)
    const prSlugs = [...new Set(
      args.flatMap((a, i) => (a === '--pr' && args[i + 1] ? args[i + 1].split(',') : []))
          .map((s) => s.trim()).filter(Boolean),
    )];
    if (!prSlugs.length) { console.error('--pr: pass at least one epic slug'); process.exitCode = 1; return; }
    const status = flagVal('--status');
    const link = flagVal('--link');
    const clearing = hasFlag('--clear') || !status;
    const overlay = {
      [PR_PROP]: sel(clearing ? null : status),
      [PR_LINK_PROP]: { url: clearing ? null : (link || null) },
    };
    const isTarget = (slug) => prSlugs.some((s) => slug === s || slug.startsWith(`${s}--`)); // epic + its sprints

    if (hasFlag('--dry')) {
      const hits = rows.filter((r) => isTarget(r.slug));
      console.log(JSON.stringify({
        mode: clearing ? 'clear' : 'set', slugs: prSlugs, overlay,
        would_patch: hits.map((r) => ({ slug: r.slug, grain: r.grain, name: r.name })),
      }, null, 2));
      if (!hits.length) console.error(`--pr --dry: no projected rows match ${prSlugs.join(', ')}`);
      return;
    }

    // live: query the DB but keep ONLY the matching slugs, then PATCH each. (read is harmless; ~one page.)
    const targets = new Map();
    let prCursor;
    do {
      const page = await api(`/databases/${DB}/query`, { method: 'POST', body: JSON.stringify(prCursor ? { start_cursor: prCursor } : {}) });
      for (const p of page.results) {
        const slug = p.properties?.Slug?.rich_text?.[0]?.plain_text;
        if (slug && isTarget(slug)) targets.set(slug, p.id);
      }
      prCursor = page.has_more ? page.next_cursor : null;
    } while (prCursor);

    for (const [, id] of targets) await api(`/pages/${id}`, { method: 'PATCH', body: JSON.stringify({ properties: overlay }) });
    // Surface a no-op: a slug that matches no Notion row (a brand-new epic not yet --sync'd) would
    // otherwise report success while applying nothing. Don't fail (the deploy-lag window is legit) — warn.
    if (!targets.size) console.error(`--pr: no Notion row matched ${prSlugs.join(', ')} — overlay not applied (epic not synced yet?).`);
    console.log(`pr-sync done — ${clearing ? 'cleared overlay' : `set ${PR_PROP}="${status}"`} on ${targets.size} row(s) for ${prSlugs.join(', ')}`);
    return;
  }

  // 1. Snapshot existing rows by slug
  const existing = new Map();
  let cursor;
  do {
    const page = await api(`/databases/${DB}/query`, { method: 'POST', body: JSON.stringify(cursor ? { start_cursor: cursor } : {}) });
    for (const p of page.results) {
      const slug = p.properties?.Slug?.rich_text?.[0]?.plain_text;
      if (slug) existing.set(slug, p.id);
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);

  const slugToId = new Map(existing); // slug -> page id (kept current as we upsert)
  async function upsert(row, epicId) {
    const id = slugToId.get(row.slug) || existing.get(row.slug);
    if (id) { await api(`/pages/${id}`, { method: 'PATCH', body: JSON.stringify({ properties: props(row, epicId) }) }); return { id, created: false }; }
    const created = await api(`/pages`, { method: 'POST', body: JSON.stringify({ parent: { database_id: DB }, properties: props(row, epicId) }) });
    slugToId.set(row.slug, created.id);
    return { id: created.id, created: true };
  }

  let created = 0, updated = 0;
  // Pass 1: Epics + Seeds first (so sprint→epic relations can resolve)
  for (const row of rows.filter((r) => r.grain !== 'Sprint')) {
    const r = await upsert(row); r.created ? created++ : updated++;
  }
  // Pass 2: Sprints, relation → parent epic page id
  for (const row of rows.filter((r) => r.grain === 'Sprint')) {
    const epicId = slugToId.get(row.epic_slug) || existing.get(row.epic_slug) || null;
    const r = await upsert(row, epicId); r.created ? created++ : updated++;
  }
  // Archive Notion rows whose slug no longer exists in docs (never hard-delete)
  for (const [slug, id] of existing) {
    if (!rows.find((r) => r.slug === slug)) { await api(`/pages/${id}`, { method: 'PATCH', body: JSON.stringify({ properties: { Status: sel('Archived') } }) }); }
  }
  console.log(`sync done — created ${created}, updated ${updated}, scanned ${existing.size} existing`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) await main();
