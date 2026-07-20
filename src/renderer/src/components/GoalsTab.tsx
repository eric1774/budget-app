import { useState, useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Plus, Target, PencilSimple, Trash } from '@phosphor-icons/react'
import type { Goal } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { AddGoalModal, SetTargetModal, DeleteGoalModal } from './GoalModals'
import { GoalDetailView } from './GoalDetailView'
import * as api from '../api'

// ── Helpers ──────────────────────────────────────────────────────────────────

const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const cadShort = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

function goalBalance(goal: Goal): number {
  return (goal.startingAmount ?? 0) + goal.contributions.reduce((sum, c) => sum + c.amount, 0)
}

function goalProgress(goal: Goal): number {
  if (!goal.targetAmount) return 0
  return Math.min(100, Math.round((goalBalance(goal) / goal.targetAmount) * 100))
}

/** Whole months from now until the ISO date (0 if past). */
function monthsUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00')
  const now = new Date()
  const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
  return Math.max(0, months)
}

function fmtTargetDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
}

// Accent per goal — cycles through the app's semantic hues
const GOAL_COLORS = ['#2DD4BF', '#A78BFA', '#60A5FA', '#34D399', '#F472B6', '#FBBF24']

// ── Modal State ───────────────────────────────────────────────────────────────

type ModalState =
  | { kind: 'add' }
  | { kind: 'set-target'; goal: Goal }
  | { kind: 'delete'; goal: Goal }
  | null

// ── Component ─────────────────────────────────────────────────────────────────

interface GoalsTabProps {
  onGoalSelect: (goal: Goal | null) => void
  selectedGoalId: string | null
}

