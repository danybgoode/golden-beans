// prose-guard.mjs — a PURE, mechanical check on machine-drafted prose before it reaches a human.
//
// ── Why this exists ───────────────────────────────────────────────────────────────────────────
// Prompt instructions reduce hallucination; they do not eliminate it. Measured on this repo's own
// commit-report rail (2026-07-25), a cheap model given a dense engineering commit produced material
// falsehoods on two of its first three runs: it invented customer impact for internal tooling, and
// it claimed a commit had FIXED an open-redirect bug when the commit only added tests for a fix
// that shipped weeks earlier. Both read as confident good news, which is exactly what makes them
// dangerous in a channel treated as status.
//
// A guard cannot verify truth. What it CAN do is catch the specific, recurring shapes those
// failures take, and hand them back to the writer as a concrete revision note. That converts a
// silent falsehood into a retry with a named problem — which is the difference between "usually
// fine" and "fails loudly when it isn't".
//
// Everything here is pure and unit-tested. It runs on every draft regardless of which model wrote
// it, so promoting or swapping the writer never silently drops the check.

/**
 * Marketing vocabulary that signals the model has drifted from reporting into selling. Each one is
 * a word that adds emphasis without adding information — the tell that a sentence is decorating a
 * fact rather than stating one.
 */
export const BANNED_PHRASES = [
  'seamless',
  'seamlessly',
  'robust',
  'leverage',
  'leverages',
  'unlock',
  'unlocks',
  'empower',
  'empowers',
  'delighted',
  'excited to announce',
  'game-changing',
  'game changer',
  'revolutionary',
  'cutting-edge',
  'best-in-class',
  'world-class',
  'supercharge',
  'effortless',
  'blazing fast',
];

/**
 * Implementation nouns the reader either already knows or does not need. The brief says the
 * engineering story is already in the commit; naming the stack is the most common way a draft
 * slides back into being an engineering report.
 *
 * Matched on word boundaries so ordinary words are never caught — "next" the adverb must not trip
 * the "Next.js" rule, and "react" the verb must not trip the React rule.
 */
export const BANNED_TOOL_NAMES = [
  'playwright',
  'next\\.js',
  'nextjs',
  'supabase',
  'postgres',
  'postgresql',
  'vercel',
  'gemini',
  'gpt',
  'claude',
  'devin',
  'antigravity',
  'typescript',
  'javascript',
  'eslint',
  'prettier',
  'node\\.js',
  'github actions',
  'telegram',
  // DELIBERATELY ABSENT: 'react' and 'next' on their own. Both are ordinary English words —
  // "the page does not react to a stale value", "whoever ships next" — and a guard that rejects a
  // correct sentence is worse than one that misses a rare mention: it teaches whoever maintains
  // this to bypass the check. `next\.js` above still catches the framework by its real name.
];

/**
 * Phrasings that assert a FIX, in the past tense, as an accomplished outcome.
 *
 * These are not banned outright — a change that genuinely fixes something should say so. They are
 * flagged only when the source data gives no evidence of a fix (see `checkProse`'s `claimsFix`
 * logic), because the observed failure was a draft asserting a fix that a DIFFERENT, earlier change
 * had made. Commit messages here routinely cite past incidents to explain why present work matters,
 * and a cheap model cannot reliably tell "we fixed X" from "X was fixed once, so we now test for it".
 */
const FIX_CLAIM_PATTERNS = [
  // Includes the -ING form on purpose. The real failing draft read "…is blocked, ELIMINATING a
  // potential open-redirect attack" — a participle, not a finite verb, and an earlier version of
  // this list matched only `eliminated|eliminates` and sailed straight past the exact sentence it
  // was written to catch. A claim is a claim whatever its inflection.
  /\b(?:fix(?:ed|es|ing)|resolv(?:ed|es|ing)|patch(?:ed|es|ing)|clos(?:ed|es|ing)|eliminat(?:ed|es|ing)|prevent(?:ed|s|ing)|remov(?:ed|es|ing))\b/i,
  /\bno longer (?:vulnerable|possible|happens|occurs|breaks|fails)\b/i,
  // The passive shape: the subject is the defect, and something has been done to it.
  /\b(?:bug|vulnerability|exploit|attack|bypass|breach|leak|regression)\b[^.]{0,60}\b(?:blocked|closed|removed|gone|impossible|shut)\b/i,
  /\b(?:blocked|closed|removed|gone|impossible)\b[^.]{0,60}\b(?:bug|vulnerability|exploit|attack|bypass|breach|leak|regression)\b/i,
  /\bis now (?:secure|safe|protected|impossible)\b/i,
];

/**
 * Invented commitments — the THIRD measured failure mode (2026-07-25, the standup rail's first
 * live run).
 *
 * The draft ended: _"design sign-off on the Sprint 2 layout is owed before tomorrow"_. No such
 * commitment exists anywhere in the source data; the model manufactured a deadline and an owner
 * because a standup usually has one. This is more corrosive than the other two failures — a report
 * that invents obligations makes people chase work nobody agreed to, and it is completely
 * plausible on its face.
 *
 * Git history contains no deadlines, so ANY future-dated commitment in a git-derived report is
 * fabricated by construction. Flagged unconditionally, with no evidence flag to unlock it.
 */
const INVENTED_COMMITMENT_PATTERNS = [
  /\b(?:by|before|due|no later than)\s+(?:tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|end of (?:day|week|month|the week)|eod|eow)\b/i,
  /\b(?:deadline|sign-?off|approval)\b[^.]{0,40}\b(?:owed|due|required|needed|pending)\b/i,
  /\b(?:owed|due|scheduled|slated|planned)\b\s+(?:for\s+)?(?:tomorrow|today|next week|this week|monday|friday)\b/i,
  /\bwill (?:ship|land|be (?:ready|done|live))\b[^.]{0,30}\b(?:tomorrow|today|next week|this week|by)\b/i,
];

