// gh-rest.mjs — REST-only GitHub API helpers, for environments where `gh`'s GraphQL proxying is
// unavailable.
//
// Confirmed live (2026-07-02, ops-nightly's Claude Routine sandbox): `gh pr list --json`, `gh pr view
// --json`, and `gh pr comment` all internally hit `https://api.github.com/graphql` — traced via
// `GH_DEBUG=api`. `gh run list/rerun` and any `gh api <rest-path>` call always use REST v3 regardless,
// and were unaffected. This module gives standup.mjs/weekly-recap.mjs/babysit-pr.mjs/build-order-sync.mjs
// REST-only equivalents for the operations they need, so they no longer depend on GraphQL being reachable.
//
// Normalizes every REST response into the SAME shape + casing the codebase's existing pure decision
// functions already expect (matching GraphQL's statusCheckRollup: UPPERCASE conclusion/state enums,
// camelCase detailsUrl, mergeable as a MergeableState-style string) — so decideBabysitActions() and the
// standup's failingOpen/conflictingOpen filters need NO changes, only the I/O layer feeding them does.
//
// Zero npm deps — Node >=20 (spawnSync). `gh api` takes GET query params and POST bodies as `-f key=value`
// pairs (safe: passed as argv, never shell-interpolated) for short payloads, or JSON piped via
// `--input -` for a comment/PR body that may be long or contain characters `-f` can't safely encode.

import { spawnSync } from 'node:child_process';

function ghApi(args, { input } = {}) {
  const r = spawnSync('gh', ['api', ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    input,
  });
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout || 'null');
  } catch {
    return null;
  }
}

// ---- pure normalizers (exported for unit testing without gh/network I/O) ----

// GitHub's REST `mergeable_state` (dirty|clean|unstable|has_hooks|unknown|…) → the same coarse
// MERGEABLE/CONFLICTING/UNKNOWN vocabulary the codebase's `mergeable === 'CONFLICTING'` checks expect
// (mirroring GraphQL's MergeableState enum, which only ever surfaced as one of those three in practice
// here). `unknown` means GitHub hasn't finished computing it yet — the caller retries, this just reports
// what it was handed.
export function mapMergeableState(mergeableState, mergeableBool) {
  if (mergeableState === 'dirty') return 'CONFLICTING';
  if (mergeableState === 'clean' || mergeableState === 'unstable' || mergeableState === 'has_hooks') {
    return 'MERGEABLE';
  }
  if (mergeableBool === false) return 'CONFLICTING';
  if (mergeableBool === true) return 'MERGEABLE';
  return 'UNKNOWN';
}

// Merges the legacy combined-status API + the modern check-runs API into ONE rollup list, normalized to
// look like a GraphQL statusCheckRollup entry: a check-run item carries {name, status, conclusion,
// detailsUrl} (status/conclusion uppercase, matching CheckStatusState/CheckConclusionState), a legacy
// status item carries {context, state, detailsUrl} (state uppercase, matching StatusState) — exactly the
// two shapes decideBabysitActions()/standup.mjs's failingOpen filter already branch on.
export function buildStatusRollup({ combinedStatus, checkRuns }) {
  const rollup = [];
  for (const s of combinedStatus?.statuses || []) {
    rollup.push({
      context: s.context,
      state: (s.state || '').toUpperCase(),
      detailsUrl: s.target_url || null,
    });
  }
  for (const c of checkRuns?.check_runs || []) {
    rollup.push({
      name: c.name,
      status: (c.status || '').toUpperCase(),
      conclusion: c.conclusion ? c.conclusion.toUpperCase() : null,
      detailsUrl: c.details_url || null,
    });
  }
  return rollup;
}

// REST pull-list item → the shape standup.mjs's gatherRepoPrs already builds `byNumber`/open/merged sets
// from (state OPEN/MERGED/CLOSED matching GraphQL's PullRequestState enum casing).
//
// `headRefName` (the PR's source branch) was added 2026-07-26 for session-resume.mjs's stray-branch check
// (README.md D3: "a non-main branch with no open PR") — it needs to correlate a repo's current local
// branch against open PRs by branch NAME, which the list endpoint already returns as `head.ref` but no
// existing consumer had asked for yet. Purely additive: every field standup.mjs/babysit-pr.mjs already
// read is unchanged.
export function normalizePullListItem(p) {
  return {
    number: p.number,
    title: p.title,
    state: p.state === 'open' ? 'OPEN' : p.merged_at ? 'MERGED' : 'CLOSED',
    isDraft: !!p.draft,
    mergedAt: p.merged_at,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    url: p.html_url,
    headSha: p.head?.sha || null,
    headRefName: p.head?.ref || null,
  };
}

// A GitHub Search API (`/search/issues`) item, scoped to `is:pr` → the {number, title, mergedAt, url}
// shape weekly-recap.mjs already expects.
export function normalizeSearchPrItem(it) {
  return {
    number: it.number,
    title: it.title,
    createdAt: it.created_at || null,
    mergedAt: it.pull_request?.merged_at || null,
    url: it.html_url,
  };
}

// ---- I/O (thin wrappers over `gh api`) ----

