import { useState, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { Goal } from '../../../shared/types'
import { Trash } from '@phosphor-icons/react'
import { GlassCard } from './GlassCard'
import * as api from '../api'

// ── Formatter ─────────────────────────────────────────────────────────────────

const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// ── Calculation helpers ───────────────────────────────────────────────────────

function contributionsTotal(goal: Goal): number {
  return goal.contributions.reduce((sum, c) => sum + c.amount, 0)
}

function goalBalance(goal: Goal): number {
  return (goal.startingAmount ?? 0) + contributionsTotal(goal)
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
  return contributionsTotal(goal) / monthsElapsed
}

function projectedCompletionDate(goal: Goal): string | null {
  if (!goal.targetAmount) return null
  const avgRate = averageMonthlyContribution(goal)
  if (avgRate === null || avgRate <= 0) return null
  const balance = goalBalance(goal)
  const remaining = goal.targetAmount - balance
  if (remaining <= 0) return 'Complete'
  const monthsNeeded = Math.ceil(remaining / avgRate)
  const now = new Date()
  const projected = new Date(now.getFullYear(), now.getMonth() + monthsNeeded, 1)
  return projected.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

function requiredMonthly(goal: Goal): number | null {
  if (!goal.targetAmount || !goal.targetDate) return null
  const monthsLeft = Math.max(1, monthsBetween(todayISO(), goal.targetDate))
  const remaining = goal.targetAmount - goalBalance(goal)
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
  const remaining = goal.targetAmount - (goal.startingAmount ?? 0)
  const expectedContributions = (remaining / totalMonths) * elapsedMonths
  return contributionsTotal(goal) >= expectedContributions
}

function isPastDue(goal: Goal): boolean {
  if (!goal.targetDate) return false
  return todayISO() > goal.targetDate
}

function balanceChartData(goal: Goal): { date: string; balance: number }[] {
  const sorted = [...goal.contributions].sort((a, b) => a.date.localeCompare(b.date))
  let running = goal.startingAmount ?? 0
  return sorted.map((c) => {
    running += c.amount
    return { date: c.date, balance: running }
  })
}

// ── Growth projection helpers ─────────────────────────────────────────────────

interface GrowthPoint {
  label: string
  withoutContrib: number
  withContrib: number
}

function buildGrowthData(
  principal: number,
  annualRatePct: number,
  monthlyContrib: number,
  months: number
): GrowthPoint[] {
  const r = annualRatePct / 100 / 12  // monthly rate
  const points: GrowthPoint[] = []
  const now = new Date()
  for (let i = 0; i <= months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const label = d.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
    const withoutContrib = r === 0
      ? principal
      : principal * Math.pow(1 + r, i)
    const withContrib = r === 0
      ? principal + monthlyContrib * i
      : principal * Math.pow(1 + r, i) + monthlyContrib * ((Math.pow(1 + r, i) - 1) / r)
    points.push({ label, withoutContrib, withContrib })
  }
  return points
}

function monthsUntilTarget(principal: number, annualRatePct: number, monthlyContrib: number, target: number): number | null {
  if (principal >= target) return 0
  const r = annualRatePct / 100 / 12
  if (r === 0 && monthlyContrib === 0) return null
  for (let n = 1; n <= 600; n++) {
    const val = r === 0
      ? principal + monthlyContrib * n
      : principal * Math.pow(1 + r, n) + monthlyContrib * ((Math.pow(1 + r, n) - 1) / r)
    if (val >= target) return n
  }
  return null
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
  const [editingStarting, setEditingStarting] = useState(false)
  const [startingInput, setStartingInput] = useState('')
  const startingInputRef = useRef<HTMLInputElement>(null)
  const [rateInput, setRateInput] = useState(String(goal.dividendRate ?? ''))
  const [editingRate, setEditingRate] = useState(false)
  const rateInputRef = useRef<HTMLInputElement>(null)

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
      await api.addContribution(goal.id, amount, formDate, formNote || undefined)
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
    await api.deleteContribution(goal.id, contributionId)
    await onReload()
  }

  function beginEditStarting(): void {
    setStartingInput(String(goal.startingAmount ?? ''))
    setEditingStarting(true)
    setTimeout(() => startingInputRef.current?.focus(), 0)
  }

  async function saveStartingAmount(): Promise<void> {
    const val = startingInput.trim()
    const parsed = val === '' ? null : parseFloat(val)
    if (parsed !== null && isNaN(parsed)) return
    await api.setGoalStartingAmount(goal.id, parsed)
    await onReload()
    setEditingStarting(false)
  }

  async function saveDividendRate(): Promise<void> {
    const val = rateInput.trim()
    const parsed = val === '' ? null : parseFloat(val)
    if (parsed !== null && isNaN(parsed)) return
    await api.setGoalDividendRate(goal.id, parsed)
    await onReload()
    setEditingRate(false)
  }

  // Badge rendering
  let badge: JSX.Element | null = null
  if (onTrack !== null) {
    if (pastDue && !complete) {
      badge = (
        <span style={{
          display: 'inline-block',
          background: 'var(--expense-bg)',
          color: 'var(--expense)',
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
          background: 'var(--success-bg)',
          color: 'var(--success)',
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
          background: 'var(--warning-bg)',
          color: 'var(--warning)',
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
    <div className="detail-outer">
      {/* Header */}
      <div className="detail-head">
        <button
          className="btn-ghost"
          onClick={onBack}
          aria-label="Go back to goals list"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back
        </button>
        <h2 className="page-title">{goal.name}</h2>
        {badge && <div>{badge}</div>}
      </div>

      {/* Progress section */}
      <GlassCard style={{ marginBottom: 16 }}>
        {goal.targetAmount ? (
          <div className="budget-hero__main">
            <div className="budget-hero__label">Progress</div>
            <div className="budget-hero__value">
              {cadFormatter.format(balance)}
              <span className="budget-hero__of"> of {cadFormatter.format(goal.targetAmount)} · {progress}%</span>
            </div>
            <div
              className="budget-bar budget-bar--hero"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="budget-bar__fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Set a target to track progress
          </div>
        )}
      </GlassCard>

      {/* Starting Amount */}
      <GlassCard style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
            Starting Amount
          </div>
          {editingStarting ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
              <input
                ref={startingInputRef}
                type="number"
                value={startingInput}
                onChange={(e) => setStartingInput(e.target.value)}
                placeholder="0.00"
                onKeyDown={(e) => { if (e.key === 'Enter') saveStartingAmount(); if (e.key === 'Escape') setEditingStarting(false) }}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border-accent)',
                  borderRadius: 6,
                  padding: '5px 10px',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  width: 140,
                }}
              />
              <button className="btn-primary" onClick={saveStartingAmount} style={{ padding: '5px 14px', fontSize: 13 }}>Save</button>
              <button className="btn-ghost" onClick={() => setEditingStarting(false)} style={{ padding: '5px 10px', fontSize: 13 }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1 }}>
              <span className="summary-card__value" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
                {goal.startingAmount != null ? cadFormatter.format(goal.startingAmount) : <span style={{ color: 'var(--text-muted)' }}>Not set</span>}
              </span>
              <button
                className="btn-ghost"
                onClick={beginEditStarting}
                style={{ padding: '3px 10px', fontSize: 12 }}
              >
                {goal.startingAmount != null ? 'Edit' : 'Set Starting Amount'}
              </button>
              {goal.startingAmount != null && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  — excluded from contribution stats
                </span>
              )}
            </div>
          )}
        </div>
      </GlassCard>

      {/* Stats row */}
      <div className="summary-cards" style={{ marginBottom: 4 }}>
        <GlassCard>
          <div className="summary-card__label" style={{ marginBottom: 4 }}>
            Projected Completion
          </div>
          <div className="summary-card__value" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
            {projected ?? 'Add contributions to project'}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="summary-card__label" style={{ marginBottom: 4 }}>
            Avg Monthly
          </div>
          <div className="summary-card__value" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
            {avgRate != null ? cadFormatter.format(avgRate) : '—'}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="summary-card__label" style={{ marginBottom: 4 }}>
            Required Monthly
          </div>
          <div className="summary-card__value" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
            {reqMonthly != null ? cadFormatter.format(reqMonthly) : (goal.targetDate ? '—' : 'No target date set')}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="summary-card__label" style={{ marginBottom: 4 }}>
            Required Yearly
          </div>
          <div className="summary-card__value" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
            {reqYearly != null ? cadFormatter.format(reqYearly) : '—'}
          </div>
        </GlassCard>
      </div>

      {/* Balance over time chart */}
      <GlassCard style={{ marginBottom: 20 }}>
        <div className="chart-card__title" style={{ display: 'block', marginBottom: 12 }}>
          Balance Over Time
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v) => cadFormatter.format(v as number) as unknown as string}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{ background: 'rgba(15,22,35,0.97)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}
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

      {/* Certificate Growth Projector */}
      {(() => {
        const currentBalance = goalBalance(goal)
        const avgMonthly = averageMonthlyContribution(goal) ?? 0
        const rate = goal.dividendRate ?? 0
        const projMonths = goal.targetDate
          ? Math.max(1, monthsBetween(todayISO(), goal.targetDate))
          : 60
        const growthData = rate > 0 || avgMonthly > 0
          ? buildGrowthData(currentBalance, rate, avgMonthly, projMonths)
          : []
        const noContribMonths = goal.targetAmount && rate > 0
          ? monthsUntilTarget(currentBalance, rate, 0, goal.targetAmount)
          : null
        const withContribMonths = goal.targetAmount && (rate > 0 || avgMonthly > 0)
          ? monthsUntilTarget(currentBalance, rate, avgMonthly, goal.targetAmount)
          : null

        function formatMonths(m: number | null): string {
          if (m === null) return '—'
          if (m === 0) return 'Already reached'
          const yrs = Math.floor(m / 12)
          const mos = m % 12
          if (yrs === 0) return `${mos}mo`
          if (mos === 0) return `${yrs}yr`
          return `${yrs}yr ${mos}mo`
        }

        // Determine x-axis tick interval to avoid crowding
        const tickInterval = projMonths > 36 ? Math.floor(projMonths / 6) : (projMonths > 12 ? 3 : 1)

        return (
          <GlassCard style={{ marginBottom: 20 }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div className="chart-card__title">
                Certificate Growth Projector
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Annual Dividend Rate</span>
                {editingRate ? (
                  <>
                    <input
                      ref={rateInputRef}
                      type="number"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      placeholder="e.g. 4.5"
                      step="0.01"
                      onKeyDown={(e) => { if (e.key === 'Enter') saveDividendRate(); if (e.key === 'Escape') setEditingRate(false) }}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--border-accent)',
                        borderRadius: 6,
                        padding: '4px 8px',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        width: 80,
                      }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>%</span>
                    <button className="btn-primary" onClick={saveDividendRate} style={{ padding: '4px 12px', fontSize: 12 }}>Save</button>
                    <button className="btn-ghost" onClick={() => setEditingRate(false)} style={{ padding: '4px 8px', fontSize: 12 }}>✕</button>
                  </>
                ) : (
                  <button
                    className="btn-ghost"
                    onClick={() => { setRateInput(String(goal.dividendRate ?? '')); setEditingRate(true); setTimeout(() => rateInputRef.current?.focus(), 0) }}
                    style={{ padding: '4px 12px', fontSize: 13, fontWeight: 600, color: rate > 0 ? 'var(--color-accent)' : 'var(--text-muted)' }}
                  >
                    {rate > 0 ? `${rate}%` : 'Set Rate'}
                  </button>
                )}
              </div>
            </div>

            {rate <= 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '12px 0' }}>
                Set an annual dividend rate above to project certificate growth.
              </div>
            ) : (
              <>
                {/* Milestone summary chips */}
                {goal.targetAmount && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                    <div style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      padding: '8px 14px',
                      flex: 1,
                      minWidth: 140,
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                        Growth Only
                      </div>
                      <div className="summary-card__value" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
                        {formatMonths(noContribMonths)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>to reach target</div>
                    </div>
                    <div style={{
                      background: 'rgba(32,200,160,0.08)',
                      border: '1px solid rgba(32,200,160,0.2)',
                      borderRadius: 8,
                      padding: '8px 14px',
                      flex: 1,
                      minWidth: 140,
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                        Growth + Contributions
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-accent)' }}>
                        {formatMonths(withContribMonths)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {avgMonthly > 0 ? `at ${cadFormatter.format(avgMonthly)}/mo avg` : 'no contributions logged'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Growth projection chart */}
                {growthData.length > 0 && (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={growthData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval={tickInterval}
                      />
                      <YAxis
                        tickFormatter={(v) => `$${((v as number) / 1000).toFixed(0)}k`}
                        tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                      />
                      <Tooltip
                        contentStyle={{ background: 'rgba(15,22,35,0.97)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}
                        labelStyle={{ color: 'var(--text-primary)', marginBottom: 4 }}
                        formatter={(value, name) => [
                          cadFormatter.format(value as number),
                          name === 'withoutContrib' ? 'Growth only' : 'Growth + contributions',
                        ] as [string, string]}
                        cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="withoutContrib"
                        stroke="rgba(255,255,255,0.35)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        strokeDasharray="5 3"
                      />
                      <Line
                        type="monotone"
                        dataKey="withContrib"
                        stroke="var(--color-accent)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {/* Legend */}
                <div style={{ display: 'flex', gap: 20, marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 24, height: 2, background: 'rgba(255,255,255,0.35)', borderRadius: 1, borderTop: '2px dashed rgba(255,255,255,0.35)' }} />
                    Growth only
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 24, height: 2, background: 'var(--color-accent)', borderRadius: 1 }} />
                    Growth + contributions
                  </div>
                </div>
              </>
            )}
          </GlassCard>
        )
      })()}

      {/* Contribution log section */}
      <GlassCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="chart-card__title">
            Contributions
          </div>
          {!showAddForm && (
            <button className="btn-primary" onClick={() => setShowAddForm(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Contribution
            </button>
          )}
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="pay-form">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="pay-form__field">
                <label>Amount</label>
                <input
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="e.g. 500"
                  required
                  className="date-input" style={{ width: '100%', fontFamily: 'inherit' }}
                />
              </div>
              <div className="pay-form__field">
                <label>Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  className="date-input" style={{ width: '100%', fontFamily: 'inherit' }}
                />
              </div>
              <div className="pay-form__field" style={{ flex: 2 }}>
                <label>Note (optional)</label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="e.g. Monthly transfer"
                  className="date-input" style={{ width: '100%', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving || !formAmount || !formDate}
                style={{ opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : undefined }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => { setShowAddForm(false); setFormAmount(''); setFormNote(''); setFormDate(todayISO()) }}
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
          <div className="pay-list">
            {sortedContributions.map((c) => (
              <div key={c.id} className="pay-row">
                <span className="pay-row__date">{c.date}</span>
                <span className={`pay-row__amt ${c.amount >= 0 ? 'pay-row__amt--principal' : 'pay-row__amt--out'}`}>
                  {c.amount >= 0 ? '+' : ''}{cadFormatter.format(c.amount)}
                </span>
                {c.note && <span className="pay-row__note">{c.note}</span>}
                <div className="pay-row__actions">
                  <button
                    className="btn-icon btn-icon--danger"
                    onClick={() => handleDeleteContribution(c.id)}
                    aria-label="Delete contribution"
                    style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                  >
                    <Trash size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
