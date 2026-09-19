#!/usr/bin/env node
// vercel-prune-previews.mjs — delete stale PREVIEW deployments for a Vercel project.
//
// Why: Vercel retains every deployment forever. Deleting a merged git branch does NOT remove its
// preview deployments — they linger as clutter (a deleted branch can leave a dozen). This prunes
// them. It NEVER touches production deployments (your rollback history) — only `target !== production`.
//
// Usage:
//   node scripts/vercel-prune-previews.mjs --project <name>            # DRY-RUN, all previews
//   node scripts/vercel-prune-previews.mjs --project <name> --age 7    # only previews older than 7 days
//   node scripts/vercel-prune-previews.mjs --project <name> --apply    # actually delete (dry-run is the default)
//   node scripts/vercel-prune-previews.mjs --project <name> --keep-branch feat/x,feat/y  # protect open-PR branches
//
// `--project` is REQUIRED and has no default. An earlier version defaulted to the origin project's
// name, which meant a fresh checkout ran confidently against SOMEONE ELSE'S Vercel project — a
// wrong-target delete is exactly the failure a default should never be able to cause.
//
// ALWAYS pass --keep-branch for any branch that still has an OPEN PR (its preview is the live review
// target) — or just run after that PR merges. Production deployments are never touched.
//
// Token resolution (first that works): VERCEL_API_TOKEN / VERCEL_TOKEN env, else the local Vercel
// CLI login (auth.json). Team: VERCEL_TEAM_ID env, else auto-detected from the account's first team.
// Zero npm deps — Node 18+ (global fetch).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.vercel.com';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}
const PROJECT_ARG = arg('project');
if (!PROJECT_ARG || PROJECT_ARG === true) {
  console.error('vercel-prune-previews: --project <name> is required (no default, by design).');
  console.error('  Pass the Vercel project this repo deploys to. There is deliberately no fallback:');
  console.error('  a defaulted project name means pruning whatever project the default happens to');
  console.error('  point at, which is a destructive no-op at best and the wrong target at worst.');
  process.exit(2);
}
const PROJECT = String(PROJECT_ARG);
const AGE_DAYS = Number(arg('age', 0)); // delete previews strictly older than this many days
const APPLY = !!arg('apply', false); // dry-run unless --apply
const KEEP = new Set(
  String(arg('keep-branch', '') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

function resolveToken() {
  if (process.env.VERCEL_API_TOKEN) return process.env.VERCEL_API_TOKEN;
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const candidates = [
    join(process.env.HOME || '', 'Library/Application Support/com.vercel.cli/auth.json'),
    join(
      process.env.XDG_DATA_HOME || join(process.env.HOME || '', '.local/share'),
      'com.vercel.cli/auth.json'
    ),
    join(process.env.HOME || '', '.vercel/auth.json'),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const t = JSON.parse(readFileSync(p, 'utf8')).token;
        if (t) return t;
      }
    } catch {}
  }
  console.error('No Vercel token: set VERCEL_API_TOKEN or run `vercel login`.');
  process.exit(1);
}
const TOKEN = resolveToken();
const H = { Authorization: `Bearer ${TOKEN}` };

async function api(path) {
  const r = await fetch(`${API}${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} → ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

async function resolveTeamId() {
  if (process.env.VERCEL_TEAM_ID) return process.env.VERCEL_TEAM_ID;
  const j = await api('/v2/teams');
  return j.teams && j.teams[0] && j.teams[0].id ? j.teams[0].id : '';
}

(async () => {
  const teamId = await resolveTeamId();
  const tq = teamId ? `teamId=${teamId}` : '';
  const proj = await api(`/v9/projects/${PROJECT}?${tq}`);
  const projectId = proj.id;

  // Page all deployments; keep only previews (target !== 'production').
  const now = Date.now();
  let until,
    previews = [],
    total = 0;
  for (let i = 0; i < 100; i++) {
    const j = await api(
      `/v6/deployments?projectId=${projectId}&${tq}&limit=100${until ? `&until=${until}` : ''}`
    );
    if (!j.deployments || !j.deployments.length) break;
    total += j.deployments.length;
    for (const d of j.deployments) {
      if (d.target === 'production') continue; // never touch production
      if (['BUILDING', 'QUEUED', 'INITIALIZING'].includes(d.state)) continue; // skip in-flight
      const branch = (d.meta && (d.meta.githubCommitRef || d.meta.gitBranch)) || '(unknown)';
      if (KEEP.has(branch)) continue; // protect live / open-PR branches
      const ageDays = (now - d.created) / 86400000;
      if (ageDays >= AGE_DAYS) previews.push({ id: d.uid, age: ageDays, branch });
    }
    if (!j.pagination || !j.pagination.next) break;
    until = j.pagination.next;
  }

  console.log(`Project ${PROJECT} (${projectId}) — scanned ${total} deployments.`);
  console.log(
    `Preview deployments to remove (target!=production${AGE_DAYS ? `, older than ${AGE_DAYS}d` : ''}): ${previews.length}`
  );
  const byBranch = {};
  for (const p of previews) byBranch[p.branch] = (byBranch[p.branch] || 0) + 1;
  Object.entries(byBranch)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .forEach(([b, n]) => console.log(`  ${String(n).padStart(3)}  ${b}`));

  if (!previews.length) {
    console.log('Nothing to prune.');
    return;
  }
  if (!APPLY) {
    console.log('\nDRY-RUN — re-run with --apply to delete the above.');
    return;
  }

  console.log(`\nDeleting ${previews.length} preview deployments…`);
  let ok = 0,
    fail = 0,
    idx = 0;
  const worker = async () => {
    while (idx < previews.length) {
      const p = previews[idx++];
      try {
        const r = await fetch(`${API}/v13/deployments/${p.id}?${tq}`, { method: 'DELETE', headers: H });
        if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
        ok++;
      } catch (e) {
        fail++;
        console.error(`  ! ${p.id} (${p.branch}): ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker)); // small concurrency pool
  console.log(`Done — deleted ${ok}, failed ${fail}.`);
  if (fail) process.exit(1);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
