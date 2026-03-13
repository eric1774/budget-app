import { useState, useCallback, useEffect } from 'react'
import type { Goal } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { AddGoalModal, SetTargetModal, DeleteGoalModal } from './GoalModals'
import { GoalDetailView } from './GoalDetailView'
import * as api from '../api'

// ── Helpers ──────────────────────────────────────────────────────────────────

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function goalBalance(goal: Goal): number {
  return (goal.startingAmount ?? 0) + goal.contributions.reduce((sum, c) => sum + c.amount, 0)
}

function goalProgress(goal: Goal): number {
  if (!goal.targetAmount) return 0
  return Math.min(100, Math.round((goalBalance(goal) / goal.targetAmount) * 100))
}

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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Goals</h2>
        <button className="btn-primary" onClick={() => setModal({ kind: 'add' })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Goal
        </button>
      </div>

      {/* Empty state */}
      {goals.length === 0 ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 15,
        }}>
          No goals yet. Add your first goal to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', padding: '2px 0' }}>
          {goals.map((goal) => {
            const balance = goalBalance(goal)
            const progress = goalProgress(goal)
            const hasTarget = goal.targetAmount != null && goal.targetAmount > 0

            return (
              <div
                key={goal.id}
                className="goal-card"
                onClick={() => onGoalSelect(goal)}
              >
                <GlassCard>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    {/* Left: name + balance + progress */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15, marginBottom: 4 }}>
                        {goal.name}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: hasTarget ? 8 : 0 }}>
                        {cadFormatter.format(balance)}
                      </div>

                      {hasTarget ? (
                        <>
                          {/* Progress bar */}
                          <div style={{
                            background: 'rgba(255,255,255,0.08)',
                            borderRadius: 3,
                            height: 6,
                            width: '100%',
                            marginBottom: 4,
                          }}>
                            <div style={{
                              width: `${progress}%`,
                              height: '100%',
                              background: 'var(--color-accent)',
                              borderRadius: 3,
                            }} />
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {progress}% of {cadFormatter.format(goal.targetAmount!)}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                          Set a target to track progress
                        </div>
                      )}
                    </div>

                    {/* Right: action buttons */}
                    <div
                      style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          color: 'var(--text-muted)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 6,
                          padding: '5px 10px',
                          fontSize: 12,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                        onClick={() => setModal({ kind: 'set-target', goal })}
                      >
                        Set Goal
                      </button>
                      <button
                        className="btn-icon btn-icon--danger"
                        onClick={() => setModal({ kind: 'delete', goal })}
                        aria-label={`Delete ${goal.name}`}
                        style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                </GlassCard>
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
