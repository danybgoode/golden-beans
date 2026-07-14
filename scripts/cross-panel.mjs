#!/usr/bin/env node
// cross-panel.mjs — an ADVISORY cross-agent second opinion on a PROPOSED PLAN (a scope/seed doc).
//
// The planning-half sibling of cross-review.mjs: instead of a PR diff it reads ONE plan doc and pipes it
// into a DIFFERENT model family's CLI (Codex or Antigravity) with an architecture LENS prompt
// (scripts/cross-panel.prompt.md), then PRINTS the critique. It is dev tooling, not app code, and is:
//   • SINGLE-PASS — one read per lens, no debate / iterate-to-convergence loop (our #1 token sink).
//   • PRINT-ONLY — it NEVER edits the doc. Daniel commits any takeaways himself as a normal doc commit.
//   • ADVISORY ONLY — never gates. Daniel's scope-doc approval remains the only gate (planning has no CI).
//
// Usage:
//   node scripts/cross-panel.mjs <scope-doc> --agent codex|antigravity --lens architect-purist [--dry-run]
//
// CLI plumbing is shared with cross-review.mjs via scripts/lib/cross-agent-cli.mjs. Zero npm deps — Node 18+.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AGENTS, die, need, ensureCmd, checkAgyVersion, loadPromptBody, runCodex, runAntigravity } from './lib/cross-agent-cli.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, 'cross-panel.prompt.md');

function helpText(lenses) {
  return `cross-panel.mjs — advisory cross-agent second opinion on a proposed plan (a scope/seed doc).

Usage:
  node scripts/cross-panel.mjs <scope-doc> --agent codex|antigravity --lens <name> [--dry-run]

Flags:
  --agent <name>   reviewer CLI: ${Object.keys(AGENTS).join('|')} (default: codex)
  --lens  <name>   architecture lens: ${lenses.join('|')}|both (default: both)
  --dry-run        print the composed prompt(s) that WOULD be sent, without invoking the CLI
  -h, --help       show this help

The pair (--lens both, the default) runs each lens single-pass on the chosen --agent, then prints one
combined advisory block with a contradiction-synthesis. For model-family diversity, run twice with a
different --agent. A single --lens <name> is the quick one-lens look.

Advisory only — single-pass, print-only, never gates. Your scope-doc approval decides.`;
}

function parseArgs(argv) {
  const out = { doc: null, agent: 'codex', lens: 'both', dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--agent') out.agent = need(argv[++i], '--agent');
    else if (a.startsWith('--agent=')) out.agent = a.slice('--agent='.length);
    else if (a === '--lens') out.lens = need(argv[++i], '--lens');
    else if (a.startsWith('--lens=')) out.lens = a.slice('--lens='.length);
    else if (!a.startsWith('-') && out.doc === null) out.doc = a;
    else die(`unknown argument '${a}' (try --help)`);
  }
  return out;
}

