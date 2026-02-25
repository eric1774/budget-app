# Roadmap: Budget Dashboard

## Milestones

- ✅ **v1.0 MVP** — Phases 1–4 (shipped 2026-02-22)
- 🔄 **v1.1 Mobile + Log** — Phases 5–7 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–4) — SHIPPED 2026-02-22</summary>

- [x] Phase 1: Data Foundation (3/3 plans) — completed 2026-02-22
- [x] Phase 2: Core Dashboard (3/3 plans) — completed 2026-02-22
- [x] Phase 3: Filters & Controls (3/3 plans) — completed 2026-02-22
- [x] Phase 4: Budget Configuration (3/3 plans) — completed 2026-02-22

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### v1.1 Mobile + Log

- [x] **Phase 5: Local Server + Sync** — Electron serves the app over local Wi-Fi with live WebSocket updates (3 plans) (completed 2026-02-24)
- [x] **Phase 6: PWA + Responsive UI** — App installs to phone home screen and adapts to mobile screens (completed 2026-02-25)
- [x] **Phase 7: Log Tab** — Read-only transaction table with date, category, income/expense, and description filters (completed 2026-02-25)

## Phase Details

### Phase 5: Local Server + Sync
**Goal**: The Electron app serves the React dashboard over local Wi-Fi so any browser on the same network can open it and receive live data updates when Budget.xlsx changes
**Depends on**: Phase 4 (v1.0 complete)
**Requirements**: SRV-01, SRV-02, SRV-03, SRV-04, SYNC-01
**Success Criteria** (what must be TRUE):
  1. User opens the Electron app and sees a local network URL (e.g., `http://192.168.x.x:3737`) displayed in the UI
  2. User navigates to that URL on their phone browser (same Wi-Fi) and sees the full dashboard
  3. User saves Budget.xlsx and the phone browser updates within 1 second without manual refresh
  4. Chokidar picks up file changes in ≤1s after write (verified with a stopwatch-level test)
**Plans**: 3 plans

Plans:
- [ ] 05-01-PLAN.md — HTTP + WebSocket server in Electron main process (Wave 1)
- [ ] 05-02-PLAN.md — Toolbar UI: URL display, QR code popup, restart button, sync timestamp (Wave 2)
- [ ] 05-03-PLAN.md — Browser-side WebSocket client, loading skeleton, reconnect indicators (Wave 2)

### Phase 6: PWA + Responsive UI
**Goal**: Users can install the dashboard to their phone home screen and every tab is fully usable on a small touch screen
**Depends on**: Phase 5
**Requirements**: PWA-01, PWA-02, RESP-01, RESP-02, RESP-03
**Success Criteria** (what must be TRUE):
  1. On iPhone (Safari) user sees "Add to Home Screen" prompt and the installed icon launches the dashboard
  2. On Android (Chrome) user can install the app from the browser install prompt
  3. Dashboard tab on a 390px-wide screen shows summary cards stacked vertically and charts resized to full width
  4. Budget tab comparison table is scrollable horizontally or reflows cleanly on a small screen
  5. All tab navigation is tappable with a fingertip — no hover-only interactions required
**Plans**: 4 plans

Plans:
- [ ] 06-01-PLAN.md — PWA manifest, service worker, and icons (Wave 1)
- [ ] 06-02-PLAN.md — Responsive CSS: tab 44px targets, summary cards 2-col, offline badge (Wave 1)
- [ ] 06-03-PLAN.md — Budget tab horizontal scroll and mobile card stack (Wave 1)
- [ ] 06-04-PLAN.md — Human verification: PWA install and mobile layout (Wave 2)

### Phase 7: Log Tab
**Goal**: Users can browse and filter every Logbook transaction from the browser or Electron app in a dedicated Log tab
**Depends on**: Phase 5
**Requirements**: LOG-01, LOG-02, LOG-03, LOG-04, LOG-05, LOG-06
**Success Criteria** (what must be TRUE):
  1. A "Log" tab appears in the tab bar and switches to a transaction table view
  2. The table shows Date, Description, Category, Income, Debit, and Balance for all transactions
  3. User selects "This Month" date preset and the table filters to current-month transactions only
  4. User selects one or more category chips and the table shows only those categories
  5. User types a word in the description search box and the table filters to matching rows in real time
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Foundation | v1.0 | 3/3 | Complete | 2026-02-22 |
| 2. Core Dashboard | v1.0 | 3/3 | Complete | 2026-02-22 |
| 3. Filters & Controls | v1.0 | 3/3 | Complete | 2026-02-22 |
| 4. Budget Configuration | v1.0 | 3/3 | Complete | 2026-02-22 |
| 5. Local Server + Sync | 3/3 | Complete   | 2026-02-24 | - |
| 6. PWA + Responsive UI | 4/4 | Complete   | 2026-02-25 | - |
| 7. Log Tab | 3/3 | Complete   | 2026-02-25 | - |
