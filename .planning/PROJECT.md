# Budget Dashboard

## What This Is

A local Electron app that reads a single Excel file (Budget.xlsx) as its data source and renders dark-mode, glassy-card dashboards for personal finance tracking. The user logs income and expense transactions in the Excel Logbook sheet; the app watches the file and auto-refreshes all views. Planned budget amounts per category are configured inside the app and compared against actuals in a dedicated Budget tab.

## Core Value

Every transaction I log in Excel instantly becomes a clear, beautiful visual — I can see where my money goes without touching a spreadsheet.

## Requirements

### Validated

- ✓ App reads Sheet 1 (Logbook) from a user-selected Budget.xlsx file — v1.0
- ✓ App parses columns: Date, Description, Category, Income, Debit, Balance — v1.0
- ✓ File watcher detects when Budget.xlsx is saved and auto-refreshes all views — v1.0
- ✓ App auto-detects available categories from unique Category values in the Logbook — v1.0
- ✓ Dark mode throughout with glassy/frosted card components — v1.0
- ✓ Summary cards: total income, total expenses, net cash flow, current balance — v1.0
- ✓ Monthly income vs expenses chart by month — v1.0
- ✓ YTD category breakdown chart (totals per category for current year) — v1.0
- ✓ Running balance chart (account balance plotted over time from Balance column) — v1.0
- ✓ Date range filter with presets (this month, this year, custom range) — v1.0
- ✓ Category toggle (show/hide individual categories, affects all charts) — v1.0
- ✓ Per-chart type switcher (bar, line, pie) — v1.0
- ✓ Chart/filter interactions include smooth CSS transitions — v1.0
- ✓ User can set planned monthly budget per category in-app — v1.0
- ✓ Budget vs actual comparison: planned vs spent per category with over/under indicator — v1.0

### Active

- [ ] Category drill-down view — spending over time for a single selected category
- [ ] Export report as PDF or image
- [ ] Credit card transaction filter (Credit column flag)
- [ ] Monthly budget targets that vary by month (v1 uses same amount every month)

### Out of Scope

- Sheet 2 (YTD sheet) — all data derived from Sheet 1 Logbook
- Write-back to Excel — app is read-only against the file
- Cloud sync / multi-device — local only
- Mobile app — desktop Electron only
- Multi-user / accounts — personal tool, single user

## Context

- **Shipped:** v1.0 MVP (2026-02-22) — full dashboard from Excel input to interactive visual output
- **Codebase:** ~35,400 LOC TypeScript/TSX, 35 files, Electron + React + Recharts
- **Tech stack:** Electron (electron-vite), React 18, TypeScript, Recharts, xlsx (SheetJS), chokidar
- **Data source:** Budget.xlsx on user's local machine — Logbook columns: Date, Description, Category, Income, Debit, Balance, Credit, Notes
- **Persistence:** `userData/settings.json` via Electron's app.getPath — stores file path and budget amounts
- **Known issue:** Phase 3 ROADMAP.md checkbox was not marked `[x]` during execution (cosmetic only; all work complete and human-verified)

## Constraints

- **Data**: Read-only access to Budget.xlsx via file system watch — no database
- **Platform**: Desktop Electron app, no internet dependency at runtime
- **Aesthetic**: Dark mode, glassy/frosted glass cards, fintech visual language throughout

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Excel as backend | User already maintains Budget.xlsx manually — no migration cost | ✓ Good — seamless for user |
| Planned budgets stored in app (not Excel) | No budget sheet in Excel; keeps Excel simple | ✓ Good — settings.json persistence works well |
| File watcher for refresh (chokidar) | Seamless — user saves Excel, dashboard updates | ✓ Good — retry/debounce handles edge cases |
| Parse date strings as local time | `new Date(y, m-1, 1)` not ISO constructor to avoid UTC off-by-one | ✓ Good — fixed month label bug in BudgetTab |
| Electron + electron-vite | Fast dev setup, hot reload, IPC bridge pattern | ✓ Good — clean main/renderer separation |
| Income excluded from budget categories | Income categories shouldn't have budget targets | ✓ Good — fixed in 04-03 |

---
*Last updated: 2026-02-23 after v1.0 milestone*
