# Requirements: Budget Dashboard

**Defined:** 2026-02-21
**Core Value:** Every transaction logged in Excel instantly becomes a clear, beautiful visual — see where money goes without touching a spreadsheet.

## v1 Requirements

### Data

- [x] **DATA-01**: App reads Sheet 1 (Logbook) from a user-selected Budget.xlsx file
- [x] **DATA-02**: App parses columns: Date, Description, Category, Income, Debit, Balance (Credit and Notes columns ignored)
- [x] **DATA-03**: File watcher detects when Budget.xlsx is saved and auto-refreshes all views
- [x] **DATA-04**: App auto-detects available categories from unique Category values in the Logbook

### Dashboard

- [x] **DASH-01**: User can see summary cards: total income, total expenses, net cash flow, current balance
- [x] **DASH-02**: User can view a monthly report chart: income vs expenses by month
- [x] **DASH-03**: User can view a YTD category breakdown chart (totals per category for current year)
- [x] **DASH-04**: User can view a running balance chart (account balance plotted over time)

### Budget Configuration

- [ ] **BUDG-01**: User can set a planned monthly amount per category in a settings/config screen
- [ ] **BUDG-02**: User can view a budget vs actual comparison: planned vs spent per category with over/under indicator

### Filters & Controls

- [x] **FILT-01**: User can filter all views by date range (presets: this month, this year; plus custom range)
- [x] **FILT-02**: User can toggle individual categories on/off, affecting all charts
- [x] **FILT-03**: User can switch chart type per widget (bar, line, pie)

### Aesthetic

- [x] **UI-01**: App uses dark mode throughout with glassy/frosted card components
- [x] **UI-02**: Chart/filter interactions include smooth transitions

## v2 Requirements

### Enhancements

- **V2-01**: Category drill-down view — spending over time for a single selected category
- **V2-02**: Export report as PDF or image
- **V2-03**: Credit card transaction filter (Credit column flag)
- **V2-04**: Monthly budget targets that vary by month (v1 uses same amount every month)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Write-back to Excel | App is read-only; Excel is the source of truth |
| Cloud sync / hosting | Local only for v1 |
| Mobile app | Desktop browser only for v1 |
| Sheet 2 (YTD sheet) | All data derived from Sheet 1 Logbook |
| Multi-user / accounts | Personal tool, single user |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| UI-01 | Phase 2 | Complete |
| DASH-01 | Phase 2 | Complete |
| DASH-02 | Phase 2 | Complete |
| DASH-03 | Phase 2 | Complete |
| DASH-04 | Phase 2 | Complete |
| FILT-01 | Phase 3 | Complete |
| FILT-02 | Phase 3 | Complete |
| FILT-03 | Phase 3 | Complete |
| UI-02 | Phase 3 | Complete |
| BUDG-01 | Phase 4 | Pending |
| BUDG-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-02-21 after initial definition*
