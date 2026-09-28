#!/usr/bin/env node
// vercel-env.mjs — set + verify Vercel project env vars via the REST API.
//
// Why a script: the Vercel CLI (`vercel env add`) SILENTLY stores EMPTY values (both stdin-pipe and
// --value), and `vercel env pull` redacts every value to "" so it can't verify either (learned the hard
// way in the origin project, 2026-06-06). The reliable path is the REST API:
//   • update = DELETE the existing var, then POST a fresh one (PATCH doesn't reliably update the value).
//   • verify = read the value back (the single-entry endpoint decrypts; the list endpoint never does,
//     even with ?decrypt=true) and confirm by LENGTH — enough to prove a non-empty, right-sized value
//     landed without echoing the secret.
//
// Usage:
//   node scripts/vercel-env.mjs set <KEY> <value> [--env production|preview|development]
//   node scripts/vercel-env.mjs verify <KEY>
//   node scripts/vercel-env.mjs delete <KEY> [--env ...]
//
// Reads VERCEL_API_TOKEN + VERCEL_PROJECT_ID from env (VERCEL_TEAM_ID optional — tokens are team-aware;
// a team-owned project needs ?teamId=). Zero npm deps — Node 18+ (global fetch).

const API = 'https://api.vercel.com';
const TARGETS = ['production', 'preview', 'development'];

const HELP = `vercel-env.mjs — set + verify Vercel project env vars via the REST API (never the CLI).

Usage:
  node scripts/vercel-env.mjs set <KEY> <value> [--env production|preview|development]
  node scripts/vercel-env.mjs verify <KEY>
  node scripts/vercel-env.mjs delete <KEY> [--env ...]

Commands:
  set     create or update KEY (update = DELETE then POST; PATCH is unreliable)
  verify  report each entry's targets/type/updated-at + the value LENGTH (pull redacts, so
          length is the round-trip confirmation signal)
  delete  remove KEY's entries (only those covering the --env targets, when given)

Flags:
  --env <target>   repeatable or comma-separated; default: all three targets
  -h, --help       show this help

Env: VERCEL_API_TOKEN (required), VERCEL_PROJECT_ID (required), VERCEL_TEAM_ID (optional).`;

function die(msg) {
  process.stderr.write(`✗ ${msg}\n`);
  process.exit(1);
}

function envOrDie(name) {
  const v = process.env[name];
  if (!v) die(`${name} is not set — export it (the project's .env.local holds its values).`);
  return v;
}

function parseArgs(argv) {
  const out = { cmd: null, key: null, value: null, envs: [], help: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--env') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('-')) die('--env requires a value');
      out.envs.push(...v.split(','));
    } else if (a.startsWith('--env=')) out.envs.push(...a.slice('--env='.length).split(','));
    else if (a.startsWith('-')) die(`unknown flag '${a}' (try --help)`);
    else pos.push(a);
  }
  [out.cmd, out.key, out.value] = pos;
  const arity = { set: 3, verify: 2, delete: 2 };
  if (out.cmd && arity[out.cmd] !== undefined && pos.length > arity[out.cmd]) {
    die(`unexpected extra argument '${pos[arity[out.cmd]]}' for ${out.cmd} (try --help)`);
  }
  for (const e of out.envs) {
    if (!TARGETS.includes(e)) die(`invalid --env '${e}' — use ${TARGETS.join('|')}`);
  }
  return out;
}

