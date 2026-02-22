# Budget Dashboard

## What This Is

A local web app that reads a single Excel file (Budget.xlsx) as its data source and renders beautiful dark-mode, glassy-card dashboards for personal finance tracking. The user manually logs income and expense transactions in the Excel Logbook sheet; the app watches the file and auto-refreshes to reflect changes. Planned budget amounts per category are configured inside the app and compared against actuals.

## Core Value

Every transaction I log in Excel instantly becomes a clear, beautiful visual — I can see where my money goes without touching a spreadsheet.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] App reads Sheet 1 (Logbook) from Budget.xlsx: Date, Description, Category, Income, Debit, Balance, Credit (credit card flag), Notes
- [ ] File watcher auto-refreshes dashboards when Budget.xlsx is saved
- [ ] User can configure planned budget amounts per category inside the app
- [ ] Monthly report view: income vs expenses by month, category breakdown
- [ ] YTD report view: year-to-date totals by category
- [ ] Category report view: spending over time per category
- [ ] Dashboard is filterable by date range
- [ ] Dashboard is filterable by category (show/hide categories)
- [ ] Chart types are configurable (bar, line, pie per widget)
- [ ] Budget vs actual comparison: planned vs spent per category
- [ ] Dark mode, glassy card aesthetic throughout
- [ ] Running balance visualization from the Balance column

### Out of Scope

- Sheet 2 (YTD breakdown) — ignored, all data derived from Sheet 1
- Write-back to Excel — app is read-only against the file
- Cloud sync or multi-device — local only
- Mobile app — desktop browser only for v1

## Context

- Data source: single Excel file (Budget.xlsx) on the user's local machine
- Logbook columns: Date | Description | Category | Income | Debit | Balance | Credit | Notes
- Income = positive transaction amount; Debit = negative/expense amount
- Balance = running bank account total (pre-computed in Excel)
- Credit column = credit card flag (paid/unpaid), not a dollar amount
- All budget categories and planned amounts are user-defined inside the app
- User is the sole user — personal finance tool, not multi-tenant

## Constraints

- **Data**: Read-only access to Budget.xlsx via file system watch — no database
- **Platform**: Runs locally in the browser, no internet dependency at runtime
- **Aesthetic**: Dark mode, glassy/frosted glass cards, fintech visual language throughout

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Excel as backend | User already maintains Budget.xlsx manually — no migration cost | — Pending |
| Planned budgets stored in app | No budget sheet in Excel; keeps Excel simple | — Pending |
| File watcher for refresh | Seamless — user saves Excel, dashboard updates | — Pending |

---
*Last updated: 2026-02-21 after initialization*
