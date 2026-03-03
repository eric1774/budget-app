# Requirements: Budget Dashboard

**Defined:** 2026-02-23
**Core Value:** Every transaction I log in Excel instantly becomes a clear, beautiful visual — I can see where my money goes without touching a spreadsheet.

## v1.2 Requirements

### Account Management

- [x] **ACCT-01**: User can add a new asset account with a name and type (Standard / Goal / Certificate)
- [x] **ACCT-02**: User can edit an existing account's name and type
- [x] **ACCT-03**: User can remove an account (with confirmation prompt)
- [x] **ACCT-04**: User can record a balance snapshot for any account (amount + date + optional note)
- [x] **ACCT-05**: User can edit or delete a previously recorded snapshot

### Assets Tab Overview

- [x] **OVER-01**: User sees a dedicated Assets tab in the main navigation
- [x] **OVER-02**: User sees total net assets (sum of all current account balances) as a summary figure
- [x] **OVER-03**: User sees account cards listing current balance, account type, and last-updated date
- [x] **OVER-04**: Assets tab and all account data is accessible in the PWA on mobile

### Account History

- [x] **HIST-01**: User can view a balance-over-time line chart for any individual account
- [x] **HIST-02**: User can view a per-period change bar chart for any individual account (change between snapshots by period)

### Goal Tracking

- [x] **GOAL-01**: User can set a target amount and target date on a Goal-type account
- [x] **GOAL-02**: User sees a progress bar showing current balance vs target amount
- [x] **GOAL-03**: User sees a projected completion date calculated from average contribution rate
- [x] **GOAL-04**: User sees the required monthly and yearly contribution needed to hit the goal on time
- [x] **GOAL-05**: User sees an on-track / off-track status indicator based on expected vs actual progress

### Certificate Tracking

- [ ] **CERT-01**: User can enter principal, annual interest rate, and maturity date for a Certificate-type account
- [ ] **CERT-02**: User sees projected balance at maturity based on principal and rate
- [ ] **CERT-03**: User can log an actual dividend payout (date + amount)
- [ ] **CERT-04**: User sees a comparison of projected dividends vs actual payouts logged to date

### Net Worth Tracker

- [ ] **NW-01**: User sees a total net worth figure representing the sum of all asset account balances
- [ ] **NW-02**: User sees a net worth history chart showing total assets over time (derived from all account snapshots)
- [ ] **NW-03**: User sees a breakdown of net worth by account type (Standard / Goal / Certificate)

## Future Requirements

### Potential v1.3+

- Category drill-down view — spending over time for a single selected category
- Export report as PDF or image
- Credit card transaction filter (Credit column flag)
- Monthly budget targets that vary by month

## Out of Scope

| Feature | Reason |
|---------|--------|
| Pulling asset data from Excel | Manual snapshots are sufficient; avoids write-back complexity |
| Bank/brokerage API integrations | App is local-only by design |
| Multi-currency support | Single-currency personal tool |
| Compound interest reinvestment modeling | Out of scope for v1.2; simple projected growth sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ACCT-01 | Phase 8 | Complete |
| ACCT-02 | Phase 8 | Complete |
| ACCT-03 | Phase 8 | Complete |
| ACCT-04 | Phase 8 | Complete |
| ACCT-05 | Phase 8 | Complete |
| OVER-01 | Phase 9 | Complete |
| OVER-02 | Phase 9 | Complete |
| OVER-03 | Phase 9 | Complete |
| OVER-04 | Phase 9 | Complete |
| HIST-01 | Phase 9 | Complete |
| HIST-02 | Phase 9 | Complete |
| GOAL-01 | Phase 10 | Complete |
| GOAL-02 | Phase 10 | Complete |
| GOAL-03 | Phase 10 | Complete |
| GOAL-04 | Phase 10 | Complete |
| GOAL-05 | Phase 10 | Complete |
| CERT-01 | Phase 11 | Pending |
| CERT-02 | Phase 11 | Pending |
| CERT-03 | Phase 11 | Pending |
| CERT-04 | Phase 11 | Pending |
| NW-01 | Phase 12 | Pending |
| NW-02 | Phase 12 | Pending |
| NW-03 | Phase 12 | Pending |

**Coverage:**
- v1.2 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-03-02 after v1.2 roadmap creation — all 20 requirements mapped to Phases 8–11*
