# Roadmap: Budget Dashboard

## Milestones

- ✅ **v1.0 MVP** — Phases 1–4 (shipped 2026-02-22)
- ✅ **v1.1 Mobile + Log** — Phases 5–7 (shipped 2026-02-25)
- 🔄 **v1.2 Assets Tracker** — Phases 8–12 (started 2026-03-02)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–4) — SHIPPED 2026-02-22</summary>

- [x] Phase 1: Data Foundation (3/3 plans) — completed 2026-02-22
- [x] Phase 2: Core Dashboard (3/3 plans) — completed 2026-02-22
- [x] Phase 3: Filters & Controls (3/3 plans) — completed 2026-02-22
- [x] Phase 4: Budget Configuration (3/3 plans) — completed 2026-02-22

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Mobile + Log (Phases 5–7) — SHIPPED 2026-02-25</summary>

- [x] Phase 5: Local Server + Sync (3/3 plans) — completed 2026-02-24
- [x] Phase 6: PWA + Responsive UI (4/4 plans) — completed 2026-02-25
- [x] Phase 7: Log Tab (3/3 plans) — completed 2026-02-25

Full archive: `.planning/milestones/v1.1-ROADMAP.md`

</details>

### v1.2 Assets Tracker (Phases 8–11)

- [ ] **Phase 8: Asset Data Layer** — assets.json schema, IPC channels, account + snapshot CRUD persistence
- [ ] **Phase 9: Assets Tab UI** — tab navigation, account cards, overview summary, snapshot entry, history charts, mobile PWA
- [ ] **Phase 10: Goal Tracking** — goal fields, progress bar, projected completion, contribution rate, on-track indicator
- [ ] **Phase 11: Certificate Tracking** — certificate fields, projected growth, dividend payout log, projected vs actual comparison
- [ ] **Phase 12: Net Worth Tracker** — total net worth figure, net worth history chart over time, breakdown by account type

## Phase Details

### Phase 8: Asset Data Layer
**Goal**: Asset accounts and balance snapshots can be created, edited, deleted, and persisted to disk across app restarts
**Depends on**: Nothing (new data domain, no dependency on Phases 1–7)
**Requirements**: ACCT-01, ACCT-02, ACCT-03, ACCT-04, ACCT-05
**Success Criteria** (what must be TRUE):
  1. User can add an account with a name and type (Standard / Goal / Certificate) and it persists after restarting the app
  2. User can rename an account or change its type and the change survives an app restart
  3. User can delete an account — after confirming the prompt the account is gone and does not reappear
  4. User can record a balance snapshot (amount, date, optional note) on any account and retrieve it after restarting
  5. User can edit or delete a previously saved snapshot and the change is immediately reflected in the stored data
**Plans**: 2 plans

Plans:
- [ ] 08-01-PLAN.md — Asset types + assets-store.ts CRUD (types.ts + assets-store.ts)
- [ ] 08-02-PLAN.md — IPC handler registration in main/index.ts (7 assets: channels)

### Phase 9: Assets Tab UI
**Goal**: Users can see and manage all asset accounts from the Assets tab, including history charts, and the full view works on the mobile PWA
**Depends on**: Phase 8 (data layer must exist before UI can read/write it)
**Requirements**: OVER-01, OVER-02, OVER-03, OVER-04, HIST-01, HIST-02
**Success Criteria** (what must be TRUE):
  1. An Assets tab appears in the main navigation alongside Dashboard, Budget, and Log tabs
  2. The Assets tab displays a total net assets figure (sum of all current account balances)
  3. Each account is shown as a card displaying current balance, account type, and last-updated date
  4. Tapping an account card shows a balance-over-time line chart for that account
  5. Tapping an account card shows a per-period change bar chart for that account
  6. The Assets tab and all account data load correctly in the mobile PWA at port 3737
**Plans**: TBD

### Phase 10: Goal Tracking
**Goal**: Goal-type accounts show progress toward a target and tell the user whether they are on track
**Depends on**: Phase 9 (account cards must exist before goal UI layer can be added)
**Requirements**: GOAL-01, GOAL-02, GOAL-03, GOAL-04, GOAL-05
**Success Criteria** (what must be TRUE):
  1. User can set a target amount and target date on a Goal account and the values persist
  2. A progress bar on the Goal account card shows current balance as a percentage of the target amount
  3. A projected completion date is displayed, calculated from the average contribution rate across snapshots
  4. Required monthly and yearly contribution amounts to hit the goal on time are displayed
  5. An on-track / off-track status indicator is visible, based on expected vs actual balance at the current date
**Plans**: TBD

### Phase 11: Certificate Tracking
**Goal**: Certificate-type accounts display projected growth and let the user log actual dividend payouts and compare them to projections
**Depends on**: Phase 9 (account cards must exist before certificate UI layer can be added)
**Requirements**: CERT-01, CERT-02, CERT-03, CERT-04
**Success Criteria** (what must be TRUE):
  1. User can enter principal, annual interest rate, and maturity date on a Certificate account and the values persist
  2. A projected balance at maturity is displayed based on principal and rate
  3. User can log a dividend payout (date + amount) against a Certificate account
  4. A comparison view shows projected cumulative dividends vs actual payouts logged to date
**Plans**: TBD

### Phase 12: Net Worth Tracker
**Goal**: Users can see their total net worth, how it has grown over time, and how it breaks down across account types
**Depends on**: Phase 9 (account data must exist), Phases 10 & 11 (all account types populated)
**Requirements**: NW-01, NW-02, NW-03
**Success Criteria** (what must be TRUE):
  1. A total net worth figure is displayed showing the sum of all current asset account balances
  2. A net worth history chart shows total assets over time, derived from all account snapshots combined
  3. A breakdown shows how net worth is split across Standard, Goal, and Certificate account types
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Foundation | v1.0 | 3/3 | Complete | 2026-02-22 |
| 2. Core Dashboard | v1.0 | 3/3 | Complete | 2026-02-22 |
| 3. Filters & Controls | v1.0 | 3/3 | Complete | 2026-02-22 |
| 4. Budget Configuration | v1.0 | 3/3 | Complete | 2026-02-22 |
| 5. Local Server + Sync | v1.1 | 3/3 | Complete | 2026-02-24 |
| 6. PWA + Responsive UI | v1.1 | 4/4 | Complete | 2026-02-25 |
| 7. Log Tab | v1.1 | 3/3 | Complete | 2026-02-25 |
| 8. Asset Data Layer | 1/2 | In Progress|  | — |
| 9. Assets Tab UI | v1.2 | 0/? | Not started | — |
| 10. Goal Tracking | v1.2 | 0/? | Not started | — |
| 11. Certificate Tracking | v1.2 | 0/? | Not started | — |
| 12. Net Worth Tracker | v1.2 | 0/? | Not started | — |
