import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { Goal } from '../../../shared/types'
import { GlassCard } from './GlassCard'

// ── Formatter ─────────────────────────────────────────────────────────────────

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// ── Calculation helpers ───────────────────────────────────────────────────────

function goalBalance(goal: Goal): number {
  return goal.contributions.reduce((sum, c) => sum + c.amount, 0)
}

function goalProgress(goal: Goal): number {
  if (!goal.targetAmount) return 0
  return Math.min(100, Math.round((goalBalance(goal) / goal.targetAmount) * 100))
}

function monthsBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA)
  const b = new Date(dateB)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function averageMonthlyContribution(goal: Goal): number | null {
  if (goal.contributions.length === 0) return null
  const sorted = [...goal.contributions].sort((a, b) => a.date.localeCompare(b.date))
  const firstDate = sorted[0].date
  const monthsElapsed = Math.max(1, monthsBetween(firstDate, todayISO()))
  return goalBalance(goal) / monthsElapsed
}

function projectedCompletionDate(goal: Goal): string | null {
  if (!goal.targetAmount) return null
  const avgRate = averageMonthlyContribution(goal)
  if (avgRate === null || avgRate <= 0) return null
  const balance = goalBalance(goal)
  const remaining = goal.targetAmount - balance
  const monthsNeeded = Math.ceil(remaining / avgRate)
  const now = new Date()
  const projected = new Date(now.getFullYear(), now.getMonth() + monthsNeeded, 1)
  return projected.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

function requiredMonthly(goal: Goal): number | null {
  if (!goal.targetAmount || !goal.targetDate) return null
  const monthsLeft = Math.max(1, monthsBetween(todayISO(), goal.targetDate))
  const balance = goalBalance(goal)
  const remaining = goal.targetAmount - balance
  if (remaining <= 0) return 0
  return remaining / monthsLeft
}

function requiredYearly(goal: Goal): number | null {
  const monthly = requiredMonthly(goal)
  if (monthly === null) return null
  return monthly * 12
}

function isOnTrack(goal: Goal): boolean | null {
  if (!goal.targetAmount || !goal.targetDate || goal.contributions.length === 0) return null
  const sorted = [...goal.contributions].sort((a, b) => a.date.localeCompare(b.date))
  const firstContributionDate = sorted[0].date
  const totalMonths = Math.max(1, monthsBetween(firstContributionDate, goal.targetDate))
  const rawElapsed = monthsBetween(firstContributionDate, todayISO())
  const elapsedMonths = Math.max(0, Math.min(rawElapsed, totalMonths))
  const expectedBalance = (goal.targetAmount / totalMonths) * elapsedMonths
  return goalBalance(goal) >= expectedBalance
}

function isPastDue(goal: Goal): boolean {
  if (!goal.targetDate) return false
  return todayISO() > goal.targetDate
}

function balanceChartData(goal: Goal): { date: string; balance: number }[] {
  const sorted = [...goal.contributions].sort((a, b) => a.date.localeCompare(b.date))
  let running = 0
  return sorted.map((c) => {
    running += c.amount
    return { date: c.date, balance: running }
  })
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface GoalDetailViewProps {
  goal: Goal
  onBack: () => void
  onReload: () => Promise<void>
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GoalDetailView({ goal, onBack, onReload }: GoalDetailViewProps): JSX.Element {
  const [showAddForm, setShowAddForm] = useState(false)
  const [formAmount, setFormAmount] = useState('')
  const [formDate, setFormDate] = useState(todayISO())
  const [formNote, setFormNote] = useState('')
  const [saving, setSaving] = useState(false)

  const balance = goalBalance(goal)
  const progress = goalProgress(goal)
  const avgRate = averageMonthlyContribution(goal)
  const projected = projectedCompletionDate(goal)
  const reqMonthly = requiredMonthly(goal)
  const reqYearly = requiredYearly(goal)
  const onTrack = isOnTrack(goal)
  const pastDue = isPastDue(goal)
  const chartData = balanceChartData(goal)
  const complete = goal.targetAmount != null && balance >= goal.targetAmount

  const sortedContributions = [...goal.contributions].sort((a, b) => b.date.localeCompare(a.date))

  async function handleSave(): Promise<void> {
    const amount = parseFloat(formAmount)
    if (isNaN(amount) || !formDate) return
    setSaving(true)
    try {
      await window.electronAPI.invoke('goals:add-contribution', goal.id, amount, formDate, formNote || undefined)
      await onReload()
      setShowAddForm(false)
      setFormAmount('')
      setFormDate(todayISO())
      setFormNote('')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteContribution(contributionId: string): Promise<void> {
    await window.electronAPI.invoke('goals:delete-contribution', goal.id, contributionId)
    await onReload()
  }

  // Badge rendering
  let badge: JSX.Element | null = null
  if (onTrack !== null) {
    if (pastDue && !complete) {
      badge = (
        <span style={{
          display: 'inline-block',
          background: 'rgba(248,113,113,0.2)',
          color: '#f87171',
          borderRadius: 6,
          padding: '3px 10px',
          fontSize: 13,
          fontWeight: 600,
        }}>
          Past Due
        </span>
      )
    } else if (onTrack) {
      badge = (
        <span style={{
          display: 'inline-block',
          background: 'rgba(74,222,128,0.2)',
          color: '#4ade80',
          borderRadius: 6,
          padding: '3px 10px',
          fontSize: 13,
          fontWeight: 600,
        }}>
          On Track
        </span>
      )
    } else {
      badge = (
        <span style={{
          display: 'inline-block',
          background: 'rgba(251,146,60,0.2)',
          color: '#fb923c',
          borderRadius: 6,
          padding: '3px 10px',
          fontSize: 13,
          fontWeight: 600,
        }}>
          Off Track
        </span>
      )
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-accent)',
            fontSize: 15,
            fontWeight: 600,
            padding: '4px 0',
          }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
          {goal.name}
        </h2>
        {badge && <div>{badge}</div>}
      </div>

      {/* Progress section */}
      <GlassCard style={{ marginBottom: 16 }}>
        {goal.targetAmount ? (
          <>
            <div style={{
              width: '100%',
              height: 10,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 5,
              marginBottom: 8,
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                background: 'var(--color-accent)',
                borderRadius: 5,
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              {cadFormatter.format(balance)} of {cadFormatter.format(goal.targetAmount)} ({progress}%)
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Set a target to track progress
          </div>
        )}
      </GlassCard>

      {/* Stats row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        <GlassCard>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Projected Completion
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            {projected ?? 'Add contributions to project'}
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Avg Monthly
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            {avgRate != null ? cadFormatter.format(avgRate) : '—'}
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Required Monthly
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            {reqMonthly != null ? cadFormatter.format(reqMonthly) : (goal.targetDate ? '—' : 'No target date set')}
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Required Yearly
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            {reqYearly != null ? cadFormatter.format(reqYearly) : '—'}
          </div>
        </GlassCard>
      </div>

      {/* Balance over time chart */}
      <GlassCard style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 12 }}>
          Balance Over Time
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v) => cadFormatter.format(v as number) as unknown as string}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{ background: 'rgba(30,34,45,0.95)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--text-primary)', marginBottom: 4 }}
                formatter={(value) => [cadFormatter.format(value as number), 'Balance'] as unknown as [string, string]}
              />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '16px 0' }}>
            No contributions yet — log your first contribution below
          </div>
        )}
      </GlassCard>

      {/* Contribution log section */}
      <GlassCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Contributions
          </div>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                background: 'var(--color-accent)',
                color: '#1a1d23',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Add Contribution
            </button>
          )}
        </div>

        {/* Add form */}
        {showAddForm && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Amount</label>
                <input
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="e.g. 500"
                  required
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 2, minWidth: 160 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Note (optional)</label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="e.g. Monthly transfer"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving || !formAmount || !formDate}
                style={{
                  background: 'var(--color-accent)',
                  color: '#1a1d23',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 16px',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setFormAmount(''); setFormNote(''); setFormDate(todayISO()) }}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--text-muted)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Contribution list */}
        {sortedContributions.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No contributions yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedContributions.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 6,
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{c.date}</span>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: c.amount >= 0 ? '#4ade80' : '#f87171',
                    whiteSpace: 'nowrap',
                  }}>
                    {c.amount >= 0 ? '+' : ''}{cadFormatter.format(c.amount)}
                  </span>
                  {c.note && (
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.note}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteContribution(c.id)}
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 14,
                    cursor: 'pointer',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                  aria-label="Delete contribution"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
