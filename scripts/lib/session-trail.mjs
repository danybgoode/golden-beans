// Pure logic for the session trail — the re-entry rail for a session that dies mid-flight.
//
// ── The problem this solves, and the one it deliberately does NOT ─────────────────────────────
// Hitting a session limit mid-epic is routine, not exceptional. The durable docs (epic README,
// sprint-N.md, LEARNINGS, team memory) make re-entry cheap by design — but they record what was
// DECIDED and what SHIPPED, not what was in flight at the moment the lights went out: which story
// was half-built, which claim had actually been verified by running something, and which of the
// uncommitted files in the tree are finished versus scaffolding.
//
// The tempting fix is "write a good handover summary." Roadmap/LEARNINGS.md says plainly why that
// fails: pod-report Sprint 2's close-out claimed four stories were built, and TWO of those claims
// did not survive a check against origin/main, the production database and the live site. Both were
// written in good faith by a session that had genuinely done the hard half. A summary is a claim,
// and the next session has no way to tell a true claim from a stale one.
//
// So this rail is built on one rule: **a checkpoint records mechanically-derived facts alongside
// the human note, and re-entry DIFFS the two.** The next session is not asked to trust the note; it
// is shown exactly where the note and the repository now disagree. A trail that cannot detect its
// own staleness would be worse than no trail, because the next reader would stop there.

/** What a checkpoint captures automatically. Anything derivable is derived, never typed. */
export function buildCheckpoint({ note, state, now }) {
  return {
    at: now.toISOString(),
    note: (note || '').trim(),
    branch: state.branch,
    head: state.head,
    headSubject: state.headSubject,
    // Sorted so two checkpoints with the same working tree produce byte-identical lists — a diff
    // that reports spurious changes because a directory walk returned a different order is a diff
    // nobody reads twice.
    dirty: [...state.dirty].sort(),
    untracked: [...state.untracked].sort(),
    verified: [...(state.verified || [])],
  };
}

/**
 * The heart of the rail: what has changed between the last checkpoint and the repository NOW.
 *
 * Returns a structured drift report rather than a boolean, because the interesting cases are not
 * "stale/fresh" but specific: the branch moved, HEAD advanced (someone committed after the trail
 * was written), files the trail listed as in-progress have vanished, or new files appeared that no
 * checkpoint mentions.
 */
export function detectDrift(checkpoint, current) {
  if (!checkpoint) return { hasDrift: false, reasons: [], severity: 'none' };

  const reasons = [];

  if (checkpoint.branch !== current.branch) {
    reasons.push({
      kind: 'branch-moved',
      severity: 'high',
      detail: `trail was written on '${checkpoint.branch}', working tree is on '${current.branch}'`,
    });
  }

  if (checkpoint.head !== current.head) {
    reasons.push({
      kind: 'head-advanced',
      severity: 'high',
      detail: `HEAD was ${short(checkpoint.head)}, is now ${short(current.head)} — work landed after the last checkpoint, so the note below describes an older tree`,
    });
  }

  const wasInFlight = new Set([...checkpoint.dirty, ...checkpoint.untracked]);
  const nowInFlight = new Set([...current.dirty, ...current.untracked]);

  const vanished = [...wasInFlight].filter((f) => !nowInFlight.has(f)).sort();
  if (vanished.length > 0) {
    // Not necessarily bad — committing the files is the normal way for this to happen. It is
    // reported rather than judged, because "committed" and "reverted/lost" look identical here and
    // only the reader can tell which, by looking at whether HEAD also advanced.
    reasons.push({
      kind: 'in-flight-files-gone',
      severity: 'medium',
      detail: `no longer modified/untracked (committed, reverted, or lost): ${vanished.join(', ')}`,
    });
  }

  const appeared = [...nowInFlight].filter((f) => !wasInFlight.has(f)).sort();
  if (appeared.length > 0) {
    reasons.push({
      kind: 'new-in-flight-files',
      severity: 'low',
      detail: `changed since the last checkpoint: ${appeared.join(', ')}`,
    });
  }

  return {
    hasDrift: reasons.length > 0,
    reasons,
    severity: highestSeverity(reasons),
  };
}

const SEVERITY_ORDER = { none: 0, low: 1, medium: 2, high: 3 };

export function highestSeverity(reasons) {
  return reasons.reduce(
    (acc, r) => (SEVERITY_ORDER[r.severity] > SEVERITY_ORDER[acc] ? r.severity : acc),
    'none'
  );
}

function short(sha) {
  return (sha || '').slice(0, 8) || '(none)';
}

/**
 * Renders one checkpoint as the markdown block appended to the trail file.
 *
 * `verified` is separated from `note` on purpose and the heading says so. A session's own prose
 * about what it did is a claim; a line under "verified by running" names the command whose output
 * was actually observed. Keeping them in one paragraph is how the two become indistinguishable to
 * the next reader — which is the failure mode this whole file exists to prevent.
 */
