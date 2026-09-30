// surface-contract.mjs — an APPROVED surface block becomes a state-contract entry (sketch-specs D12, D13).
//
// Before this, every approved state was drawn as prototype HTML and its contract was read out of it afterwards, so
// the thing the product owner approved and the thing CI checks a route against were two artifacts. A surface block
// in `surfaces/<state>.surface` is both: `APPROVED.md` records its hash, and this file turns it into exactly the
// JSON `extractSignature` would have produced from a prototype drawing the same blocks — so the gate
// (`console-visual.authed.spec.ts`) compares a spec-sourced state with no new comparison code.
//
// Pure: no browser, no `_harness.mjs`. The generator and the tests import the same functions, so the check a test
// proves is the check CI runs (CODE-QUALITY #2).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseSurface, SurfaceError } from '../../../scripts/lib/surface.mjs';

/** The first 16 hex of a SHA-256 — `APPROVED.md`'s convention since the prototype's own line (D12). */
export const approvalHash = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/**
 * Words the way `extractSignature`'s `text()` reads them off a page: whitespace collapsed, trimmed, lower-cased.
 *
 * ⚠️ **A second copy of a rule that lives inside `extractSignature`, and it cannot be the same function.**
 * `extractSignature` is serialised into a browser by `page.evaluate`, so it may close over nothing — it cannot import
 * this. The two are held together by the parity test (`surface-parity.test.ts`), which compares this file's output
 * with entries `extractSignature` actually extracted; if the page-side rule changes, parity goes red.
 */
const words = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** Every `*.surface` file in `dir`, parsed. A parse error is returned, not thrown, so one bad file reports with the rest. */
export function readSurfaces(dir) {
  if (!existsSync(dir)) return [];
  const label = basename(dir);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.surface'))
    .sort()
    .map((name) => {
      const file = `${label}/${name}`;
      const bytes = readFileSync(join(dir, name));
      try {
        return { file, name, hash: approvalHash(bytes), surface: parseSurface(bytes.toString('utf8'), file) };
      } catch (error) {
        if (!(error instanceof SurfaceError)) throw error;
        return { file, name, hash: approvalHash(bytes), error: error.message };
      }
    });
}

/**
 * One surface → one contract entry, in the shape `extractSignature` returns (D13).
 *
 * @param map `surface.map.json` — generic kind → this repo's kind
 * @param kinds `BLOCK_KINDS` — which facts each of this repo's kinds records
 * @throws {SurfaceError} naming the block's line when a block cannot be said in this repo's vocabulary
 */
export function surfaceEntry(surface, map, kinds, file = `${surface.state}.surface`) {
  const blocks = surface.blocks.map((block) => {
    const fail = (reason) => new SurfaceError(file, block.line, reason);
    // Own properties only, the parser's rule (#210 review): an inherited name is never a mapping.
    const target = Object.hasOwn(map.kinds, block.kind) ? map.kinds[block.kind] : undefined;
    if (target === undefined) throw fail(`this project's surface.map.json maps no \`${block.kind}\``);
    const kind = kinds.find((entry) => entry.kind === target);
    if (kind === undefined) throw fail(`surface.map.json maps \`${block.kind}\` to \`${target}\`, which BLOCK_KINDS lacks`);
    const records = Object.keys(kind.facts ?? {});

    // A fact the project kind does not record would be approved in the picture and enforced nowhere — exactly the
    // gap this epic closes — so it is refused rather than dropped.
    for (const fact of ['action', 'count', 'columns']) {
      if (fact in block && !records.includes(fact)) {
        throw fail(`\`${target}\` does not record a \`${fact}\` in this project — drop it, or add the fact to BLOCK_KINDS`);
      }
    }
    const out = { kind: target };
    for (const fact of records) {
      if (fact === 'action') out.action = block.action === undefined ? null : words(block.action);
      else if (fact === 'columns') out.columns = block.columns === undefined ? null : block.columns.map(words);
      else if (fact === 'count') {
        // `extractSignature` records 0 for a tile row with no tiles, so a missing count would silently assert "zero".
        if (block.count === undefined) throw fail(`\`${block.kind}\` needs a \`count\` here — the contract records how many`);
        out.count = block.count;
      }
    }
    return out;
  });
  // Key order is `extractSignature`'s, plus `source` LAST: a prototype entry has no `source`, so none of the 38
  // prototype entries' bytes change, and removing `source` from a spec entry leaves exactly a prototype-shaped one.
  return { missing: false, blocks, disclosures: 0, annotations: 0, unknown: [], source: 'spec' };
}

