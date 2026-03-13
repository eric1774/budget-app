import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import type { MortgagesData, Mortgage, MortgagePayment } from '../shared/types'

const MORTGAGES_PATH = join(app.getPath('userData'), 'mortgages.json')

function readMortgages(): MortgagesData {
  if (!existsSync(MORTGAGES_PATH)) return { mortgages: [] }
  try {
    const data = JSON.parse(readFileSync(MORTGAGES_PATH, 'utf-8')) as MortgagesData
    for (const m of data.mortgages) if (!m.payments) m.payments = []
    return data
  } catch {
    return { mortgages: [] }
  }
}

function writeMortgages(data: MortgagesData): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(MORTGAGES_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getMortgages(): Mortgage[] {
  return readMortgages().mortgages
}

export function addMortgage(name: string, marketValue: number, principalBalance: number): Mortgage {
  const data = readMortgages()
  const mortgage: Mortgage = {
    id: randomUUID(),
    name: name.trim(),
    marketValue,
    principalBalance,
    payments: [],
    createdAt: new Date().toISOString(),
  }
  data.mortgages.push(mortgage)
  writeMortgages(data)
  return mortgage
}

export function updateMortgage(
  id: string,
  fields: { name?: string; marketValue?: number; principalBalance?: number },
): Mortgage | null {
  const data = readMortgages()
  const mortgage = data.mortgages.find((m) => m.id === id)
  if (!mortgage) return null
  if (fields.name !== undefined) mortgage.name = fields.name.trim()
  if (fields.marketValue !== undefined) mortgage.marketValue = fields.marketValue
  if (fields.principalBalance !== undefined) mortgage.principalBalance = fields.principalBalance
  writeMortgages(data)
  return mortgage
}

export function deleteMortgage(id: string): boolean {
  const data = readMortgages()
  const before = data.mortgages.length
  data.mortgages = data.mortgages.filter((m) => m.id !== id)
  if (data.mortgages.length === before) return false
  writeMortgages(data)
  return true
}

// ── Mortgage Payments ─────────────────────────────────────────────────────────

export function getMortgagePayments(mortgageId: string): MortgagePayment[] | null {
  const data = readMortgages()
  const mortgage = data.mortgages.find((m) => m.id === mortgageId)
  if (!mortgage) return null
  return mortgage.payments
}

export function addMortgagePayment(
  mortgageId: string,
  date: string,
  principal: number,
  interest: number,
  escrow: number,
  note?: string,
): MortgagePayment | null {
  const data = readMortgages()
  const mortgage = data.mortgages.find((m) => m.id === mortgageId)
  if (!mortgage) return null
  const payment: MortgagePayment = {
    id: randomUUID(),
    date,
    principal,
    interest,
    escrow,
    note,
    createdAt: new Date().toISOString(),
  }
  mortgage.payments.push(payment)
  mortgage.principalBalance -= principal
  writeMortgages(data)
  return payment
}

export function updateMortgagePayment(
  mortgageId: string,
  paymentId: string,
  fields: { date?: string; principal?: number; interest?: number; escrow?: number; note?: string },
): MortgagePayment | null {
  const data = readMortgages()
  const mortgage = data.mortgages.find((m) => m.id === mortgageId)
  if (!mortgage) return null
  const payment = mortgage.payments.find((p) => p.id === paymentId)
  if (!payment) return null
  // Adjust principal balance for delta
  if (fields.principal !== undefined) {
    const delta = fields.principal - payment.principal
    mortgage.principalBalance -= delta
    payment.principal = fields.principal
  }
  if (fields.date !== undefined) payment.date = fields.date
  if (fields.interest !== undefined) payment.interest = fields.interest
  if (fields.escrow !== undefined) payment.escrow = fields.escrow
  if (fields.note !== undefined) payment.note = fields.note
  writeMortgages(data)
  return payment
}

export function deleteMortgagePayment(mortgageId: string, paymentId: string): boolean {
  const data = readMortgages()
  const mortgage = data.mortgages.find((m) => m.id === mortgageId)
  if (!mortgage) return false
  const payment = mortgage.payments.find((p) => p.id === paymentId)
  if (!payment) return false
  mortgage.principalBalance += payment.principal
  mortgage.payments = mortgage.payments.filter((p) => p.id !== paymentId)
  writeMortgages(data)
  return true
}