// Slice the section starting at `from` (a `## ` heading) up to the next `## ` heading or EOF.
function sliceSection(body, from) {
  const rest = body.slice(from + 2);
  const nextRel = rest.search(/^##[ \t]+/m);
  const to = nextRel === -1 ? body.length : from + 2 + nextRel;
  return body.slice(from, to).trim();
}

// Parse the prompt library into { preamble, lenses: {name: sectionText}, synthesis }. The shared preamble is
// everything before the first `## LENS:` heading; each lens / the `## SYNTHESIS` section runs to the next
// `## ` heading or EOF.
function parsePromptLibrary(body) {
  const lensRe = /^##[ \t]+LENS:[ \t]*(\S+)[ \t]*$/gm;
  const firstLens = body.search(/^##[ \t]+LENS:/m);
  if (firstLens === -1) die(`no '## LENS:' sections found in ${PROMPT_PATH}`);
  const preamble = body.slice(0, firstLens).trim();

  const lenses = {};
  let m;
  while ((m = lensRe.exec(body)) !== null) lenses[m[1]] = sliceSection(body, m.index);

  const synthAt = body.search(/^##[ \t]+SYNTHESIS[ \t]*$/m);
  const synthesis = synthAt === -1 ? null : sliceSection(body, synthAt);

  return { preamble, lenses, synthesis };
}

function readDoc(path) {
  if (!existsSync(path)) die(`scope doc not found: ${path}`);
  if (statSync(path).isDirectory()) die(`expected a file, got a directory: ${path}`);
  const text = readFileSync(path, 'utf8');
  if (!text.trim()) die(`scope doc is empty: ${path}`);
  return text;
}

const BANNER =
  "> **Advisory only — not a gate.** CI/QA don't apply to planning; your scope-doc approval decides. " +
  'Single-pass second opinion from a different model family.';

// Compose the full prompt for one lens: shared preamble + the lens section.
function composeLensPrompt(preamble, lensSection) {
  return `${preamble}\n\n${lensSection}\n`;
}

// Run a single-pass prompt + context block through the selected agent. codex takes the context on stdin;
// agy 1.0.7 has no stdin, so the context rides embedded in the argv string (size-capped in the helper).
// opts.soft → return null instead of die()-ing on CLI failure (used by the non-essential synthesis pass).
function runWithAgent(agent, prompt, contextLabel, contextText, opts = {}) {
  const block = `## ${contextLabel}\n\n${contextText}`;
  if (agent === 'codex') return runCodex(prompt, block, opts);
  if (agent === 'antigravity') return runAntigravity(`${prompt}\n\n${block}\n`, opts);
  die(`unknown --agent '${agent}'; use ${Object.keys(AGENTS).join('|')}`);
}

function ensureAgentCli(agent) {
  if (agent === 'codex') {
    ensureCmd('codex', 'codex not found — install Codex CLI (https://github.com/openai/codex) and `codex login`.');
  } else if (agent === 'antigravity') {
    ensureCmd('agy', 'agy not found — install the Antigravity CLI and authenticate it, then retry.');
    checkAgyVersion();
  }
}

// Run the contradiction-synthesis over the lens critiques (soft — degrades to a note instead of dying).
function runSynthesis(agent, synthesisSection, results) {
  if (!synthesisSection) return null;
  const critiques = results.map((r) => `### ${r.name} critique\n\n${r.findings}`).join('\n\n');
  return runWithAgent(agent, synthesisSection, 'Two critiques to compare', critiques, { soft: true });
}

function main() {
  const body = loadPromptBody(PROMPT_PATH);
  const { preamble, lenses, synthesis } = parsePromptLibrary(body);
  const lensNames = Object.keys(lenses);

  const { doc, agent, lens, dryRun, help } = parseArgs(process.argv.slice(2));
  if (help) {
    process.stdout.write(helpText(lensNames) + '\n');
    process.exit(0);
  }
  if (doc === null) die('missing <scope-doc>. Usage: node scripts/cross-panel.mjs <scope-doc> --lens both');
  if (!AGENTS[agent]) die(`unknown --agent '${agent}'; use ${Object.keys(AGENTS).join('|')}`);
  if (lens !== 'both' && !lenses[lens]) die(`unknown --lens '${lens}'; use ${lensNames.join('|')}|both`);

  const lensesToRun = lens === 'both' ? lensNames : [lens];
  const docText = readDoc(doc);
  const contextLabel = `Plan to review (${doc})`;

  if (dryRun) {
    for (const name of lensesToRun) {
      process.stdout.write(`# --dry-run: composed prompt for lens '${name}' (agent: ${agent})\n\n`);
      process.stdout.write(composeLensPrompt(preamble, lenses[name]) + '\n');
      process.stdout.write(`## ${contextLabel}\n\n${docText}\n\n`);
    }
    if (lensesToRun.length > 1) {
      process.stdout.write(`# --dry-run: a contradiction-synthesis pass would then run over the ${lensesToRun.length} critiques.\n`);
    }
    process.stderr.write('\n(dry-run — no CLI invoked)\n');
    process.exit(0);
  }

  ensureAgentCli(agent);

  const results = [];
  for (const name of lensesToRun) {
    const findings = runWithAgent(agent, composeLensPrompt(preamble, lenses[name]), contextLabel, docText);
    if (!findings) die(`${AGENTS[agent]} returned no output for lens '${name}'.`);
    results.push({ name, findings });
  }

  // Single lens → a single labeled block. The pair → one combined panel + a contradiction-synthesis.
  if (results.length === 1) {
    const { name, findings } = results[0];
    process.stdout.write(`### 🔎 Cross-agent planning panel — ${name} (${AGENTS[agent]})\n\n`);
    process.stdout.write(`${BANNER}\n\n---\n\n${findings}\n`);
    return;
  }

  process.stdout.write(`### 🔎 Cross-agent planning panel\n\n${BANNER}\n\n---\n`);
  for (const { name, findings } of results) {
    process.stdout.write(`\n## ${name} (${AGENTS[agent]})\n\n${findings}\n`);
  }

  const contradictions = runSynthesis(agent, synthesis, results);
  process.stdout.write('\n## Contradictions to adjudicate\n\n');
  if (contradictions) {
    process.stdout.write(contradictions + '\n');
  } else {
    process.stdout.write(
      '_(Synthesis pass unavailable — compare the lens critiques above; no contradiction list was produced.)_\n'
    );
  }
}

main();