/** The `## Approved surfaces` table rows: `| state | file | hash | by | date |`, backticks stripped. */
function approvalRows(approvedMd) {
  const at = approvedMd.search(/^## Approved surfaces\s*$/m);
  if (at === -1) return null;
  const section = approvedMd.slice(at).split(/\n(?=## )/)[0];
  return section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, '')))
    .filter((cells) => cells.length >= 3 && !/^-+$/.test(cells[0]) && cells[0] !== 'State');
}

/**
 * The approval check (D12) — the repo's first MECHANICAL one: nothing compares the prototypes' hashes (lock C2).
 * Returns the problems; empty means every surface is approved exactly as it stands.
 */
export function checkApprovals(surfaces, approvedMd) {
  const rows = approvalRows(approvedMd);
  if (rows === null) return ['APPROVED.md has no `## Approved surfaces` section, so no surface can be approved'];
  const problems = [];
  const seen = new Set();
  for (const [state, file, hash] of rows) {
    if (seen.has(file)) problems.push(`APPROVED.md approves \`${file}\` twice — one line per approved surface`);
    seen.add(file);
    const surface = surfaces.find((entry) => entry.file === file);
    if (surface === undefined) {
      problems.push(`APPROVED.md approves \`${file}\`, which does not exist`);
      continue;
    }
    if (surface.hash !== hash) {
      problems.push(
        `\`${file}\` hashes to \`${surface.hash}\` and its APPROVED.md line says \`${hash}\` — the approved surface ` +
          'changed. Revert it, or approve the new one: a new line with the new hash, from the product owner.'
      );
    }
    if (surface.surface !== undefined && surface.surface.state !== state) {
      problems.push(`APPROVED.md approves \`${file}\` as \`${state}\`, and the file says \`state: ${surface.surface.state}\``);
    }
  }
  for (const surface of surfaces) {
    if (!seen.has(surface.file)) {
      problems.push(
        `\`${surface.file}\` has no APPROVED.md line, so it is not approved. Once the product owner approves it, the ` +
          `line is: | ${surface.surface?.state ?? '<state>'} | \`${surface.file}\` | \`${surface.hash}\` | <who> | <date> |`
      );
    }
  }
  return problems;
}

/**
 * Every approved surface in `dir`, as contract entries (D5, D12, D13).
 *
 * @returns {{ entries: Record<string, object>, problems: string[] }} entries sorted by state id; any problem means
 *   the generator must refuse to write or pass.
 */
export function specContract(dir, { approvedMd, map, kinds, prototypeIds }) {
  const surfaces = readSurfaces(dir);
  const problems = [];
  const entries = {};
  const prototype = new Set(prototypeIds);
  for (const found of surfaces) {
    if (found.error !== undefined) {
      problems.push(found.error);
      continue;
    }
    const { state } = found.surface;
    if (found.name !== `${state}.surface`) {
      problems.push(`\`${found.file}\` says \`state: ${state}\` — the file is named for its state: \`${state}.surface\``);
    }
    // D5: one source per state id. The prototype's 38 are not migrated, so a spec with one of their ids is a
    // second definition of an approved state, and which one CI enforced would depend on load order.
    if (prototype.has(state)) {
      problems.push(`\`${found.file}\`: \`${state}\` is already defined by the approved prototype — one source per state id`);
      continue;
    }
    if (state in entries) {
      problems.push(`\`${found.file}\`: \`${state}\` is defined by two surface files — one source per state id`);
      continue;
    }
    try {
      entries[state] = surfaceEntry(found.surface, map, kinds, found.file);
    } catch (error) {
      if (!(error instanceof SurfaceError)) throw error;
      problems.push(error.message);
    }
  }
  problems.push(...checkApprovals(surfaces, approvedMd));
  const sorted = Object.fromEntries(Object.keys(entries).sort().map((state) => [state, entries[state]]));
  return { entries: sorted, problems };
}
