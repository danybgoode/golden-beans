#!/usr/bin/env node
// run-local-e2e — the local counterpart to CI's Playwright gate.
//
// A bare `npm run test:e2e` assumes that port 3000 is this checkout's server and that the
// surrounding shell already carries local Supabase credentials. Neither is safe to assume in a
// shared workstation: a long-lived server can belong to another branch, and inherited production
// variables make the DB-cleanup guard (correctly) refuse to run. This runner gets its values from
// *this* local Supabase instance, builds once with those client values, and owns both servers it
// talks to. It never starts, resets, links, or otherwise mutates Supabase itself.

import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'apps/web');
const next = join(root, 'node_modules/.bin/next');
const playwright = join(root, 'node_modules/.bin/playwright');
const normalPort = 3110;
const darkPort = 3111;
// Optional file arguments keep focused local investigation hermetic too. The dark-gate tripwire
// still always runs because a focused enabled spec must not accidentally skip the OFF boundary.
const requestedFiles = process.argv.slice(2);

function die(message) {
  process.stderr.write(`local-e2e: ${message}\n`);
  process.exitCode = 1;
  throw new Error(message);
}

function run(command, args, { quiet = false, ...options } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: quiet ? 'utf8' : undefined,
    stdio: quiet ? 'pipe' : 'inherit',
    ...options,
  });
  if (result.error) die(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    if (quiet && result.stdout) process.stdout.write(result.stdout);
    if (quiet && result.stderr) process.stderr.write(result.stderr);
    die(`${command} ${args.join(' ')} exited ${result.status}`);
  }
  return result.stdout || '';
}

function localSupabaseEnv() {
  const output = run('supabase', ['status', '-o', 'env'], { cwd: web, quiet: true });
  const values = Object.create(null);
  for (const line of output.trim().split('\n')) {
    const equal = line.indexOf('=');
    if (equal < 1) continue;
    const name = line.slice(0, equal);
    const raw = line.slice(equal + 1);
    try {
      values[name] = JSON.parse(raw);
    } catch {
      die(`Supabase emitted an unreadable ${name} value`);
    }
  }

  for (const name of ['API_URL', 'SECRET_KEY', 'ANON_KEY', 'DB_URL']) {
    if (!values[name]) die(`Supabase status omitted ${name}`);
  }

  const database = new URL(values.DB_URL);
  if (database.hostname !== '127.0.0.1' || database.port !== '54322' || database.search || database.hash) {
    die("Supabase DB_URL is not this checkout's local migration-owner database");
  }

  return {
    SUPABASE_URL: values.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: values.SECRET_KEY,
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: values.ANON_KEY,
    SUPABASE_DB_URL: values.DB_URL,
    // Absolute URLs are a deployment property, never inferred from a request Host header. Point
    // the owned test server at itself so llms/install tests cannot inherit localhost from .env.local.
    SITE_URL: `http://127.0.0.1:${normalPort}`,
  };
}

async function waitFor(url, child, label) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode !== null) die(`${label} server exited before it became ready`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The next process has not bound its loopback port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  die(`${label} server did not become ready at ${url}`);
}

async function withServer({ port, env, label }, action) {
  const child = spawn(next, ['start', 'apps/web', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  try {
    await waitFor(`http://127.0.0.1:${port}/llms.txt`, child, label);
    return await action();
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

function runPlaywright(env, port, files = []) {
  run(playwright, ['test', '--config=apps/web/playwright.config.ts', ...files, '--project=api'], {
    env: { ...env, PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}` },
  });
}

async function main() {
  const local = localSupabaseEnv();
  const shared = {
    ...process.env,
    ...local,
    CONNECTOR_ENABLED: 'true',
    JOURNEY_PROJECTIONS_ENABLED: 'true',
    EXPERIMENT_GOVERNANCE_ENABLED: 'true',
    REPORT_SHARES_ENABLED: 'true',
    SIGNALS_ENABLED: 'true',
    CONNECTOR_WRITES_ENABLED: 'false',
    FLAG_SERVING_ENABLED: 'true',
    SELF_PROJECT_API_KEY: randomBytes(24).toString('hex'),
  };

  // NEXT_PUBLIC values are inlined at build time, so the build has to use the same local URL as
  // the owned test servers. A global .env.local or a long-lived dev server must not decide this.
  process.stdout.write('local-e2e: building against the local Supabase instance...\n');
  run('npm', ['run', 'build'], { env: shared });

  const dark = {
    ...shared,
    JOURNEY_PROJECTIONS_ENABLED: 'false',
    EXPERIMENT_GOVERNANCE_ENABLED: 'false',
    FLAG_SERVING_ENABLED: 'false',
  };
  await withServer({ port: darkPort, env: dark, label: 'dark-gate' }, async () => {
    runPlaywright(dark, darkPort, [
      'apps/web/e2e/journey-dark.spec.ts',
      'apps/web/e2e/experiment-governance-dark.spec.ts',
      'apps/web/e2e/flag-serving-dark.spec.ts',
    ]);
  });

  await withServer({ port: normalPort, env: shared, label: 'enabled-gate' }, async () => {
    // Seed scripts intentionally print newly minted credentials for an interactive operator.
    // This runner generated one only for its disposable local process, so keep the hook transcript
    // useful without normalising credential-shaped output into CI or terminal logs.
    run('node', ['scripts/seed-demo-project.mjs'], {
      env: { ...shared, GROWTH_ENGINE_URL: `http://127.0.0.1:${normalPort}` },
      quiet: true,
    });
    run('node', ['scripts/seed-self-project.mjs'], {
      env: { ...shared, GROWTH_ENGINE_URL: `http://127.0.0.1:${normalPort}` },
      quiet: true,
    });
    process.stdout.write('local-e2e: seeded disposable demo and self fixtures.\n');
    runPlaywright(shared, normalPort, requestedFiles);
  });
}

main().catch((error) => {
  if (process.exitCode === undefined) process.stderr.write(`${error.stack || error}\n`);
  process.exitCode ||= 1;
});
