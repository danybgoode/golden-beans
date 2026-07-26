#!/usr/bin/env node
// pod-report.mjs — gather the medusa-bonsai dataset and compute the Pod Report artifact.
//
// pod-report · Sprint 2, Story 2.1. This is the I/O half: it runs git and gh against a LOCAL
// medusa-bonsai checkout, hands the result to the pure `lib/pod-metrics.mjs` computation, and
// pushes the artifact through the same client-pushes rail Sprint 1 built.
//
//   node scripts/pod-report.mjs --repo ~/dobby/medusa-bonsai            # print the artifact
//   node scripts/pod-report.mjs --repo … --push                        # push it to the engine
//   node scripts/pod-report.mjs --repo … --out artifact.json           # write it to a file
//
// ── What this deliberately does NOT compute ───────────────────────────────────────────────────
// Velocity, cost-per-point, change-failure-rate and MTTR are absent by design, not by omission —
// see lib/pod-metrics.mjs's NOT_INSTRUMENTED list, which travels INSIDE the artifact so a renderer
// cannot drop the caveats. The dataset supports none of them, and a fabricated 0% change-failure
// rate would be the most flattering number on the page and the least true.
//
// ── Determinism ───────────────────────────────────────────────────────────────────────────────
// `--generated-at` exists so a rerun can produce a byte-identical artifact (Sprint 2's headline
// acceptance criterion). Without it the timestamp is the only field that differs between runs, and
// a determinism check that ignores one field is not a determinism check.

import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { die, need } from './lib/cross-agent-cli.mjs';
import { computeDelivery } from './lib/pod-metrics.mjs';
import { computeMaturityLens } from './lib/maturity-lens.mjs';

/** The artifact's payload contract version. Bump only alongside a renderer migration. */
export const POD_REPORT_SCHEMA_VERSION = 1;

function git(repo, args, { allowFail = true } = {}) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0 && !allowFail) die(`git ${args.slice(0, 2).join(' ')} failed in ${repo}`);
  return r.status === 0 ? (r.stdout || '').trim() : '';
}

/**
 * Commits, with whether each carries an agent co-author trailer.
 *
 * `%B` (the full body) rather than `%s`, because the trailer lives in the body — reading only the
 * subject would report 0% agent authorship across a repo that is 82% agent-co-authored, which is
 * both wrong and the exact opposite of the truth.
 *
 * The record separator is a literal control character rather than a newline because commit bodies
 * contain newlines; splitting on those would shred every multi-line message into fake commits.
 */
export function readCommits(repo, run = git) {
  const SEP = '\x1e'; // ASCII record separator — cannot occur in a commit message
  const raw = run(repo, ['log', '--no-merges', `--format=%H%x1f%ad%x1f%B${SEP}`, '--date=short']);
  return raw
    .split(SEP)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [sha, date, ...rest] = chunk.split('\x1f');
      const body = rest.join('\x1f');
      return {
        sha,
        date,
        // Matches the trailer with or without a model name ("Co-Authored-By: Claude Opus 4.8").
        agentCoAuthored: /^Co-Authored-By:\s*(?:Claude|OpenAI|GPT|Devin)/im.test(body ?? ''),
      };
    });
}

/**
 * Epics and their lifecycle dates, from the roadmap docs' own git history.
 *
 * `startedAt` is the first commit that touched the epic's README; `shippedAt` is the first commit
 * whose diff flipped `status:` to `shipped`. Both are real commit timestamps — no estimate, no
 * inferred date. An epic still in flight has a null `shippedAt` and is excluded from lead time
 * rather than counted as taking forever.
 */
