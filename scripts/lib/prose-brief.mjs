// prose-brief.mjs — the deterministic EVIDENCE PACK handed to a Claude Routine so it can write the
// standup / weekly recap in its own context (README D2).
//
// ── Why a brief instead of a writer call ──────────────────────────────────────────────────────
// The local surfaces (retro, poster, sprint-wrap) call devin/agy directly through prose-writer.mjs.
// The two SCHEDULED surfaces cannot: a Claude Routine runs on Anthropic-managed infra with no local
// CLI credentials, so `hasCmd('devin')` and `hasCmd('agy')` are both false there and `writeProse`
// would return "no prose writer available" — silently producing NOTHING on exactly the two surfaces
// the epic exists to improve. Same headless-auth wall that made cross-agent-review-always local-only.
//
// So the routine IS the writer, and the split is:
//   phase 1  `--brief`               → this module builds persona + lessons + task + evidence
//   phase 2  the routine writes the prose in-context
//   phase 3  `--post --prose-file`   → the SAME pure guard runs; findings come back as a revision note
//
// Determinism stays in code; only sentence-making is model work. The guard is shared with the local
// rail, so a lesson learned on either backend protects both.
//
// ── Roadmap deltas lead, commits corroborate (README D4) ──────────────────────────────────────
// This is the whole reason our reports can be written at product altitude while golden-beans' are
// git-log-derived. Epic READMEs and sprint docs carry plain-language user stories and acceptance
// criteria — product language, written BEFORE the code. A report that leads with those can say what
// is now true for a person; one that leads with commit subjects can only ever be an engineering
// report with the adjectives swapped.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadPromptBody } from './cross-agent-cli.mjs';
import { loadLessons, buildWriterPrompt } from './prose-writer.mjs';
import { kitRoot, projectAsset, projectRoot } from './project-root.mjs';

/**
 * Read a sprint doc's `**Status:**` line. Pure-ish (single read), used to describe sprint movement in
 * product terms rather than as a file diff.
 */
export function statusLineFrom(markdown) {
  const m = /^\*\*Status:\*\*\s*(.+)$/m.exec(String(markdown ?? ''));
  return m ? m[1].trim() : null;
}

/**
 * Turn the raw gathered facts into the evidence pack, in D4's order.
 *
 * PURE — takes already-gathered facts, returns a string. Kept pure so the pack's shape is unit-tested
 * without git, gh, or a network.
 */
export function buildEvidencePack({
  windowLabel,
  roadmapDeltas = [],
  owed = null,
  repoSignals = [],
  areas = [],
  liveFlags = [],
  smoke = null,
}) {
  const lines = [`## Evidence — ${windowLabel}`, ''];

  // 1. Roadmap deltas FIRST (D4). This is the product-language input; everything below corroborates it.
  lines.push('### What moved on the roadmap (product language — lead with this)');
  if (roadmapDeltas.length) {
    for (const d of roadmapDeltas) lines.push(`- ${d}`);
  } else {
    lines.push('- (no epic or sprint status changed in this window)');
  }
  lines.push('');

  // 2. What is owed. Degrades cleanly when the generated ledger does not exist yet — the two epics
  //    must not hard-depend on each other's merge order.
  lines.push('### What is owed (verification a person still has to do)');
  if (owed && owed.total != null) {
    lines.push(`- ${owed.total} check(s) owed${owed.byCategory ? ` — ${owed.byCategory}` : ''}.`);
  } else {
    lines.push('- (the owed ledger is not available in this run — do not guess a number)');
  }
  lines.push('');

  // 3. Repo signals — corroboration, and the source of "what is stuck".
  lines.push('### Repository signals (corroboration — do NOT enumerate these in your report)');
  if (repoSignals.length) {
    for (const s of repoSignals) lines.push(`- ${s}`);
  } else {
    lines.push('- (nothing changed)');
  }
  if (smoke) lines.push(`- Overnight smoke: ${smoke}`);
  lines.push('');

  // 4. Shape only — never file names.
  if (areas.length) {
    lines.push('### Where the work landed (shape only — never name files in your report)');
    for (const a of areas) lines.push(`- ${a}`);
    lines.push('');
  }

  // 5. Flag state. The `flag-state-claim` guard rule needs real input, and this is it.
  // `liveFlags` may be an array (known) or {available:false} (unknown). The difference matters: "no
  // flags are on" and "I could not check" are different facts, and telling the writer the former when
  // the truth is the latter is exactly the kind of confident falsehood this rail exists to stop.
  lines.push('### Flags currently ON (a capability is NOT live unless its flag is listed here)');
  const flagList = Array.isArray(liveFlags) ? liveFlags : liveFlags?.flags || [];
  const flagsKnown = Array.isArray(liveFlags) ? true : Boolean(liveFlags?.available);
  if (!flagsKnown) {
    lines.push('- (flag state UNKNOWN in this run — it could not be read. Do not describe anything as');
    lines.push('  live, and do not state that anything is off either: you do not know.)');
  } else if (flagList.length) {
    for (const f of flagList) lines.push(`- ${f}`);
  } else {
    lines.push('- (none are on — do not describe any capability as live or available)');
  }

  return lines.join('\n');
}