function teamQuery(extra = {}) {
  const params = new URLSearchParams(extra);
  if (process.env.VERCEL_TEAM_ID) params.set('teamId', process.env.VERCEL_TEAM_ID);
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function api(method, path, { query = {}, body } = {}) {
  const res = await fetch(`${API}${path}${teamQuery(query)}`, {
    method,
    headers: {
      Authorization: `Bearer ${envOrDie('VERCEL_API_TOKEN')}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    throw new Error(`${method} ${path} failed: ${msg}`);
  }
  return json;
}

async function listEnvs(projectId) {
  const json = await api('GET', `/v9/projects/${projectId}/env`);
  return json.envs || [];
}

// The list endpoint returns the ENCRYPTED blob even with ?decrypt=true — only the single-entry
// endpoint decrypts (response carries decrypted:true and the real value).
async function getDecrypted(projectId, envId) {
  return api('GET', `/v1/projects/${projectId}/env/${envId}`);
}

function entriesForKey(envs, key) {
  return envs.filter((e) => e.key === key);
}

const targetsOf = (e) => (Array.isArray(e.target) ? e.target : [e.target]);

// Remove `targets` from an existing entry without dropping the rest of its coverage: an entry
// spanning [production,preview,development] hit by `--env preview` must keep production+development.
// Vercel has no per-target detach, so the remainder is re-created with the entry's decrypted value;
// if that value can't be read back, abort BEFORE deleting rather than silently shrink coverage.
async function removeTargets(projectId, entry, targets) {
  const remaining = targetsOf(entry).filter((t) => !targets.includes(t));
  if (remaining.length) {
    const full = await getDecrypted(projectId, entry.id);
    if (!full.decrypted || typeof full.value !== 'string') {
      die(
        `${entry.key} also covers [${remaining.join(',')}] and its value can't be decrypted to preserve ` +
          `them — re-run against all of [${targetsOf(entry).join(',')}] instead.`
      );
    }
    await api('DELETE', `/v9/projects/${projectId}/env/${entry.id}`);
    await api('POST', `/v10/projects/${projectId}/env`, {
      body: { key: entry.key, value: full.value, type: entry.type || 'encrypted', target: remaining },
    });
    process.stderr.write(`  kept ${entry.key} [${remaining.join(',')}] (re-created with its existing value)\n`);
  } else {
    await api('DELETE', `/v9/projects/${projectId}/env/${entry.id}`);
  }
}

function fmtEntry(e, len) {
  const targets = (Array.isArray(e.target) ? e.target : [e.target]).join(',');
  const updated = e.updatedAt ? new Date(e.updatedAt).toISOString() : '?';
  return `  ${e.key}  [${targets}]  type=${e.type}  updated=${updated}  ${len}`.trimEnd();
}

async function cmdSet(projectId, key, value, envs) {
  if (!key) die('set requires <KEY>. Usage: set <KEY> <value> [--env ...]');
  if (value === undefined) die(`set requires a <value> for ${key} (an empty value is exactly the CLI bug this script avoids).`);
  if (value === '') die('refusing to set an EMPTY value — that is the silent-failure mode this script exists to prevent.');
  const targets = envs.length ? envs : [...TARGETS];

  // Update = DELETE existing entries whose targets overlap, then POST fresh (PATCH is unreliable).
  // Partial overlap keeps its non-target coverage (see removeTargets).
  const existing = entriesForKey(await listEnvs(projectId), key);
  const overlapping = existing.filter((e) => targetsOf(e).some((t) => targets.includes(t)));
  for (const e of overlapping) {
    await removeTargets(projectId, e, targets);
    process.stderr.write(`  removed existing ${key} [${targetsOf(e).filter((t) => targets.includes(t)).join(',')}]\n`);
  }

  await api('POST', `/v10/projects/${projectId}/env`, {
    body: { key, value, type: 'encrypted', target: targets },
  });
  process.stderr.write(`✓ set ${key} [${targets.join(',')}] (value length ${value.length})\n`);
  process.stderr.write(`  run \`verify ${key}\` to round-trip the stored length.\n`);
}

async function cmdVerify(projectId, key) {
  if (!key) die('verify requires <KEY>.');
  const entries = entriesForKey(await listEnvs(projectId), key);
  if (!entries.length) die(`${key} is not set on project ${projectId}.`);
  process.stdout.write(`${key} — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}:\n`);
  let empty = false;
  for (const e of entries) {
    let len;
    try {
      const full = await getDecrypted(projectId, e.id);
      if (full.decrypted && typeof full.value === 'string') {
        len = `length=${full.value.length}`;
        if (full.value === '') empty = true;
      } else {
        len = 'length unavailable (token cannot decrypt this entry)';
      }
    } catch (err) {
      len = `length unavailable (${err.message})`;
    }
    process.stdout.write(fmtEntry(e, len) + '\n');
  }
  if (empty) {
    die(`${key} has an EMPTY value entry — the exact silent-failure this script guards against. Re-run set.`);
  }
}

async function cmdDelete(projectId, key, envs) {
  if (!key) die('delete requires <KEY>.');
  const entries = entriesForKey(await listEnvs(projectId), key);
  if (!entries.length) die(`${key} is not set on project ${projectId} — nothing to delete.`);
  const targets = envs.length ? envs : [...TARGETS];
  let n = 0;
  for (const e of entries) {
    const hit = targetsOf(e).filter((t) => targets.includes(t));
    if (!hit.length) continue;
    await removeTargets(projectId, e, targets);
    process.stderr.write(`✓ deleted ${key} [${hit.join(',')}]\n`);
    n++;
  }
  if (!n) die(`${key} exists but no entry covers [${targets.join(',')}].`);
}

async function main() {
  const { cmd, key, value, envs, help } = parseArgs(process.argv.slice(2));
  if (help || !cmd) {
    process.stdout.write(HELP + '\n');
    process.exit(help ? 0 : 1);
  }
  const projectId = envOrDie('VERCEL_PROJECT_ID');
  if (cmd === 'set') await cmdSet(projectId, key, value, envs);
  else if (cmd === 'verify') await cmdVerify(projectId, key);
  else if (cmd === 'delete') await cmdDelete(projectId, key, envs);
  else die(`unknown command '${cmd}' — use set|verify|delete (try --help)`);
}

main().catch((e) => die(e.message));
