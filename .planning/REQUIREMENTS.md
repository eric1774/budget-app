# Requirements: Budget Dashboard

**Defined:** 2026-02-23
**Core Value:** Every transaction I log in Excel instantly becomes a clear, beautiful visual — I can see where my money goes without touching a spreadsheet.

## v1.1 Requirements

### Local Network Server

- [x] **SRV-01**: Electron app starts a local HTTP server on a configurable port (default: 3737) when launched
- [x] **SRV-02**: HTTP server serves the React app as a PWA to any browser on the same Wi-Fi network
- [x] **SRV-03**: Server sends live data updates to connected clients via WebSocket when Budget.xlsx changes
- [x] **SRV-04**: App displays the local network URL (e.g., `http://192.168.x.x:3737`) so user can open it on phone

### PWA

- [x] **PWA-01**: Web app includes a PWA manifest (name, icon, theme color) so it can be installed to phone home screen
- [x] **PWA-02**: App works correctly in mobile browsers (Safari on iOS, Chrome on Android)

### Responsive UI

- [x] **RESP-01**: Dashboard tab layout adapts to mobile screen widths (cards stack vertically, charts resize)
- [x] **RESP-02**: Budget tab adapts to mobile (comparison table scrolls or reflows on small screens)
- [x] **RESP-03**: Tab navigation is usable with touch (tap targets large enough, no hover-only interactions)

### Log Tab

- [x] **LOG-01**: A "Log" tab appears in the tab bar next to Dashboard and Budget
- [x] **LOG-02**: Log tab displays all Logbook transactions in a table with columns: Date, Description, Category, Income, Debit, Balance
- [x] **LOG-03**: Log tab has a date range filter (same presets: this month, this year, custom)
- [x] **LOG-04**: Log tab has a category filter (multi-select chips, same as Dashboard)
- [x] **LOG-05**: Log tab has an income/expense toggle (all / income only / expenses only)
- [x] **LOG-06**: Log tab has a searchable description filter — user can type to match descriptions (like Excel column filter)

### Sync

- [x] **SYNC-01**: Chokidar debounce is tuned for fast pickup (≤1s after file write) to minimize delay when OneDrive syncs edited file to disk

## Future Requirements

### Enhancements

- **ENH-01**: Category drill-down view — spending over time for a single selected category
- **ENH-02**: Export report as PDF or image
- **ENH-03**: Credit card transaction filter (Credit column flag)
- **ENH-04**: Monthly budget targets that vary by month

## Out of Scope

| Feature | Reason |
|---------|--------|
| OneDrive API / cloud backend | Local network only — desktop must be on same Wi-Fi |
| Remote access away from home Wi-Fi | By design — no backend to host |
| Native iOS/Android app | PWA covers mobile use case |
| Write-back to Excel | App is read-only; Excel is the source of truth |
| Multi-user / accounts | Personal tool, single user |
| Balance column filtering in Log tab | Display only — filtering by balance not needed |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SRV-01 | Phase 5 | Complete |
| SRV-02 | Phase 5 | Complete |
| SRV-03 | Phase 5 | Complete |
| SRV-04 | Phase 5 | Complete |
| PWA-01 | Phase 6 | Complete |
| PWA-02 | Phase 6 | Complete |
| RESP-01 | Phase 6 | Complete |
| RESP-02 | Phase 6 | Complete |
| RESP-03 | Phase 6 | Complete |
| LOG-01 | Phase 7 | Complete |
| LOG-02 | Phase 7 | Complete |
| LOG-03 | Phase 7 | Complete |
| LOG-04 | Phase 7 | Complete |
| LOG-05 | Phase 7 | Complete |
| LOG-06 | Phase 7 | Complete |
| SYNC-01 | Phase 5 | Complete |

**Coverage:**
- v1.1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after roadmap creation (v1.1)*
