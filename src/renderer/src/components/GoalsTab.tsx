import { useState, useCallback, useEffect } from 'react'
import type { Goal } from '../../../shared/types'
import { GlassCard } from './GlassCard'
import { AddGoalModal, SetTargetModal, DeleteGoalModal } from './GoalModals'

// ── Helpers ──────────────────────────────────────────────────────────────────

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function goalBalance(goal: Goal): number {
  return goal.contributions.reduce((sum, c) => sum + c.amount, 0)
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
}

export function GoalsTab({ onGoalSelect }: GoalsTabProps): JSX.Element {
  const [goals, setGoals] = useState<Goal[]>([])
  const [modal, setModal] = useState<ModalState>(null)

  const reloadGoals = useCallback(async () => {
    try {
      const data = await window.electronAPI.invoke('goals:get-all')
      setGoals(Array.isArray(data) ? data : [])
    } catch {
      setGoals([])
    }
  }, [])

  useEffect(() => {
    reloadGoals()
  }, [reloadGoals])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Goals</h2>
        <button
          style={{
            background: 'var(--color-accent)',
            color: '#1a1d23',
            border: 'none',
            borderRadius: 6,
            padding: '8px 16px',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
          onClick={() => setModal({ kind: 'add' })}
        >
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          {goals.map((goal) => {
            const balance = goalBalance(goal)
            const progress = goalProgress(goal)
            const hasTarget = goal.targetAmount != null && goal.targetAmount > 0

            return (
              <div
                key={goal.id}
                onClick={() => onGoalSelect(goal)}
                style={{ cursor: 'pointer' }}
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
                        style={{
                          background: 'rgba(239,68,68,0.12)',
                          color: '#ef4444',
                          border: '1px solid rgba(239,68,68,0.25)',
                          borderRadius: 6,
                          padding: '5px 8px',
                          fontSize: 14,
                          cursor: 'pointer',
                          lineHeight: 1,
                        }}
                        onClick={() => setModal({ kind: 'delete', goal })}
                        aria-label={`Delete ${goal.name}`}
                      >
                        &times;
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
            await window.electronAPI.invoke('goals:add', name)
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
            await window.electronAPI.invoke('goals:set-target', modal.goal.id, amt, date)
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
            await window.electronAPI.invoke('goals:delete', modal.goal.id)
            await reloadGoals()
            setModal(null)
          }}
        />
      )}
    </div>
  )
}
