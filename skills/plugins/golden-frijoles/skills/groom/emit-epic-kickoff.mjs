#!/usr/bin/env node
// emit-epic-kickoff.mjs — print the finished, paste-ready EPIC-MODE kickoff for a groomed epic.
//
// ── Why this exists ──────────────────────────────────────────────────────────────────────────────────
// Epic mode — one orchestrated run across a whole epic, sprint files as internal integration boundaries
// — is the DEFAULT unit of work. But the only generator that existed was `emit-kickoff.mjs`, which emits
// a single-sprint prompt, so every epic-mode kickoff was composed BY HAND. Hand-composed prompts are
// exactly where a process contract erodes: the architecture-lock pass gets summarised away, the review
// policy reverts to whatever the composing agent remembered, and nobody notices because the prompt still
// looks complete. This is the sibling generator, and the two now split cleanly:
//
//   emit-epic-kickoff.mjs  → the DEFAULT. One prompt, whole epic, one orchestrator.
//   emit-kickoff.mjs       → the EXCEPTION. A single-sprint epic, or a sprint whose outcome genuinely
//                            changes the next sprint's scope (so the next kickoff can't be written yet).
//
// Same contract as its sibling: it resolves the epic by SEARCHING Roadmap/*/<slug>/ under --repo-root
// (default cwd), reads the epic README and EVERY sprint-N.md, substitutes into templates/epic-kickoff.md
// and prints to stdout. It writes no file — read + print, editorial control stays with the caller.
//
// Usage:
//   node skills/groom/emit-epic-kickoff.mjs --epic <slug> [--repo-root <path>]

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL = join(__dirname, 'templates');

// Reuse the sibling's parsers rather than forking a second copy — the file formats are identical, and two
// drifting parsers for one format is a bug generator.
import {
  parseArgs,
  sub,
  parseFrontmatter,
  parseEpicTitle,
  parseSprintHeader,
  parseStoryHeadings,
} from './emit-kickoff.mjs';

// ── pure helpers (exported for the co-located test) ─────────────────────────────────────────

// `sprint-3.md` → 3. Returns null for anything that isn't a sprint file, so a stray doc in the epic dir
// (a NOTES.md, an image) can't be mistaken for a sprint.
export function sprintNumFromFilename(name) {
  const m = name.match(/^sprint-(\d+)\.md$/);
  return m ? Number(m[1]) : null;
}

// Every sprint file in the epic dir, NUMERICALLY sorted. Numeric, not lexicographic: a 10-sprint epic
// would otherwise order sprint-10 between sprint-1 and sprint-2, and the whole point of epic mode is that
// the sprints are an ordered assembly line. Stacked branches make a wrong order actively harmful.
export function listSprintFiles(names) {
  return names
    .map((name) => ({ name, num: sprintNumFromFilename(name) }))
    .filter((s) => s.num !== null)
    .sort((a, b) => a.num - b.num);
}

// The comma-separated file list for the orientation line.
export function buildSprintFileList(sprints) {
  if (!sprints.length) return '(no sprint-N.md files found)';
  return sprints.map((s) => s.name).join(', ');
}

// The per-sprint breakdown at the foot of the prompt: heading, title, and its stories. This is the only
// part that genuinely varies per epic, and it is deliberately the LAST thing in the prompt — the process
// contract above it is invariant, so a reader (human or agent) can diff two kickoffs and see only scope.
export function buildSprintBreakdown(sprints) {
  if (!sprints.length) return '(no sprint files found — scaffold the epic first)';
  return sprints
    .map((s) => {
      const stories = s.stories.length
        ? s.stories.map((h) => `- ${h}`).join('\n')
        : '(no `### Story N.M — <title>` headings found in this sprint doc)';
      const title = s.title ? `: ${s.title}` : '';
      return `### Sprint ${s.num}${title}\n_(boundary: ${s.name})_\n\n${stories}`;
    })
    .join('\n\n');
}

export function buildEpicKickoff({ macro, slug, epicTitle, risk, sprints, templateText }) {
  return sub(templateText, {
    MACRO: macro,
    SLUG: slug,
    EPIC_TITLE: epicTitle,
    RISK: risk,
    SPRINT_COUNT: String(sprints.length),
    SPRINT_FILE_LIST: buildSprintFileList(sprints),
    SPRINT_BREAKDOWN: buildSprintBreakdown(sprints),
  });
}

