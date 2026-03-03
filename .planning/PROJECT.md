# Budget Dashboard

## What This Is

A local Electron app that reads a single Excel file (Budget.xlsx) as its data source and renders dark-mode, glassy-card dashboards for personal finance tracking. The user logs income and expense transactions in the Excel Logbook sheet; the app watches the file and auto-refreshes all views. Planned budget amounts per category are configured inside the app and compared against actuals in a dedicated Budget tab. The app also serves itself over local Wi-Fi, installs as a PWA on mobile, and provides a fully-filtered transaction log tab.

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

- ✓ Local HTTP + WebSocket server in Electron — serves data to any browser on the same Wi-Fi — v1.1
- ✓ PWA manifest — installable to phone home screen, mobile browser compatible — v1.1
- ✓ Responsive UI — Dashboard, Budget, and Log tabs adapt to mobile screen sizes — v1.1
- ✓ Log tab — read-only transaction table with date, category, income/expense, and description filters — v1.1
- ✓ Sync tuning — chokidar debounce optimized for fast pickup when OneDrive syncs file to disk — v1.1

### Active (v1.2)

(None defined — run `/gsd:new-milestone` to plan next version)

### Deferred

- [ ] Category drill-down view — spending over time for a single selected category
- [ ] Export report as PDF or image
- [ ] Credit card transaction filter (Credit column flag)
- [ ] Monthly budget targets that vary by month

### Out of Scope

- Sheet 2 (YTD sheet) — all data derived from Sheet 1 Logbook
- Write-back to Excel — app is read-only against the file
- OneDrive API / cloud backend — local network only (desktop must be on same Wi-Fi)
- Native iOS/Android app — PWA covers mobile use case
- Remote access away from home Wi-Fi — by design
- Multi-user / accounts — personal tool, single user

## Context

- **Shipped:** v1.1 Mobile + Log (2026-02-25) — PWA + Wi-Fi serving + Log tab with 4-filter pipeline
- **Previous:** v1.0 MVP (2026-02-22) — full dashboard from Excel input to interactive visual output
- **Codebase:** ~3,563 lines TypeScript/TSX/CSS (source files); 7 phases, 22 plans total
- **Tech stack:** Electron (electron-vite), React 18, TypeScript, Recharts, xlsx (SheetJS), chokidar, ws (WebSocket server)
- **Data source:** Budget.xlsx on user's local machine — Logbook columns: Date, Description, Category, Income, Debit, Balance, Credit, Notes
- **Persistence:** `userData/settings.json` via Electron's app.getPath — stores file path and budget amounts
- **Mobile access:** App serves at `http://[LAN-IP]:3737` — open on phone browser or install as PWA

## Constraints

- **Data**: Read-only access to Budget.xlsx via file system watch — no database
- **Platform**: Desktop Electron app + PWA on local network; no internet dependency at runtime
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
| ws over express for HTTP+WS server | Node built-in http is sufficient; avoids large express dep | ✓ Good — clean, minimal |
| Vanilla service worker (no Workbox) | App shell only; minimal complexity for the use case | ✓ Good — simple and works |
| overflow:visible override for sticky mobile | overflow:hidden on .log-tab-outer breaks position:sticky on mobile | ✓ Good — page body scrolls |
| LogFilterBar empty Set = ALL pass | Inverse of Dashboard FilterBar — empty means no filter, not no results | ✓ Good — correct semantics |

---
*Last updated: 2026-02-25 after v1.1 milestone*