/**
 * The quiet-window instruction (README D7).
 *
 * Deliberately NOT an evidence pack. golden-beans' rail refuses to call a writer on an empty
 * changelog because a model handed nothing produces plausible prose about nothing; our standup has
 * the sibling of that bug on record in LEARNINGS (a missing baseline once enumerated 100+ PRs and
 * crashed on Telegram's 4096-char limit). A routine reading this must post the existing one-line
 * quiet message and write no prose at all.
 */
export function buildQuietBrief(windowLabel) {
  return [
    `## Nothing to report — ${windowLabel}`,
    '',
    'No roadmap movement and no repository activity in this window.',
    '',
    '**Do NOT write prose.** A quiet period is a fact, not a failure, and a report invented to fill',
    'the space is the failure this whole rail exists to prevent. Post the standard one-line quiet',
    'message and stop.',
  ].join('\n');
}

/** Load the shared persona + a per-surface task file. */
export function loadPersonaAndTask(scriptsDir, surface) {
  return [
    // The persona is a TEMPLATE FILL-IN the project owns (D2); the task file is the kit's. An explicit scriptsDir that
    // isn't this set's own names its project directly (golden-frijoles-plugin X20): a fixture gets ITS persona.
    loadPromptBody(
      projectAsset('prose/cpo-persona.md', {
        root: scriptsDir,
        project: resolve(scriptsDir) === kitRoot() ? projectRoot() : dirname(resolve(scriptsDir)),
      })
    ),
    loadPromptBody(join(scriptsDir, 'prose', `${surface}.task.md`)),
  ].join('\n\n');
}

/**
 * Compose the full brief. Routes through `buildWriterPrompt` — the SAME assembler the local rail uses
 * — so the lessons file cannot reach one backend and silently miss the other.
 */
export function buildBrief({ scriptsDir, surface, pack, lessons }) {
  return buildWriterPrompt({
    style: loadPersonaAndTask(scriptsDir, surface),
    lessons: lessons ?? loadLessons(),
    task: pack,
  });
}

/**
 * Derive the guard's evidence flags FROM THE WINDOW — never assumed.
 *
 * `allowsFixClaim` only when something in the window actually claims a fix; `allowsBeneficiary` only
 * when a customer-observable surface was touched. Both default closed, which is what makes the
 * corresponding guard rules meaningful rather than decorative.
 */
export function deriveEvidenceFlags({ subjects = [], areas = [], liveFlags = [], maxWords }) {
  return {
    allowsFixClaim: subjects.some((s) => /^(?:fix|hotfix|revert)(?:\([^)]*\))?!?:/i.test(s)),
    allowsBeneficiary: areas.some((a) =>
      /customer-facing|storefront|checkout|seller portal|admin|public page|shop page|listing/i.test(a)
    ),
    liveFlags,
    // Chat-message surface: structural markdown is forbidden, so the strict `unfinished` rule applies.
    allowsMarkdown: false,
    maxWords,
    minWords: 15,
  };
}

/** Read a generated owed-ledger JSON if epic B's story 3 has landed; degrade cleanly when it hasn't. */
export function loadOwedLedger(path, deps = {}) {
  const { read = readFileSync, exists = existsSync } = deps;
  if (!exists(path)) return null;
  try {
    const j = JSON.parse(read(path, 'utf8'));
    const byCategory = j.byCategory
      ? Object.entries(j.byCategory)
          .map(([k, v]) => `${v} ${k}`)
          .join(', ')
      : null;
    return { total: j.total ?? null, byCategory };
  } catch {
    return null; // a malformed ledger is the same as an absent one: report nothing, invent nothing
  }
}
