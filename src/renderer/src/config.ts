/**
 * Categories treated as savings/transfers rather than expenses.
 * These are excluded from "Total Expenses" and summed in a dedicated "Savings" card.
 * Update this list if your Budget.xlsx categories change.
 */
export const SAVINGS_CATEGORIES: ReadonlySet<string> = new Set([
  'House Fund',
  'Retirement',
  'Savings',
  'SAVINGS!',
])
