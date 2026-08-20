import { METHODOLOGY_PHASES, type MethodologyPhase } from '@/lib/methodology-chapters'

// methodology-experience · Sprint 2 — the one label both route stories render.
//
// The index cards tag each chapter with its phase, and a chapter page opens with "Consider ·
// Chapter 1". That is one fact rendered in two places, and the phase's display name is exactly the
// kind of string that gets hand-typed into the second surface and then drifts — the defect
// `MakerHero`'s bag rows were bitten by three times in one epic (CODE-QUALITY #2).
//
// So the title comes from `METHODOLOGY_PHASES` rather than from a `Record` written here, and it
// THROWS on a phase that is not declared. A phase id is a closed union at the type level, so this
// is unreachable from application code by construction — but the module is the SSOT for a set that
// Sprint 3's TOC also groups by, and a silently-empty label above a chapter title is worse than a
// crash a build catches.
export function phaseTitle(phase: MethodologyPhase): string {
  const entry = METHODOLOGY_PHASES.find((candidate) => candidate.id === phase)
  if (!entry) throw new Error(`Unknown methodology phase: ${phase}`)
  return entry.title
}

/**
 * The kicker above a chapter title, and the tag on an index card.
 *
 * `chapterNumber` is optional because the two call sites want different things: a card is tagged
 * with its phase alone, a chapter page announces "Consider · Chapter 1". One component, because the
 * separator, the casing and the phase name must not be decided twice.
 */
export function PhaseLabel({
  phase,
  chapterNumber,
  className = '',
}: {
  phase: MethodologyPhase
  chapterNumber?: number
  className?: string
}) {
  const title = phaseTitle(phase)

  return (
    <p className={`methodology-phase-label ${className}`.trim()}>
      {chapterNumber === undefined ? title : `${title} · Chapter ${chapterNumber}`}
    </p>
  )
}
