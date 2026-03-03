import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import type { Goal, GoalContribution, GoalsData } from '../shared/types'

const GOALS_PATH = join(app.getPath('userData'), 'goals.json')

function readGoals(): GoalsData {
  if (!existsSync(GOALS_PATH)) return { goals: [] }
  try {
    return JSON.parse(readFileSync(GOALS_PATH, 'utf-8')) as GoalsData
  } catch {
    return { goals: [] }
  }
}

function writeGoals(data: GoalsData): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(GOALS_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

// ── Goal CRUD ────────────────────────────────────────────────────────────────

export function getGoals(): Goal[] {
  return readGoals().goals
}

export function addGoal(name: string): Goal {
  const data = readGoals()
  const goal: Goal = {
    id: randomUUID(),
    name: name.trim(),
    contributions: [],
    createdAt: new Date().toISOString(),
  }
  data.goals.push(goal)
  writeGoals(data)
  return goal
}

export function updateGoal(id: string, fields: { name?: string }): Goal | null {
  const data = readGoals()
  const goal = data.goals.find(g => g.id === id)
  if (!goal) return null
  if (fields.name !== undefined) goal.name = fields.name.trim()
  writeGoals(data)
  return goal
}

export function deleteGoal(id: string): boolean {
  const data = readGoals()
  const before = data.goals.length
  data.goals = data.goals.filter(g => g.id !== id)
  if (data.goals.length === before) return false
  writeGoals(data)
  return true
}

export function setGoalTarget(
  id: string,
  targetAmount: number | null,
  targetDate: string | null
): Goal | null {
  const data = readGoals()
  const goal = data.goals.find(g => g.id === id)
  if (!goal) return null
  if (targetAmount === null) {
    delete goal.targetAmount
  } else {
    goal.targetAmount = targetAmount
  }
  if (targetDate === null) {
    delete goal.targetDate
  } else {
    goal.targetDate = targetDate
  }
  writeGoals(data)
  return goal
}

// ── Contribution CRUD ────────────────────────────────────────────────────────

export function addContribution(
  goalId: string,
  amount: number,
  date: string,
  note?: string
): GoalContribution | null {
  const data = readGoals()
  const goal = data.goals.find(g => g.id === goalId)
  if (!goal) return null
  const contribution: GoalContribution = {
    id: randomUUID(),
    amount,
    date,
    note,
  }
  goal.contributions.push(contribution)
  writeGoals(data)
  return contribution
}

export function updateContribution(
  goalId: string,
  contributionId: string,
  fields: { amount?: number; date?: string; note?: string }
): GoalContribution | null {
  const data = readGoals()
  const goal = data.goals.find(g => g.id === goalId)
  if (!goal) return null
  const contribution = goal.contributions.find(c => c.id === contributionId)
  if (!contribution) return null
  if (fields.amount !== undefined) contribution.amount = fields.amount
  if (fields.date !== undefined) contribution.date = fields.date
  if (fields.note !== undefined) contribution.note = fields.note
  writeGoals(data)
  return contribution
}

export function deleteContribution(goalId: string, contributionId: string): boolean {
  const data = readGoals()
  const goal = data.goals.find(g => g.id === goalId)
  if (!goal) return false
  const before = goal.contributions.length
  goal.contributions = goal.contributions.filter(c => c.id !== contributionId)
  if (goal.contributions.length === before) return false
  writeGoals(data)
  return true
}
