import { LOOP_STAGES, LOOP_STAGE_LABELS, parseLoopStage } from '@/lib/loop-stage'
import { COULDNT_LOAD } from '@/lib/portfolio-view'
import type { Cell } from '@/lib/portfolio-model'
import { Pill } from '@/design-system/primitives'
import { setLoopStageAction } from './actions'

// portfolio-view · Sprint 2, Story 2.3 — the Loop cell. An owner sees "Place it" on an unplaced row and a menu on a
// placed one; anyone else sees the stage, read-only. The menu is a `<details>` holding one form, the same no-client-
// island shape the console's own switcher uses: each stage is a submit button, so the control works before (and
// without) any JavaScript.
//
// The button shows only to an owner, but the ACTION decides (D11) — hiding a control is a courtesy, not a guard.

export function LoopControl({
  projectId,
  workspaceId,
  cell,
  isOwner,
}: {
  projectId: string
  workspaceId: string
  cell: Cell<string>
  isOwner: boolean
}) {
  if ('error' in cell) return <span data-cell-tone="error">{COULDNT_LOAD}</span>

  const stage = cell.value === null ? null : parseLoopStage(cell.value)
  const badge =
    stage === null ? <Pill state="never">Not placed</Pill> : <Pill label>{LOOP_STAGE_LABELS[stage]}</Pill>
  if (!isOwner) return <div data-loop-stage={stage ?? 'unplaced'}>{badge}</div>

  return (
    // A BLOCK stack, not an inline span: a `<details>` inside an inline box left the span's line box lying over the
    // summary and swallowing its click (found by the authed spec — a person would have hit the same dead control).
    <div className="ds-specimen-col-stack" data-loop-stage={stage ?? 'unplaced'}>
      {badge}
      <details className="ds-disclosure">
        <summary>{stage === null ? 'Place it' : 'Change'}</summary>
        <form action={setLoopStageAction} className="ds-menu" role="menu">
          <input type="hidden" name="projectId" defaultValue={projectId} />
          <input type="hidden" name="workspace" defaultValue={workspaceId} />
          {LOOP_STAGES.map((option) => (
            <button
              key={option}
              type="submit"
              name="stage"
              value={option}
              className="ds-menu-item"
              role="menuitem"
              aria-current={option === stage ? 'true' : undefined}
            >
              {LOOP_STAGE_LABELS[option]}
            </button>
          ))}
          {stage === null ? null : (
            <button type="submit" name="stage" value="clear" className="ds-menu-item" role="menuitem">
              Not placed
            </button>
          )}
        </form>
      </details>
    </div>
  )
}
