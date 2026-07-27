#!/usr/bin/env node
// install-main-report-daemon.mjs — install/remove the user-scoped launchd runner for prose reports.
// It deliberately owns only one plist under ~/Library/LaunchAgents; the application and its secrets
// stay in this checkout (.env.local), never in the launchd configuration.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const LABEL = 'com.golden-beans.main-report';
const uid = process.getuid?.();
const target = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const logPath = join(homedir(), 'Library', 'Logs', 'golden-beans-main-report.log');

function command(args, { quiet = false } = {}) {
  return spawnSync('launchctl', args, { encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });
}

function xml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function usage() {
  process.stdout.write(
    'Usage: node scripts/install-main-report-daemon.mjs [--install|--uninstall|--status]\n' +
      '  --install     install and start the current user’s five-minute report runner (default)\n' +
      '  --uninstall   stop and remove only this runner\n' +
      '  --status      show launchd state and the last runner result\n'
  );
}

function assertMacLaunchd() {
  if (process.platform !== 'darwin' || uid === undefined) {
    throw new Error('the local report runner uses macOS launchd and must be managed on macOS.');
  }
}

function status() {
  const result = command(['print', `gui/${uid}/${LABEL}`], { quiet: true });
  process.stdout.write(result.status === 0 ? '✓ launchd runner is loaded.\n' : '○ launchd runner is not loaded.\n');
  const statusPath = join(REPO_ROOT, '.git', 'gb-main-report-status.json');
  if (existsSync(statusPath)) process.stdout.write(readFileSync(statusPath, 'utf8'));
  else process.stdout.write('No runner execution has been recorded yet.\n');
}

function install() {
  assertMacLaunchd();
  const template = readFileSync(join(__dirname, 'launchd', `${LABEL}.plist.template`), 'utf8');
  const contents = template
    .replaceAll('__NODE_PATH__', xml(process.execPath))
    .replaceAll('__REPO_ROOT__', xml(REPO_ROOT))
    .replaceAll('__LOG_PATH__', xml(logPath));
  mkdirSync(dirname(target), { recursive: true });
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(target, contents, 'utf8');

  // Reinstalling is idempotent: bootout may return non-zero when this is the first install.
  command(['bootout', `gui/${uid}`, target], { quiet: true });
  const loaded = command(['bootstrap', `gui/${uid}`, target], { quiet: true });
  if (loaded.status !== 0) throw new Error(`launchctl could not load ${target}`);
  process.stdout.write(`✓ installed ${LABEL}; it runs now and every five minutes.\n`);
  process.stdout.write(`  logs: ${logPath}\n  status: node scripts/install-main-report-daemon.mjs --status\n`);
}

function uninstall() {
  assertMacLaunchd();
  command(['bootout', `gui/${uid}`, target], { quiet: true });
  if (existsSync(target)) rmSync(target);
  process.stdout.write(`✓ removed ${LABEL}. Logs and report history were preserved.\n`);
}

try {
  const arg = process.argv[2] ?? '--install';
  if (arg === '--help') usage();
  else if (arg === '--status') status();
  else if (arg === '--install') install();
  else if (arg === '--uninstall') uninstall();
  else {
    usage();
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`✗ ${error.message}\n`);
  process.exitCode = 1;
}
