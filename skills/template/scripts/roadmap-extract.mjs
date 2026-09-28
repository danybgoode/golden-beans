#!/usr/bin/env node
// roadmap-extract.mjs — project the Roadmap docs into rows: the ONE status extractor every roadmap tool reads.
//
//   node scripts/roadmap-extract.mjs        # print the projected rows as JSON
//
// Readers: build-order.mjs (BUILD-ORDER.md), doc-hygiene.mjs (archived-epic checks), pmo-report.mjs (story
// progress), and — only if a project opts in — optional/notion/roadmap-to-notion.mjs, which pushes these
// same rows to a Notion board.
//
// ── Why this is its own file (plugin-audit-and-extraction S1, story 1.5) ────────────────────────────────
// This used to be the first half of roadmap-to-notion.mjs, the largest file in the copy-once skeleton, for
// an integration most projects never use. But the half every project DOES use — the extractor — was
// inside it, so the Notion sync could not be made opt-in without breaking build-order.mjs. The split puts
// the SSOT here, under a name that says what it is, and moves only the Notion push to optional/notion/.
// The extraction logic is unchanged.
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

import { readFileSync, readdirSync, existsSync, statSync, writeSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { projectRoot } from './lib/project-root.mjs';

const REPO = projectRoot(); // D2
const ROADMAP = join(REPO, 'Roadmap');
const SEEDS = join(ROADMAP, '00-ideas', 'seeds');

const AREA_NAMES = {
  '01': '01 Discovery', '02': '02 Checkout & Payments', '03': '03 Selling & Shops',
  '04': '04 Shipping', '05': '05 Trust/Offers/Messaging', '06': '06 Print',
  '07': '07 Agentic/Federated', '08': '08 Growth', '09': '09 Platform-infra',
  '10': '10 Events & Ticketing',
};
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
    seedAppetite(fm.appetite, `Roadmap/00-ideas/seeds/${f}`);  // hard-fail on an invalid appetite
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

// Seed frontmatter `appetite:` — the economics enum (WAYS-OF-WORKING → Betting & appetite).
// Absent → null (the funnel tolerates unshaped ideas); a PRESENT but unrecognized value THROWS,
// same rationale as the status enum — a typo'd appetite must not silently pass for funded work.
// Whether an appetite is REQUIRED (at `status: queued`) is build-order.mjs's enforcement; this
// only guards the vocabulary.
const APPETITES = new Set(['S', 'M', 'L']);
export function seedAppetite(appetite, file = 'seed') {
  if (appetite == null) return null;
  if (!APPETITES.has(appetite)) {
    throw new Error(`${file}: unrecognized seed frontmatter appetite "${appetite}" — valid values: S | M | L`);
  }
  return appetite;
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
    `per testable story. Keep the CI gate green; open a draft PR declaring risk ${tier}.`,
    `Write the sprint smoke walkthrough into sprint-${n}.md before calling it done.`,
  ].join('\n');
  if (risk === 'High') k += `\nHIGH-risk: all stories HIGH → the product owner merges; the authed money-path browser smoke is owed to them.`;
  return k;
}

export function buildRows() {
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
      area,
      priority,
      type: TYPE_LABEL[seed.type] || 'Epic',
      risk,
      sprint_progress: totStories ? `${doneStories}/${totStories} stories` : `${sprints.length} sprints`,
      build_order: buildOrder,
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
        area,
        priority,
        type: 'Sprint',
        risk,
        sprint_progress: sp.total ? `${sp.done}/${sp.total} stories` : '—',
        build_order: buildOrder, // sprints inherit their epic's build order
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
      area: AREA_NAMES[s.area] || s.area || null,
      priority: s.priority ? PRIORITY_LABEL[s.priority] || s.priority : null,
      type: TYPE_LABEL[s.type] || 'Feature',
      risk: s.risk ? (s.risk === 'high' ? 'High' : 'Low') : null,
      appetite: s.appetite || null,
      underwritten_by: s.underwritten_by || null,
      sprint_progress: null,
      build_order: s.build_order || null,
      doc_link: s._file,
      epic_slug: null,
    });
  }
  return rows;
}

// Print the rows. writeSync to fd 1 is synchronous on a PIPE too — `console.log` then an exit truncates
// piped stdout (the async write has not flushed), which crashed build-order.mjs's execFileSync with
// "Unexpected end of JSON input". Synchronous write guarantees the full payload.
// realpath, not resolve: on macOS a temp or symlinked path (/var → /private/var) never equals the module
// URL, and a plain comparison makes the CLI a silent no-op.
const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isMain) writeSync(1, JSON.stringify(buildRows(), null, 2) + '\n');
