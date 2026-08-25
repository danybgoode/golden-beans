// flags-console-parity · the words this console uses for a flag, defined once.
//
// ── Why this module exists before Story 3.3 asked for it ─────────────────────────────────────
// Story 2.1 gave the console a SECOND surface — the per-feature destination — and the moment a
// second surface existed, "On" / "Turned off" / "Never turned on here" had two places to be typed.
// `lib/positioning.ts` exists because that exact drift was paid for three times (its own comment
// names the epics). Waiting until Sprint 3 to centralise would mean writing the divergence first
// and removing it later, so the vocabulary starts here instead. Story 3.3 extends this file to the
// remaining terms; it does not create a different one.
//
// ── Scope, precisely ─────────────────────────────────────────────────────────────────────────
// USER-FACING WORDS ONLY. The stored values are untouched — `definition.metadata.polarity` still
// holds `killswitch`, one word, and the URL parameter still carries that spelling. This module maps
// a stored value to what a human reads, and nothing else. It holds no arithmetic: the three-state
// derivation lives in `lib/flag-list-view.ts`, which is where it can be unit-tested.

import type { BadgeStatus } from '@/components/ui/Badge'
import type { FlagActivationState, FlagListRow } from '@/lib/flag-list-view'
import { formatUtc } from '@/lib/format-utc'

/**
 * The three activation states, said in words rather than left to a colour.
 *
 * ── Why "Never turned on here" is not "Off" ──────────────────────────────────────────────────
 * `deactivate_flag` keeps the activation row and nulls its version, so a deliberate kill is
 * recorded in the lifecycle audit with an actor and a reason. A flag nobody ever activated has no
 * row and no audit trail, because nothing happened. Live, **40 of 42** flags are in the second
 * state in every environment; rendering them the same as a deliberate kill is the specific thing
 * that made the old page unanswerable (epic README, Amendment 2).
 *
 * Badge statuses are borrowed for their SEMANTICS, not their colour: `live` carries a check,
 * `blocked` a warning (somebody did this on purpose), `next` a clock (nobody has got to it).
 *
 * ── No Flagsmith term is reused for a Golden concept that differs (D7) ───────────────────────
 * Flagsmith's vocabulary is adopted where the concept genuinely matches — Feature, Environment,
 * Value, History, Settings. These three states have no Flagsmith equivalent, because Flagsmith has
 * no "never activated in this environment" state to name, so they get plain-language names of
 * their own rather than borrowing a word that already means something else there.
 */
export const FLAG_STATE_PRESENTATION: Record<
  FlagActivationState,
  { badge: BadgeStatus; label: string; detail: (row: FlagListRow) => string }
> = {
  on: {
    badge: 'live',
    label: 'On',
    detail: (row) =>
      row.version === null ? 'serving a version that could not be read' : `serving v${row.version}`,
  },
  off: {
    badge: 'blocked',
    label: 'Turned off',
    detail: (row) =>
      row.updatedAt === null ? 'switched off here' : `switched off ${formatUtc(row.updatedAt)}`,
  },
  never: {
    badge: 'next',
    label: 'Never turned on here',
    detail: () => 'no one has switched this on or off in this environment',
  },
}

/** `killswitch` is the STORED spelling, one word. "Kill switch" is what a person reads. */
export const TYPE_LABEL: Record<string, string> = {
  killswitch: 'Kill switch',
  enablement: 'Enablement',
  unclassified: 'Unclassified',
}

/**
 * Every criticality is looked up, including the classified ones. An earlier version special-cased
 * only `unclassified` and let the other three fall through as the raw stored value, so a column of
 * `high` / `medium` / `low` sat next to a capitalised `Unclassified` (cross-review, Agy, round 1).
 * A map means the display form of a value cannot depend on which branch produced it.
 */
export const CRITICALITY_LABEL: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unclassified: 'Unclassified',
}
