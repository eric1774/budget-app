# Roadmap: Budget Dashboard

## Overview

Four phases build the app from data foundation to a fully interactive, budget-aware dashboard. Phase 1 establishes reliable Excel reading and file watching. Phase 2 renders the core visual dashboard. Phase 3 adds filters and chart controls that make the data explorable. Phase 4 closes the loop with budget configuration and planned-vs-actual comparison.

## Phases

- [x] **Phase 1: Data Foundation** - Read Budget.xlsx, parse Logbook columns, auto-detect categories, watch for file changes (completed 2026-02-22)
- [x] **Phase 2: Core Dashboard** - Render dark-mode glassy UI with summary cards and all four chart views (completed 2026-02-22)
- [ ] **Phase 3: Filters & Controls** - Date range filter, category toggle, per-widget chart type switcher with smooth transitions
- [ ] **Phase 4: Budget Configuration** - In-app planned budget entry and budget-vs-actual comparison view

## Phase Details

### Phase 1: Data Foundation
**Goal**: The app reliably ingests Budget.xlsx and stays in sync as the file changes
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. User can select their Budget.xlsx file and the app reads it without error
  2. All Logbook rows are parsed with correct Date, Description, Category, Income, Debit, and Balance values
  3. After saving Budget.xlsx in Excel, the app reflects the change within a few seconds without a manual refresh
  4. All unique Category values from the Logbook are available in the app for use by filters and charts
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md — Scaffold Electron + React + TypeScript project with electron-vite and IPC bridge
- [ ] 01-02-PLAN.md — Excel parser: parse Logbook sheet into typed Transaction objects, expose categories via IPC
- [x] 01-03-PLAN.md — File picker, path persistence, chokidar watcher with retry logic, and full Phase 1 renderer (completed 2026-02-22)

### Phase 2: Core Dashboard
**Goal**: Users see a beautiful, information-rich dashboard the moment data is loaded
**Depends on**: Phase 1
**Requirements**: UI-01, DASH-01, DASH-02, DASH-03, DASH-04
**Success Criteria** (what must be TRUE):
  1. App renders in dark mode with glassy/frosted card components throughout
  2. Summary cards show correct total income, total expenses, net cash flow, and current balance
  3. Monthly income-vs-expenses chart displays bars or lines grouped by month
  4. YTD category breakdown chart shows totals per category for the current year
  5. Running balance chart plots account balance over time from the Balance column
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Dark-mode design system, GlassCard component, and 4 summary cards
- [ ] 02-02-PLAN.md — Install Recharts, build monthly/YTD/balance charts, wire into dashboard
- [ ] 02-03-PLAN.md — Human visual verification checkpoint

### Phase 3: Filters & Controls
**Goal**: Users can slice the dashboard to focus on any time window or category subset
**Depends on**: Phase 2
**Requirements**: FILT-01, FILT-02, FILT-03, UI-02
**Success Criteria** (what must be TRUE):
  1. User can select "This Month", "This Year", or a custom date range and all charts update accordingly
  2. User can toggle individual categories on/off and all charts immediately reflect the selection
  3. User can switch any chart widget between bar, line, and pie views
  4. Chart and filter changes animate with smooth transitions rather than hard redraws
**Plans**: TBD

### Phase 4: Budget Configuration
**Goal**: Users can plan their spending and instantly see how actuals compare
**Depends on**: Phase 3
**Requirements**: BUDG-01, BUDG-02
**Success Criteria** (what must be TRUE):
  1. User can open a settings screen, enter a planned monthly amount for each category, and save it
  2. A budget-vs-actual view shows each category with its planned amount, actual spend, and an over/under indicator
  3. Budget configuration persists across app restarts (no re-entry required)
**Plans**: TBD

## Progress

**Execution Order:** 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 3/3 | Complete   | 2026-02-22 |
| 2. Core Dashboard | 3/3 | Complete   | 2026-02-22 |
| 3. Filters & Controls | 0/TBD | Not started | - |
| 4. Budget Configuration | 0/TBD | Not started | - |
