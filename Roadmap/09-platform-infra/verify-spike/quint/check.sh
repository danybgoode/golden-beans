#!/usr/bin/env bash
# verify-spike S1.1 — every model-check result DECISION.md cites, re-runnable.
#   bash Roadmap/09-platform-infra/verify-spike/quint/check.sh            # the full table (~65 min)
#   bash Roadmap/09-platform-infra/verify-spike/quint/check.sh quick      # simulator only (~1.5 min)
# Needs: Java 17+ (Apalache), and Quint: QUINT=/path/to/quint or `npx -y @informalsystems/quint@0.33.0`.
#
# Every row states the result DECISION.md records. A row whose result differs, OR that produced no
# result at all (a missing tool, a missing spec, a checker crash), prints MISMATCH and the script
# exits 1. A blank row must never read as a pass: that exact failure happened while this spike ran.
set -u
cd "$(dirname "$0")"
QUINT=${QUINT:-"npx -y @informalsystems/quint@0.33.0"}
failures=0

report() { # mode module invariant depth expected result seconds output
  local status=match
  if [ "$6" != "$5" ]; then
    status=MISMATCH
    failures=$((failures + 1))
  fi
  printf '%-20s %-20s %-4s %-9s expected %-11s got %-11s %-8s %4ss\n' "$2" "$3" "$1" "$4" "$5" "${6:-<none>}" "$status" "$7"
  if [ "$status" = MISMATCH ] && [ -z "$6" ]; then
    printf '  └ no result; last output:\n'
    tail -5 <<<"$8" | sed 's/^/    /'
  fi
}

sim() { # module invariant expected — random simulation, 10k traces of ≤25 steps, fixed seed
  local s=$SECONDS out r
  out=$($QUINT run outbox.qnt --main "$1" --invariant "$2" --max-steps 25 --max-samples 10000 --seed 0x1 2>&1)
  r=$(grep -oE '^\[(ok|violation)\]' <<<"$out" | head -1)
  report sim "$1" "$2" "≤25" "$3" "$r" "$((SECONDS - s))" "$out"
}

bmc() { # module invariant depth expected — Apalache bounded model check, EXHAUSTIVE to that depth
  local s=$SECONDS out r
  out=$($QUINT verify outbox.qnt --main "$1" --invariant "$2" --max-steps "$3" 2>&1)
  r=$(grep -oE '^\[(ok|violation)\]' <<<"$out" | head -1)
  report bmc "$1" "$2" "$3" "$4" "$r" "$((SECONDS - s))" "$out"
}

[ -f outbox.qnt ] || { echo "outbox.qnt not found in $(pwd)"; exit 1; }

for m in outbox_timed outbox_untimed; do
  for i in noVanish noOrphan attemptsBounded sendsBounded noDeadByExhaustion; do sim "$m" "$i" '[ok]'; done
  sim "$m" noStrandedInFlight '[violation]' # F1
done
sim outbox_timed noSendAfterTerminal '[ok]'
sim outbox_untimed noSendAfterTerminal '[violation]' # F3: without the timing order

if [ "${1:-}" != quick ]; then
  # Exhaustive to depth: the shipped code under the production timing assumption.
  for i in noVanish noOrphan attemptsBounded noSendAfterTerminal; do bmc outbox_timed "$i" 10 '[ok]'; done
  bmc outbox_timed noDeadByExhaustion 11 '[violation]' # F4 witness
  bmc outbox_timed sendsBounded 12 '[violation]'       # F2
  # The proposed F2 fix: the violation is gone past the depth it appeared at; nothing else regresses.
  bmc outbox_timed_fixed sendsBounded 14 '[ok]'
  for i in noVanish noOrphan attemptsBounded noSendAfterTerminal; do bmc outbox_timed_fixed "$i" 10 '[ok]'; done
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures row(s) did not reproduce DECISION.md"
  exit 1
fi
echo "all rows reproduce DECISION.md"