export function readEpics(repo, run = git) {
  const readmes = run(repo, ['ls-files', 'Roadmap/*/*/README.md'])
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);

  return readmes.map((path) => {
    const slug = path.split('/').slice(-2, -1)[0];
    const startedAt =
      run(repo, ['log', '--diff-filter=A', '--format=%aI', '--reverse', '--', path])
        .split('\n')
        .filter(Boolean)[0] ?? null;

    // Find the commit that INTRODUCED `status: shipped`. `-S` with the literal string finds commits
    // where its occurrence count changed, which is exactly the flip we want — a plain `git log`
    // over the file would return every edit.
    const shippedAt =
      run(repo, ['log', '-S', 'status: shipped', '--format=%aI', '--reverse', '--', path])
        .split('\n')
        .filter(Boolean)[0] ?? null;

    return { slug, path, startedAt, shippedAt };
  });
}

/** Merged PRs via `gh`. Returns [] when gh is unavailable rather than failing the whole report. */
export function readPullRequests(repo, run = spawnSync) {
  const r = run(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'merged',
      '--limit',
      '500',
      // `comments`, `statusCheckRollup`, `headRefName` and `body` are NOT optional extras — the
      // maturity lens scores review presence, CI enforcement, parallel-branch isolation and
      // risk-tier discipline from exactly these fields. Requesting only the timestamps (as the
      // first version did) handed the lens 98 PRs with no comment data, which it correctly read as
      // "reviewed: no" — reporting a practice as ABSENT when the truth was that it was never
      // measured. A false `not_met` is still a false claim, even when it understates us.
      '--json',
      'number,createdAt,mergedAt,title,body,comments,statusCheckRollup,headRefName,mergedBy',
    ],
    { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  if (r.status !== 0) {
    process.stderr.write(
      '⚠ gh could not list pull requests — cycle time and the deploy-frequency proxy will be omitted.\n' +
        '  They will render as "not instrumented" rather than as zero.\n'
    );
    return [];
  }
  try {
    return JSON.parse(r.stdout || '[]');
  } catch {
    return [];
  }
}

/**
 * Patterns that identify a REVIEWER-AGENT comment.
 *
 * Detected by comment BODY, never by author identity, and that is forced by the data rather than a
 * preference: cross-agent review comments in this dataset are posted under the human maintainer's
 * own account (`user.type: "User"`), so there is no bot login to filter on. Filtering by author
 * would find zero reviewed PRs across a repo that reviews nearly all of them.
 */
const AGENT_REVIEW_PATTERNS = [
  /cross-agent review/i,
  /fresh-reviewer findings/i,
  /judgment-layer review/i,
  /\bcodex\b.{0,20}\breview\b/i,
];

/**
 * Adapt gh's PR shape to the shape the lens scores.
 *
 * This adapter is where a subtle dishonesty crept in and had to be fixed: the lens reads
 * `reviewComments[].isAgentReviewer` and `ciCheckNames`, while gh returns `comments[]` and
 * `statusCheckRollup[]`. Passing gh's raw shape meant the lens saw 98 PRs with no review data and
 * concluded the practice was ABSENT — a `not_met`, which asserts something stronger than
 * "not measured". The two must never be confused, in either direction.
 */
export function normalisePrForLens(pr) {
  const comments = Array.isArray(pr.comments) ? pr.comments : [];
  const checks = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
  const tier = parseRiskTier(pr.body);

  return {
    ...pr,
    reviewComments: comments.map((c) => ({
      ...c,
      isAgentReviewer: AGENT_REVIEW_PATTERNS.some((re) => re.test(c?.body ?? '')),
    })),
    ciCheckNames: checks.map((c) => c?.name).filter(Boolean),

    // ── The three fields cross-review caught missing (PR #32, round 2) ────────────────────────
    // `readPullRequests` was already fetching the data these need, and the adapter simply did not
    // map it — so the risk-tier and self-verification criteria read `not_instrumented` on every
    // real repo, capping the ladder at step 1. Exactly the bug class fixed once already in round 1
    // (fetch the data, forget to map it), caught a second time in a different place.
    //
    // Each stays UNDEFINED when genuinely unknowable, never guessed: undefined means "not
    // measured" to the lens, while a wrong default would be a claim.
    riskTier: tier,
    // Only meaningful once a PR is merged. `is_bot` is GitHub's own flag; an agent merging through
    // a human's account is indistinguishable from the human here, and this proxy says so rather
    // than pretending otherwise.
    mergedByIsAgent: pr.mergedAt && pr.mergedBy ? pr.mergedBy.is_bot === true : undefined,
    // Undefined rather than false when NO checks are attached: "this PR ran no checks" and "we
    // don't know whether checks passed" are different facts, and false would assert the first.
    ciPassedBeforeMerge: checks.length > 0 ? checks.every((c) => checkSucceeded(c)) : undefined,
  };
}

/**
 * Pull a declared risk tier out of a PR body.
 *
 * Two spellings, because the dataset genuinely contains both: this repo's template writes
 * `Risk tier:` while the sibling roadmap docs write `**Risk:** LOW`. Coverage is PARTIAL by nature —
 * many PR bodies declare no tier at all — and that is fine: an undeclared tier yields `undefined`,
 * the lens counts only the PRs that did declare one, and nothing is inferred for the rest.
 */
/** Filenames that count as encoded standards, in the order they are preferred. */
export const STANDARDS_FILES = ['CLAUDE.md', 'AGENTS.md'];

/** True when a check reports success, whichever of the two GitHub shapes it uses. */
export function checkSucceeded(check) {
  return String(check?.conclusion ?? check?.state ?? '').toUpperCase() === 'SUCCESS';
}

export function parseRiskTier(body) {
  const m =
    /risk\s*tier\s*[:*]*\s*\**(LOW|MED|MEDIUM|HIGH)|\*\*risk:?\*\*\s*:?\s*(LOW|MED|MEDIUM|HIGH)/i.exec(
      body ?? ''
    );
  if (!m) return undefined;
  const raw = (m[1] || m[2]).toUpperCase();
  return raw === 'MEDIUM' ? 'MED' : raw;
}

/** Whole-history window in days, from the first commit to the last. */
export function windowDays(commits) {
  const dates = commits.map((c) => Date.parse(c.date)).filter((n) => Number.isFinite(n));
  if (dates.length === 0) return 0;
  return Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / 86_400_000));
}