export function renderCheckpoint(cp) {
  const lines = [`## ${cp.at} — \`${cp.branch}\` @ ${short(cp.head)}`, ''];
  if (cp.headSubject) lines.push(`_HEAD: ${cp.headSubject}_`, '');
  if (cp.note) lines.push(cp.note, '');

  if (cp.verified.length > 0) {
    lines.push('**Verified by running (observed output, not believed):**');
    for (const v of cp.verified) lines.push(`- ${v}`);
    lines.push('');
  }

  const inFlight = [...cp.dirty.map((f) => `${f} (modified)`), ...cp.untracked.map((f) => `${f} (new)`)];
  if (inFlight.length > 0) {
    lines.push('**In flight at this checkpoint** — uncommitted, so it exists only in this working tree:');
    for (const f of inFlight) lines.push(`- \`${f}\``);
    lines.push('');
  } else {
    lines.push('**In flight:** nothing — the working tree was clean.', '');
  }

  return lines.join('\n');
}

// ── Finding the trail from the branch, and why this needed more than a branch match ────────────
//
// The original rule was one line: `feat/<epic-slug>` names its epic, so the trail finds its own
// home. That is the convention WAYS-OF-WORKING mandates, and it is correct — but it silently fails
// in the two situations a re-entering session is MOST likely to be in, which is how a cold session
// on 2026-07-26 got told "No checkpoint recorded yet" while four checkpoints sat in the epic folder.
//
//   1. **On `main`.** LEARNINGS' squash-merge rule says a merged sprint branch is a dead end and the
//      next sprint starts fresh off `main`. So the mandated state at the start of a new sprint is
//      exactly the state where the branch names no epic at all. The rail's own worst case was
//      guaranteed by the process it serves.
//   2. **On a sprint-suffixed branch** (`feat/signals-loop-s3`). The slug is the epic's name plus a
//      sprint suffix, so the directory lookup misses by three characters.
//
// Both degraded to the repo-root fallback trail, which does not exist, which renders as "no
// checkpoint" — the one output that cannot be distinguished from a genuinely fresh start. A staleness
// detector that reports "nothing here" when it simply looked in the wrong place is the failure this
// whole file argues against, one level up: the next reader stops there.
//
// The fix is ordered candidates, not a looser match. Case 2 is solved by stripping known sprint
// suffixes; case 1 cannot be solved from the branch at all and is handed to the caller as an
// explicit "search for the newest trail" instruction — which the caller must LABEL when it uses it,
// because a trail from the wrong epic is worse than no trail.

/**
 * Parse `git status --porcelain` into { dirty, untracked }.
 *
 * ── Why this is a tested function and not three lines at the call site ────────────────────────
 * It was three lines at the call site, and they silently corrupted the FIRST filename in every
 * checkpoint this rail has ever written. The caller's git helper ends with `.trim()` — reasonable
 * for the one-line outputs it also serves (`rev-parse`, `log -1`) — but porcelain encodes status in
 * fixed columns, and a modified-unstaged file is `" M path"` with a LEADING SPACE. Trimming the
 * whole blob strips that one space from the first line only, so a `slice(3)` that is correct for
 * every other line eats a character from the first: `scripts/…` was recorded as `cripts/…`,
 * `Roadmap/…` as `oadmap/…`, `apps/web/…` as `pps/web/…`.
 *
 * Every symptom pointed away from the cause. The corruption hit exactly one file per checkpoint, so
 * it read as a typo rather than a rule; and the drift detector compares recorded names against
 * current ones, so a mangled name reports as BOTH a vanished file and a new one — noise in the
 * section whose entire job is to be trusted. Four checkpoints in the live trail carry it.
 *
 * Kept as a pure function over the raw text so the fix has a test that fails against the old
 * behaviour, rather than a corrected `slice` that looks identical to the broken one.
 */
export function parsePorcelain(raw) {
  const dirty = [];
  const untracked = [];
  // Split on newlines only — never trim the blob. Each line is `XY<space>PATH`, so the path starts
  // at index 3 and any leading space in XY is DATA, not whitespace to be cleaned up.
  for (const line of String(raw ?? '').split('\n')) {
    if (line.length < 4) continue; // '' and any short/garbage line — never a valid entry
    const code = line.slice(0, 2);
    // Rename/copy entries are `R  old -> new`; record the destination, which is the path that
    // exists in the tree now and the one a later checkpoint will see.
    const path = line.slice(3).replace(/^.* -> /, '');
    if (!path) continue;
    if (code === '??') untracked.push(path);
    else dirty.push(path);
  }
  return { dirty, untracked };
}

