# Approved surfaces

A state written as a `surface` block and approved by the product owner lives here as `<state>.surface`: the bare
block, no fence, with `state:` equal to the file name. `state-contract.mjs` turns each one into a
`STATE-CONTRACT.json` entry (`"source": "spec"`), `route-manifest.ts` may cite its id as a route's `referenceState`, and
the gate checks that route against it exactly as it checks a prototype-drawn state. The rules are the `sketch-specs` epic README's D5, D12 and D13:

- **Approval is a hash.** Every file here needs a line in `../APPROVED.md` → `## Approved surfaces` carrying the first
  16 hex of its SHA-256. Edit an approved file and `state-contract.mjs --check` fails until it is reverted or approved
  again; the failure prints the line the new version would need. Nobody but the product owner adds that line.
- **One source per state id.** An id the approved prototypes already define is refused; so is an id two files share.
- **Only what the map reaches.** Blocks are the twelve generic kinds, mapped by `../surface.map.json`. A state that
  needs any other kind stays in the prototype.

Draft a surface in a seed first, render it with `node scripts/sketch-render.mjs <seed>`, and copy it here once it is
approved. `../surface-parity/` holds three prototype states written as surfaces to prove the format loses nothing;
they are test fixtures, not approvals, and nothing reads them as contract.