// GET /repos/{repo}/pulls?state=… — list PRs (title/state/draft/dates/url only; mergeable and check
// status are NOT included by the list endpoint — see getPullMergeability/getStatusRollup for those).
export function listPulls({ repo, state = 'all', perPage = 50 }) {
  const data = ghApi([
    `repos/${repo}/pulls`,
    '--method',
    'GET',
    '-f',
    `state=${state}`,
    '-f',
    `per_page=${perPage}`,
    '-f',
    'sort=updated',
    '-f',
    'direction=desc',
  ]);
  return data === null ? null : data.map(normalizePullListItem);
}

// search/issues — merged PRs with `merged_at >= sinceDate` (day-granular, same as the old GraphQL
// `merged:>=` search qualifier), optionally scoped to a base branch. Paginates up to maxItems.
export function searchMergedPrs({ repo, sinceDate, base, maxItems = 500 }) {
  const items = [];
  const perPage = 100;
  for (let page = 1; items.length < maxItems; page += 1) {
    const q = `repo:${repo} is:pr is:merged merged:>=${sinceDate}${base ? ` base:${base}` : ''}`;
    const data = ghApi([
      'search/issues',
      '--method',
      'GET',
      '-f',
      `q=${q}`,
      '-f',
      `per_page=${perPage}`,
      '-f',
      `page=${page}`,
    ]);
    if (data === null) return null;
    const pageItems = data.items || [];
    items.push(...pageItems);
    if (pageItems.length < perPage) break;
  }
  return items.slice(0, maxItems).map(normalizeSearchPrItem);
}

// GET /repos/{repo}/pulls/{number} — raw response, with GitHub's own documented retry-on-"unknown"
// pattern: `mergeable`/`mergeable_state` are computed ASYNCHRONOUSLY, so a just-fetched or just-updated
// PR can report `mergeable_state: "unknown"` on the first try. One retry (2s default) resolves it in
// practice (confirmed live); if it's still unknown after that, the caller gets 'unknown' back rather
// than this function guessing.
function fetchPullWithRetry({ repo, number, retries = 1, delayMs = 2000 }) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const data = ghApi([`repos/${repo}/pulls/${number}`, '--method', 'GET']);
    if (data === null) return null;
    if (data.mergeable_state !== 'unknown' || attempt === retries) return data;
    spawnSync('sleep', [String(delayMs / 1000)]);
  }
  return null; // unreachable — the loop always returns on its last iteration
}

// GET /repos/{repo}/pulls/{number} — just the mapped mergeable state (standup.mjs's use case).
export function getPullMergeability({ repo, number, retries = 1, delayMs = 2000 }) {
  const data = fetchPullWithRetry({ repo, number, retries, delayMs });
  return data === null ? null : mapMergeableState(data.mergeable_state, data.mergeable);
}

// GET /repos/{repo}/pulls/{number} — the fuller shape babysit-pr.mjs needs in one call: state
// (OPEN/CLOSED/MERGED, matching GraphQL's PullRequestState casing), headSha (for getStatusRollup), and
// the mapped mergeable state.
export function getPull({ repo, number, retries = 1, delayMs = 2000 }) {
  const data = fetchPullWithRetry({ repo, number, retries, delayMs });
  if (data === null) return null;
  return {
    number: data.number,
    state: data.state === 'open' ? 'OPEN' : data.merged_at ? 'MERGED' : 'CLOSED',
    url: data.html_url,
    headSha: data.head?.sha || null,
    mergeable: mapMergeableState(data.mergeable_state, data.mergeable),
  };
}

// GET commits/{sha}/status + commits/{sha}/check-runs, merged via buildStatusRollup(). `per_page=100`
// (GitHub's max) on check-runs — its default page size is 30, so an unpaginated call could silently miss
// failures past page 1 on a commit with many parallel jobs.
export function getStatusRollup({ repo, sha }) {
  const combinedStatus = ghApi([`repos/${repo}/commits/${sha}/status`, '--method', 'GET']);
  const checkRuns = ghApi([
    `repos/${repo}/commits/${sha}/check-runs`,
    '--method',
    'GET',
    '-f',
    'per_page=100',
  ]);
  // Fail closed on EITHER source failing, not just both — a PARTIAL rollup (one source real, the other
  // silently empty) is worse than no rollup at all, since it can misreport a genuine failure as "clean."
  // Callers treat a null rollup as "unavailable" (degrading to no-signal), never as "confirmed clean."
  if (combinedStatus === null || checkRuns === null) return null;
  return buildStatusRollup({ combinedStatus, checkRuns });
}

// POST /repos/{repo}/issues/{number}/comments — works for both issues and PRs (a PR IS an issue for
// this endpoint, same as `gh pr comment` used under the hood).
export function postIssueComment({ repo, number, body }) {
  const data = ghApi([`repos/${repo}/issues/${number}/comments`, '--method', 'POST', '--input', '-'], {
    input: JSON.stringify({ body }),
  });
  return data ? { url: data.html_url } : null;
}

// POST /repos/{repo}/pulls
export function createPullRequest({ repo, head, base, title, body }) {
  const data = ghApi([`repos/${repo}/pulls`, '--method', 'POST', '--input', '-'], {
    input: JSON.stringify({ head, base, title, body }),
  });
  return data ? { url: data.html_url, number: data.number } : null;
}
