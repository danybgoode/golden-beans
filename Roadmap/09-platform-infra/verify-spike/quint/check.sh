#!/usr/bin/env bash
# verify-spike S1.1 — every model-check result DECISION.md cites, re-runnable.
#   bash Roadmap/09-platform-infra/verify-spike/quint/check.sh            # the full table
#   bash Roadmap/09-platform-infra/verify-spike/quint/check.sh quick      # simulator only (~1 min)
# Needs: Java 17+ (Apalache), and Quint: QUINT=/path/to/quint or `npx -y @informalsystems/quint@0.33.0`.
set -u
cd "$(dirname "$0")"
QUINT=${QUINT:-"npx -y @informalsystems/quint@0.33.0"}

sim() { # module invariant — random simulation, 10k traces of ≤25 steps, fixed seed
  local s=$SECONDS
  local r
  r=$($QUINT run outbox.qnt --main "$1" --invariant "$2" --max-steps 25 --max-samples 10000 --seed 0x1 2>&1 |
    grep -E '^\[(ok|violation)\]' | head -1)
  printf '%-20s %-20s sim  ≤25 steps  %-12s %4ss\n' "$1" "$2" "$(cut -d' ' -f1 <<<"$r")" "$((SECONDS - s))"
}

bmc() { # module invariant depth — Apalache bounded model check, EXHAUSTIVE to that depth
  local s=$SECONDS
  local r
  r=$($QUINT verify outbox.qnt --main "$1" --invariant "$2" --max-steps "$3" 2>&1 |
    grep -E '^\[(ok|violation)\]' | head -1)
  printf '%-20s %-20s bmc  %2s steps   %-12s %4ss\n' "$1" "$2" "$3" "$(cut -d' ' -f1 <<<"$r")" "$((SECONDS - s))"
}

echo "module               invariant            mode depth      result       time"
for m in outbox_timed outbox_untimed; do
  for i in noVanish noOrphan attemptsBounded sendsBounded noSendAfterTerminal noStrandedInFlight noDeadByExhaustion; do
    sim "$m" "$i"
  done
done
[ "${1:-}" = quick ] && exit 0

# Exhaustive to depth: the shipped code under the production timing assumption.
for i in noVanish noOrphan attemptsBounded noSendAfterTerminal; do bmc outbox_timed "$i" 10; done
bmc outbox_timed noDeadByExhaustion 11   # WITNESS: expected [violation]
bmc outbox_timed sendsBounded 12         # FINDING F2: expected [violation]
# The proposed F2 fix: the violation must be gone past the depth it appeared at, nothing else regresses.
bmc outbox_timed_fixed sendsBounded 14
for i in noVanish noOrphan attemptsBounded noSendAfterTerminal; do bmc outbox_timed_fixed "$i" 10; done