/**
 * The benchmark citations Story 2.3 requires.
 *
 * CITED AND LINKED, never republished: we state what the published level is and where to read it,
 * and we do not reproduce anyone's table. Version-pinned by date so an old artifact stays
 * interpretable against the benchmark it was actually scored against.
 */
export const BENCHMARKS = [
  {
    id: 'dora-2025',
    label: 'DORA — Accelerate State of DevOps 2025',
    url: 'https://dora.dev/research/',
    note: 'Elite performers: change lead time under one day; deployment frequency on demand. Cited, not republished.',
  },
  {
    id: 'linearb-2026',
    label: 'LinearB Engineering Benchmarks 2026',
    url: 'https://linearb.io/resources/engineering-benchmarks',
    note: 'Elite PR cycle time is measured in hours, not days. Cited, not republished.',
  },
  {
    id: 'dx-core-4',
    label: 'DX Core 4',
    url: 'https://getdx.com/research/',
    note: 'Speed, effectiveness, quality and impact are reported together — never speed alone.',
  },
];

export function buildArtifact({ delivery, source, generatedAt, maturity }) {
  return {
    schemaVersion: POD_REPORT_SCHEMA_VERSION,
    generatedAt,
    source,
    delivery,
    benchmarks: BENCHMARKS,
    ...(maturity ? { maturity } : {}),
    // Travels INSIDE the artifact so a renderer cannot silently drop it. The epic's whole ethic:
    // speed is never shown without the honesty about what is not measured.
    caveats: [
      "Every number here is computed from this repository's own git and pull-request history. Nothing is estimated.",
      'The comparison baseline is PUBLISHED BENCHMARKS, not an internal human-era baseline: this dataset has no human-majority era to compare against.',
      'Metrics listed as "not instrumented" are absent because the data cannot support them — not because they are zero.',
    ],
  };
}

