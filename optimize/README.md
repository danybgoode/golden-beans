# optimize/ — measuring the Jev guards, offline

Dev-only (compiled-prompts D4). **Nothing here ships:** `optimize/` sits outside `skills/`, so it's outside the
plugin, the kit and the skills mirror, and `check-plugin-leaks.mjs` plus `kit-tarball.test.mjs` fail if any of it
reaches them. CI runs no Python. What crosses back into the kit is a **reviewed data diff**: a threshold in
`jev.config.json`, or a question in `scripts/lib/jev-questions/*.json`.

| File | What it is |
|---|---|
| `extract.mjs` | Reads, from the **real Node judges**, the one number each threshold acts on for every labelled fixture. It replays the recorded answers, so there's no key and no cost. It also runs the **parity check**: the reduction has to reproduce the judge on every fixture at every grid threshold, and one mismatch is an error. |
| `extract.test.mjs` | The Node half of that parity check. It runs in `npm run test:unit`. |
| `refit.py` | DSPy **ReAnchor**, behind a replay client (`require_cache=False`). It compares the hand thresholds, the ReAnchor fit and a plain grid fit on the 5 seeded folds, and writes `folds.json` and `reports/refit-<date>.md`. |
| `folds.json` | DSPy's own folds (`reanchor.calibrate._folds`, seed 0), keyed by fixture id. The wording harness scores on the same folds. |
| `requirements.lock` | The frozen venv. The one real pin is `dspy[typesafe]==3.4.0`. |
| `reports/` | Committed reports, one per run. |

## One-time setup

```bash
python3 -m venv optimize/.venv                       # Python 3.14 checked; .venv/ is gitignored
optimize/.venv/bin/pip install -r optimize/requirements.lock
```

## Refit the thresholds

```bash
npm run optimize:refit
```

Run it after `jev-eval --live` re-records on a Jev model bump, or when the labelled fixtures roughly double. The
spike's rule for doing so is in `Roadmap/00-ideas/seeds/jev-reanchor-thresholds.md`. It prints the table and
proposes a `jev.config.json` change **only if a fit beats the hand values on held-out folds**. The train score is
never evidence on its own. On 2026-09-30 it reproduced the spike: review kept 0.85 / 0.30, prose kept 0.80,
held-out 76 and 141.

**The grid control isn't the spike's grid.** The spike's harness was never committed, so this one is rebuilt. Its
tie-break (the candidate closest to the hand value) differs, and so do its held-out counts: 75 and 141 here,
against 74 and 137 in the spike. The hand and ReAnchor columns, which carry the decision, are identical.

## Why the shape is what it is

- **The judges stay in Node.** DSPy only sees one probability per fixture and field, which `extract.mjs` derives by
  asking the real judge, and the parity check proves the reduction faithful. Evidence gates, `liveFlags`
  corroboration and the heading filter are never re-implemented in Python.
- **One cut per `Noul`.** The review rail's pass, regex and fail band is two fields over the same probability, with
  a `nextafter` shim for the inclusive `≤`. ReAnchor fits each prose family separately, but `jev.config.json`
  has one shared `claim` threshold, so a per-family win is reported and never proposed as a one-line change.