/** Claims of customer/tenant/user impact — the second measured failure mode. */
const BENEFICIARY_PATTERNS = [
  /\b(?:customers?|tenants?|users?|clients?|buyers?|merchants?|shoppers?|subscribers?)\b/i,
];

/**
 * Sentence-final punctuation, or a close-paren/quote after it. Used to detect a draft that ran out
 * of room mid-clause — a trailing fragment reads as a broken tool, not as brevity.
 */
function endsCleanly(text) {
  return /[.!?]["')\]]?\s*$/.test(text.trim());
}

/** Split into sentences well enough to count them. Not linguistics — just a length sanity check. */
export function countSentences(text) {
  return (String(text ?? '').match(/[^.!?]+[.!?]/g) ?? []).length;
}

export function countWords(text) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Check a draft against the mechanical rules.
 *
 * `evidence` describes what the SOURCE DATA actually supports, so the guard can distinguish a
 * legitimate claim from an invented one:
 *   - `allowsFixClaim`   — the change genuinely fixes something (e.g. the commit subject is a
 *                          `fix:`). When false, past-tense fix language is a finding.
 *   - `allowsBeneficiary`— the change plausibly touches a customer-visible surface. When false,
 *                          naming customers/tenants/users is a finding.
 *   - `maxWords`         — the length budget for this surface.
 *
 * Returns `{ ok, findings }`. Each finding carries a `note` written to be handed straight back to
 * the writer as a revision instruction — a guard that only says "rejected" produces another
 * guess; one that says what is wrong produces a correction.
 */
export function checkProse(draft, evidence = {}) {
  const { allowsFixClaim = false, allowsBeneficiary = false, maxWords = 60, minWords = 8 } = evidence;
  const text = String(draft ?? '').trim();
  const findings = [];

  if (!text) {
    return { ok: false, findings: [{ code: 'empty', note: 'The draft is empty. Write the report.' }] };
  }

  const words = countWords(text);
  if (words > maxWords) {
    findings.push({
      code: 'too-long',
      note: `The draft is ${words} words; the limit is ${maxWords}. Cut it down — decide what the single point is and say only that.`,
    });
  }
  if (words < minWords) {
    findings.push({
      code: 'too-short',
      note: `The draft is only ${words} words. That is not a report — say who is affected and what changed for them.`,
    });
  }

  if (!endsCleanly(text)) {
    findings.push({
      code: 'unfinished',
      note: 'The last sentence is unfinished. End on a complete sentence — stop at the previous full stop rather than starting a clause you cannot complete.',
    });
  }

  const lower = text.toLowerCase();

  const banned = BANNED_PHRASES.filter((p) =>
    new RegExp(`\\b${p.replace(/[-\s]/g, '[-\\s]')}\\b`, 'i').test(lower)
  );
  if (banned.length) {
    findings.push({
      code: 'marketing-language',
      note: `Remove marketing words and state the fact plainly: ${banned.join(', ')}.`,
    });
  }

  const tools = BANNED_TOOL_NAMES.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(lower));
  if (tools.length) {
    findings.push({
      code: 'names-implementation',
      note: `Do not name tools, frameworks or models — the reader either knows them or does not need them. Found: ${tools.map((t) => t.replace(/\\/g, '')).join(', ')}.`,
    });
  }

  if (!allowsFixClaim) {
    const claimed = FIX_CLAIM_PATTERNS.some((re) => re.test(text));
    if (claimed) {
      findings.push({
        code: 'unsupported-fix-claim',
        note:
          'The draft claims something was fixed, resolved or prevented, but the source data does not show this change making that fix. ' +
          'Commit messages here often mention a PAST incident to explain why the present work matters — that is context, never the outcome. ' +
          'Describe what this change itself did.',
      });
    }
  }

  // Unconditional: git history contains no deadlines, so a future-dated commitment in a git-derived
  // report is fabricated by construction. There is no evidence flag that could legitimately unlock
  // it, which is why this check sits outside the `allows*` gates.
  if (INVENTED_COMMITMENT_PATTERNS.some((re) => re.test(text))) {
    findings.push({
      code: 'invented-commitment',
      note:
        'The draft states a deadline, due date or sign-off that appears nowhere in the source data. ' +
        'Commits and roadmap docs contain no deadlines, so any date or commitment here is invented — ' +
        'and a report that manufactures obligations makes people chase work nobody agreed to. ' +
        'Remove it. If something is genuinely owed, say what and to whom, with no date attached.',
    });
  }

  if (!allowsBeneficiary) {
    const named = BENEFICIARY_PATTERNS.some((re) => re.test(text));
    if (named) {
      findings.push({
        code: 'invented-beneficiary',
        note:
          'The draft names customers/tenants/users, but this change does not touch a surface they can observe. ' +
          'Say plainly that it is internal, and name the real beneficiary and the real effect — a bug class that can no longer reach production, ' +
          'a mistake caught in seconds instead of after a deploy.',
      });
    }
  }

  return { ok: findings.length === 0, findings };
}

/** Render findings as a revision instruction to hand back to the writer on a retry. */
export function findingsToRevisionNote(findings) {
  return [
    'Your previous draft was rejected by an automated check. Fix EVERY point below and rewrite it in full.',
    '',
    ...findings.map((f, i) => `${i + 1}. ${f.note}`),
    '',
    'Output only the corrected report — no preamble, no explanation of the changes.',
  ].join('\n');
}