function main() {
  const args = process.argv.slice(2);
  let repo = process.env.MEDUSA_BONSAI_PATH || `${process.env.HOME}/dobby/medusa-bonsai`;
  let out, generatedAt;
  let push = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo') repo = need(args[++i], '--repo');
    else if (args[i] === '--out') out = need(args[++i], '--out');
    else if (args[i] === '--generated-at') generatedAt = need(args[++i], '--generated-at');
    else if (args[i] === '--push') push = true;
    else die(`unknown arg ${args[i]}`);
  }

  repo = resolve(repo.replace(/^~/, process.env.HOME ?? '~'));
  if (!existsSync(repo)) {
    die(
      `no checkout at ${repo}. Sprint 2 needs a local medusa-bonsai clone — pass --repo <path> ` +
        `or set MEDUSA_BONSAI_PATH.`
    );
  }

  const commits = readCommits(repo);
  if (commits.length === 0) die(`no commits found in ${repo} — is it a git checkout?`);

  const epics = readEpics(repo);
  const prs = readPullRequests(repo);
  const days = windowDays(commits);

  // Story 2.4 — the maturity lens, computed from the SAME inputs Story 2.1 already loaded. No new
  // data source, per the amendment: what cannot be derived from git/PR data renders as
  // "not instrumented" rather than being gathered from somewhere new.
  // Pass ONLY what was genuinely gathered. `undefined` means "not measured" and the lens renders it
  // as not-instrumented; an empty array would mean "measured, found none" and would render as
  // not_met — a stronger claim than the data supports. That distinction is the whole point of this
  // epic, and it is why `skillsProvenance` is undefined rather than [].
  //
  // No top-level `ciCheckNames`: the scorers read it PER PR (`input.prs[i].ciCheckNames`), which
  // normalisePrForLens sets. Passing it at the top level as well looked reassuring and did nothing
  // — cross-review caught the dead argument.
  const maturity = computeMaturityLens({
    prs: prs.map(normalisePrForLens),
    commits,
    // BOTH, and each carries a distinct fact. `hasClaudeMd` is the measured-ness signal — a real
    // boolean means "we looked", and its absence means "we did not", which is the not_met vs
    // not_instrumented distinction this whole epic turns on. `standardsFile` names WHICH file was
    // found, so the evidence pointer resolves: a pointer reading "CLAUDE.md" for a repo whose file
    // is AGENTS.md does not resolve, quietly breaking the lens's central promise (round 3).
    //
    // Collapsing these two into one field was tried first and regressed the row from not_met to
    // not_instrumented — turning "we checked and there is none" back into "we never checked".
    hasClaudeMd: STANDARDS_FILES.some((f) => existsSync(`${repo}/${f}`)),
    standardsFile: STANDARDS_FILES.find((f) => existsSync(`${repo}/${f}`)),
    skillsProvenance: undefined,
  });

  const artifact = buildArtifact({
    maturity,
    delivery: computeDelivery({
      prs,
      epics,
      commits,
      windowDays: days,
      generatedAt: generatedAt ?? new Date().toISOString(),
    }),
    source: {
      repo: 'medusa-bonsai',
      commits: commits.length,
      epics: epics.length,
      mergedPrs: prs.length,
      windowDays: days,
    },
    generatedAt: generatedAt ?? new Date().toISOString(),
  });

  const json = JSON.stringify(artifact, null, 2);
  if (out) {
    writeFileSync(out, `${json}\n`);
    process.stderr.write(`✓ wrote ${out}\n`);
  } else {
    writeSync(1, `${json}\n`);
  }

  if (push) {
    process.stderr.write(
      '⚠ --push is not wired yet: the pod_report artifact kind rides the same rail as roadmap ' +
        'pushes (Story 1.1), and wiring it is Story 2.2. Printing the artifact instead.\n'
    );
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