/**
 * Epic-slug candidates for a branch, most specific first.
 *
 * `feat/signals-loop-s3` → ['signals-loop-s3', 'signals-loop']. The unsuffixed slug comes second, so
 * an epic genuinely named `...-s3` still wins over a coincidental prefix match.
 *
 * Returns [] when the branch names no epic (`main`, a detached HEAD) — the signal for the caller to
 * fall back to searching, rather than a guess dressed up as a match.
 */
export function epicSlugCandidates(branch) {
  const slug = (String(branch || '').match(/^(?:feat|fix|chore)\/(.+)$/) || [])[1];
  if (!slug) return [];
  const candidates = [slug];
  // Sprint suffixes this repo actually uses: `-s3`, `-sprint-3`, `-sprint3`. Anchored to the END and
  // requiring digits, so `feat/pod-report` is untouched and `feat/analytics` never becomes `analytic`.
  const stripped = slug.replace(/-(?:s|sprint-?)\d+$/, '');
  if (stripped !== slug && stripped) candidates.push(stripped);
  return candidates;
}

/** Splits a trail file into its checkpoint blocks, newest last. */
export function parseCheckpoints(markdown) {
  if (!markdown) return [];
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((block) => '## ' + block.trimEnd())
    .filter(Boolean);
}

/**
 * The re-entry briefing.
 *
 * Deliberately leads with DRIFT and not with the note. If the repository has moved since the trail
 * was written, that fact changes how everything below it should be read, and a reader who meets the
 * note first has already started trusting it.
 */
export function renderResume({ trail, checkpoint, drift, epicPath, inferred }) {
  const out = [];
  out.push('═══ SESSION TRAIL — re-entry briefing ═══', '');

  if (!checkpoint) {
    out.push('No checkpoint recorded yet.', '');
    // Where it LOOKED matters as much as what it found. The bug this line exists for reported
    // exactly this text while four checkpoints sat one directory away, and the reader had no way to
    // see that the search had missed rather than that the trail was empty.
    out.push(`(Looked in: ${trail})`, '');
    out.push(`Start one with:  node scripts/session-trail.mjs --checkpoint "<what you just did>"`);
    return out.join('\n');
  }

  out.push(`Trail:      ${trail}`);
  if (epicPath) out.push(`Epic:       ${epicPath}`);
  // A trail found by recency is a GUESS — the branch named no epic (typically `main`, which the
  // squash-merge rule makes the normal place to start a sprint), so this is the most recently
  // written trail, not a match. Say so before the note, not after: a reader who meets the note
  // first has already started trusting it, which is this whole file's founding argument.
  if (inferred === 'recency') {
    out.push('');
    out.push('⚠  This trail was found by RECENCY, not by a branch match — the current branch names');
    out.push('   no epic. It is the most recently written epic trail, which is usually right and is');
    out.push('   not verified. Confirm it is the epic you meant before acting on anything below,');
    out.push('   or re-run with --epic <slug>.');
  }
  out.push(`Last mark:  ${checkpoint.at}  on \`${checkpoint.branch}\` @ ${short(checkpoint.head)}`);
  out.push('');

  if (drift.hasDrift) {
    out.push(`⚠  THE REPOSITORY HAS MOVED SINCE THIS TRAIL WAS WRITTEN (${drift.severity} drift).`);
    out.push('   Read the note below as a description of an OLDER tree, and re-derive anything it');
    out.push('   claims before acting on it (Roadmap/LEARNINGS.md: re-derive a handover from the');
    out.push("   artifact, never from the previous session's summary).");
    out.push('');
    for (const r of drift.reasons) {
      out.push(`   [${r.severity}] ${r.kind}: ${r.detail}`);
    }
    out.push('');
  } else {
    out.push('✓  No drift — the working tree matches what the last checkpoint recorded.');
    out.push('   That means the note below still describes THIS tree. It does not mean the note is');
    out.push('   correct: an unverified claim is unverified whether or not the tree moved.');
    out.push('');
  }

  out.push('─── last checkpoint, verbatim ───', '');
  out.push(renderCheckpoint(checkpoint));

  out.push('─── suggested first moves ───', '');
  out.push("1. `git status --short` and `git diff HEAD` — see the real tree, not this file's memory.");
  out.push(
    '2. Re-run the gate rather than trusting a "green" claim: `npm run typecheck && npm run test:unit`.'
  );
  out.push('3. `git diff HEAD` for SOURCE files the last task had no business touching — a subagent that');
  out.push('   died mid-mutation leaves a real regression that reads as ordinary progress (LEARNINGS).');
  if (epicPath) out.push(`4. Read ${epicPath} for scope; this trail only covers what was IN FLIGHT.`);

  return out.join('\n');
}