export function GoalsTab({ onGoalSelect, selectedGoalId }: GoalsTabProps): JSX.Element {
  const [goals, setGoals] = useState<Goal[]>([])
  const [modal, setModal] = useState<ModalState>(null)

  const selectedGoal: Goal | null = goals.find((g) => g.id === selectedGoalId) ?? null

  const reloadGoals = useCallback(async () => {
    try {
      const data = await api.getGoals()
      setGoals(Array.isArray(data) ? data as Goal[] : [])
    } catch {
      setGoals([])
    }
  }, [])

  useEffect(() => {
    reloadGoals()
  }, [reloadGoals])

  if (selectedGoal) {
    return <GoalDetailView goal={selectedGoal} onBack={() => onGoalSelect(null)} onReload={reloadGoals} />
  }

  // Family-level totals for the hero strip
  const totalSaved = goals.reduce((s, g) => s + goalBalance(g), 0)
  const withTargets = goals.filter((g) => g.targetAmount != null && g.targetAmount > 0)
  const totalTarget = withTargets.reduce((s, g) => s + (g.targetAmount ?? 0), 0)
  const totalTowardTargets = withTargets.reduce((s, g) => s + Math.min(goalBalance(g), g.targetAmount ?? 0), 0)
  const overallPct = totalTarget > 0 ? (totalTowardTargets / totalTarget) * 100 : 0
  const completeCount = withTargets.filter((g) => goalProgress(g) >= 100).length

  return (
    <div className="goals-outer">
      {/* Header */}
      <div className="budget-toolbar">
        <h2 className="page-title">Family Goals</h2>
        <button className="btn-primary" onClick={() => setModal({ kind: 'add' })}>
          <Plus size={13} weight="bold" />
          Add Goal
        </button>
      </div>

      {/* Hero strip — combined progress across all targeted goals */}
      {withTargets.length > 0 && (
        <GlassCard className="budget-hero">
          <div className="budget-hero__main">
            <div className="budget-hero__label">Saved across {goals.length} goal{goals.length === 1 ? '' : 's'}</div>
            <div className="budget-hero__value">
              {cad.format(totalSaved)}
              {totalTarget > 0 && <span className="budget-hero__of"> of {cad.format(totalTarget)} in targets</span>}
            </div>
            <div
              className="budget-bar budget-bar--hero"
              role="progressbar"
              aria-valuenow={Math.round(overallPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${Math.round(overallPct)}% of combined goal targets saved`}
            >
              <div className="budget-bar__fill" style={{ width: `${Math.min(overallPct, 100)}%` }} />
            </div>
            <div className="budget-hero__meta">
              {Math.round(overallPct)}% of combined targets
              {completeCount > 0 && ` · ${completeCount} complete`}
            </div>
          </div>
        </GlassCard>
      )}

      {/* Empty state */}
      {goals.length === 0 ? (
        <div className="log-empty" style={{ flex: 1, justifyContent: 'center' }}>
          <Target size={28} weight="duotone" />
          <p>No goals yet</p>
          <span>Add your first family goal to start tracking progress.</span>
        </div>
      ) : (
        <div className="goal-grid">
          {goals.map((goal, i) => {
            const balance = goalBalance(goal)
            const progress = goalProgress(goal)
            const hasTarget = goal.targetAmount != null && goal.targetAmount > 0
            const remaining = hasTarget ? Math.max(0, (goal.targetAmount ?? 0) - balance) : 0
            const complete = hasTarget && progress >= 100
            const color = complete ? '#34D399' : GOAL_COLORS[i % GOAL_COLORS.length]
            const monthsLeft = goal.targetDate ? monthsUntil(goal.targetDate) : null
            const perMonth = hasTarget && !complete && monthsLeft && monthsLeft > 0 ? remaining / monthsLeft : null

            return (
              <div className="goal-tile-wrap" key={goal.id}>
                <div className="goal-tile-actions">
                  <button
                    className="btn-icon"
                    style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                    title="Set target"
                    aria-label={`Set target for ${goal.name}`}
                    onClick={() => setModal({ kind: 'set-target', goal })}
                  >
                    <PencilSimple size={13} />
                  </button>
                  <button
                    className="btn-icon btn-icon--danger"
                    style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                    title="Delete goal"
                    aria-label={`Delete ${goal.name}`}
                    onClick={() => setModal({ kind: 'delete', goal })}
                  >
                    <Trash size={13} />
                  </button>
                </div>

                <button
                  className="glass-card goal-tile"
                  style={{ '--card-accent': color } as CSSProperties}
                  onClick={() => onGoalSelect(goal)}
                  aria-label={hasTarget
                    ? `${goal.name}: ${cad.format(balance)} saved of ${cad.format(goal.targetAmount ?? 0)}, ${progress}%. View details.`
                    : `${goal.name}: ${cad.format(balance)} saved, no target set. View details.`}
                >
                  <div className="budget-card__top">
                    <span className="budget-card__name">{goal.name}</span>
                    {complete ? (
                      <span className="budget-chip budget-chip--ok">Complete</span>
                    ) : hasTarget ? (
                      <span className="budget-chip budget-chip--muted">{progress}%</span>
                    ) : (
                      <span className="budget-chip budget-chip--muted">No target</span>
                    )}
                  </div>
                  <div className="budget-card__nums">
                    <span className="budget-card__spent">{cad.format(balance)}</span>
                    {hasTarget && <span className="budget-card__of">/ {cadShort.format(goal.targetAmount ?? 0)}</span>}
                  </div>
                  {hasTarget ? (
                    <div
                      className="budget-bar goal-tile__bar"
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="budget-bar__fill goal-tile__fill" style={{ width: `${progress}%` }} />
                    </div>
                  ) : (
                    <div className="goal-tile__hint">Set a target to track progress</div>
                  )}
                  {hasTarget && (
                    <div className="budget-card__bottom">
                      <span className="budget-card__remaining" style={{ color: complete ? 'var(--income)' : 'var(--text-secondary)' }}>
                        {complete ? 'Goal reached' : `${cadShort.format(remaining)} to go`}
                      </span>
                      {goal.targetDate && !complete && (
                        <span className="budget-card__pct">
                          by {fmtTargetDate(goal.targetDate)}
                          {perMonth != null && ` · ${cadShort.format(perMonth)}/mo`}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {modal?.kind === 'add' && (
        <AddGoalModal
          onClose={() => setModal(null)}
          onAdd={async (name) => {
            await api.addGoal(name)
            await reloadGoals()
            setModal(null)
          }}
        />
      )}
      {modal?.kind === 'set-target' && (
        <SetTargetModal
          goal={modal.goal}
          onClose={() => setModal(null)}
          onSave={async (amt, date) => {
            await api.setGoalTarget(modal.goal.id, amt, date)
            await reloadGoals()
            setModal(null)
          }}
        />
      )}
      {modal?.kind === 'delete' && (
        <DeleteGoalModal
          goal={modal.goal}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await api.deleteGoal(modal.goal.id)
            await reloadGoals()
            setModal(null)
          }}
        />
      )}
    </div>
  )
}