// The epic README header line carries `**Risk:** <low|high>`; the frontmatter doesn't. Falls back to
// 'high' — the WAYS-OF-WORKING rule is "when unsure, treat it as high", and a kickoff that under-declares
// risk is the one that skips the mandatory fresh-reviewer pass.
export function parseEpicRisk(text) {
  const m = text.match(/\*\*Risk:\*\*\s*([A-Za-z]+)/);
  return m ? m[1].toLowerCase() : 'high';
}

// ── filesystem helpers (thin, not unit-tested — exercised by the real run) ──────────────────

function die(msg) {
  console.error(`emit-epic-kickoff: ${msg}`);
  process.exit(1);
}

// Search Roadmap/*/<slug>/ under repoRoot — the macro-area prefix isn't knowable from the slug alone.
function findEpicDir(repoRoot, slug) {
  const roadmapDir = join(repoRoot, 'Roadmap');
  if (!existsSync(roadmapDir)) die(`no Roadmap/ dir under --repo-root "${repoRoot}"`);
  let macros;
  try {
    macros = readdirSync(roadmapDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (e) {
    die(`couldn't read ${roadmapDir}: ${e.message}`);
  }
  const hits = macros.filter((m) => existsSync(join(roadmapDir, m, slug, 'README.md')));
  if (hits.length === 0) {
    die(`no epic found for slug "${slug}" under any Roadmap/*/ dir in "${repoRoot}" (searched: ${macros.join(', ') || '(none)'})`);
  }
  if (hits.length > 1) {
    die(`ambiguous slug "${slug}" — found under multiple macro-areas: ${hits.map((m) => `Roadmap/${m}/${slug}`).join(', ')}`);
  }
  return { macro: hits[0], dir: join(roadmapDir, hits[0], slug) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.epic || args.epic === true) {
    console.error('emit-epic-kickoff: missing required flag: --epic');
    console.error('Run with --epic <slug> [--repo-root <path>]');
    process.exit(1);
  }

  const slug = String(args.epic);
  const repoRoot = resolve(String(args['repo-root'] === true ? '' : args['repo-root'] || process.cwd()));
  const { macro, dir } = findEpicDir(repoRoot, slug);

  const readmeText = readFileSync(join(dir, 'README.md'), 'utf8');
  const frontmatter = parseFrontmatter(readmeText);
  if (frontmatter.slug && frontmatter.slug !== slug) {
    die(`Roadmap/${macro}/${slug}/README.md frontmatter slug "${frontmatter.slug}" != requested "${slug}"`);
  }

  const epicTitle = parseEpicTitle(readmeText);
  if (!epicTitle) die(`couldn't find an H1 title in Roadmap/${macro}/${slug}/README.md`);

  const found = listSprintFiles(readdirSync(dir));
  if (!found.length) die(`no sprint-N.md files under Roadmap/${macro}/${slug}/ — scaffold the epic first`);

  const sprints = found.map(({ name, num }) => {
    const text = readFileSync(join(dir, name), 'utf8');
    const header = parseSprintHeader(text);
    return { name, num, title: header ? header.sprintTitle : null, stories: parseStoryHeadings(text) };
  });

  // A single-sprint "epic" is the documented exception, not the default — say so instead of emitting a
  // whole-epic orchestration prompt for one sprint's worth of work.
  if (sprints.length === 1) {
    process.stderr.write(
      `⚠ "${slug}" has one sprint. Epic mode buys nothing here — the per-sprint kickoff is the right ` +
        `tool: node skills/groom/emit-kickoff.mjs --epic ${slug} --sprint 1\n` +
        `  (Emitting the epic-mode prompt anyway.)\n\n`
    );
  }

  const templatePath = join(TPL, 'epic-kickoff.md');
  if (!existsSync(templatePath)) die(`missing template: ${templatePath}`);

  process.stdout.write(
    buildEpicKickoff({
      macro,
      slug,
      epicTitle,
      risk: parseEpicRisk(readmeText).toUpperCase(),
      sprints,
      templateText: readFileSync(templatePath, 'utf8'),
    })
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
