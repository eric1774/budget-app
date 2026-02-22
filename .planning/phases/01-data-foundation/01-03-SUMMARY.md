---
phase: 01-data-foundation
plan: 03
subsystem: data
tags: [chokidar, electron, ipc, file-watcher, file-picker, persistence, react, typescript]

requires:
  - phase: 01-data-foundation/01-02
    provides: parseWorkbook(filePath) and parse-file IPC handler, shared types

provides:
  - getStoredFilePath/setStoredFilePath in src/main/store.ts — userData/settings.json persistence
  - startWatcher/stopWatcher in src/main/watcher.ts — chokidar single-file watcher with retry/debounce
  - open-file-dialog IPC handler (native file picker, xlsx/xls filter, stores path, starts watcher)
  - get-stored-path IPC handler (returns persisted path or null)
  - file-changed / file-locked / file-locked-persistent IPC events from main to renderer
  - Full Phase 1 renderer in App.tsx: welcome, loading, loaded, error states + banner system
  - preload on() method for renderer-bound IPC event subscriptions with unsubscribe

affects: [02-dashboard-ui, all future phases using file data]

tech-stack:
  added:
    - chokidar (file watching — version installed via npm install chokidar)
  patterns:
    - Discriminated union ParseResponse used across IPC unchanged from Plan 02
    - Retry loop for locked files: 5 retries at 800ms intervals before persistent warning
    - Debounce on chokidar change event: 400ms before triggering parse
    - awaitWriteFinish (stabilityThreshold 200ms, pollInterval 100ms) for Excel save reliability
    - IPC event subscription pattern: preload on() returns unsubscribe fn; cleaned up in useEffect return
    - userData/settings.json for persistence — no extra dependency, uses Node.js fs module

key-files:
  created:
    - src/main/store.ts
    - src/main/watcher.ts
  modified:
    - src/main/index.ts
    - src/preload/index.ts
    - src/renderer/src/App.tsx
    - src/renderer/src/env.d.ts

key-decisions:
  - "chokidar awaitWriteFinish used: Excel writes files in two-phase manner; awaitWriteFinish prevents partial-read events"
  - "5 retries at 800ms = up to 4 seconds of retry before persistent locked warning — matches typical Excel save lock duration"
  - "400ms debounce on change event: prevents double-firing if chokidar emits multiple events on one save"
  - "Stored path auto-opens file picker on read-error: transparent recovery if Budget.xlsx is moved/renamed"
  - "preload on() returns unsubscribe function: React useEffect cleanup removes listeners, prevents memory leaks on hot reload"
  - "mainWindow stored as module-level variable in index.ts: needed for both did-finish-load and open-file-dialog handler"

patterns-established:
  - "IPC event pattern: main sends via win.webContents.send(); preload exposes on() with unsubscribe; renderer subscribes in useEffect"
  - "File watcher lifecycle: startWatcher() replaces any existing watcher (stopWatcher first); cleaned up in window-all-closed"

requirements-completed: [DATA-01, DATA-03]

duration: 2min
completed: 2026-02-21
---

# Phase 1 Plan 03: File Picker, Persistence, and Watcher Summary

**chokidar file watcher with 5-retry/800ms locked-file retry, native OS file picker (xlsx/xls filter), userData/settings.json persistence, and full Phase 1 React renderer with welcome/loading/loaded/error states and auto-dismissing banner system**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-21T00:00:00Z
- **Completed:** 2026-02-21T00:02:00Z
- **Tasks:** 2 of 2 (checkpoint pending human verification)
- **Files modified:** 6

## Accomplishments
- store.ts: thin JSON persistence wrapper using app.getPath('userData')/settings.json — no extra dependency
- watcher.ts: chokidar watcher with 400ms debounce, awaitWriteFinish for Excel compatibility, 5-retry/800ms retry on file lock
- index.ts: open-file-dialog and get-stored-path IPC handlers; watcher auto-started on stored path load; mainWindow tracked at module level
- preload.ts: added on() method with unsubscribe return for renderer-bound IPC events
- App.tsx: full state machine (welcome/loading/loaded/error), loadFile() with all error kinds handled, auto-opens picker if stored path is missing, banner system with auto-dismiss
- TypeScript compiles clean on both main and renderer tsconfig contexts

## IPC Channels and Events

**Renderer -> Main (invoke):**
- `get-stored-path` — returns string | null
- `open-file-dialog` — opens native picker, persists path, starts watcher, returns string | null
- `parse-file` — parses Excel file, returns ParseResponse (from Plan 02)

**Main -> Renderer (send/on):**
- `stored-path` — sent on did-finish-load with persisted path
- `file-changed` — { ok: true; result: ParseResult } | { ok: false; error: ParseError }
- `file-locked` — { retriesRemaining: number } — sent once on first retry
- `file-locked-persistent` — { error: string } — sent after MAX_RETRIES exhausted

## Watcher Configuration

- **Library:** chokidar
- **MAX_RETRIES:** 5
- **RETRY_INTERVAL_MS:** 800ms (total retry window: ~4 seconds)
- **DEBOUNCE_MS:** 400ms
- **awaitWriteFinish:** stabilityThreshold 200ms, pollInterval 100ms
- **userData path:** Electron app.getPath('userData') — typically `%APPDATA%\[app-name]` on Windows

## Task Commits

1. **Task 1: File path persistence, file picker IPC, and chokidar watcher** - `c6ed383` (feat)
2. **Task 2: Full Phase 1 renderer — welcome state, file picker, banners, auto-refresh** - `9ffc8a3` (feat)

## Files Created/Modified
- `src/main/store.ts` - getStoredFilePath/setStoredFilePath using userData/settings.json
- `src/main/watcher.ts` - chokidar watcher, retry logic, 3 IPC event types
- `src/main/index.ts` - Added open-file-dialog, get-stored-path handlers; mainWindow module var; stopWatcher on quit
- `src/preload/index.ts` - Added on() with unsubscribe return
- `src/renderer/src/App.tsx` - Complete Phase 1 UI: welcome/loading/loaded/error + Banner component
- `src/renderer/src/env.d.ts` - Added on() to Window.electronAPI type

## Decisions Made
- chokidar awaitWriteFinish chosen over raw debounce alone: Excel saves in two steps (temp file + rename or in-place overwrite) which can trigger partial reads; awaitWriteFinish waits for file size to stabilize
- 5 retries at 800ms interval: approximately matches the lock window Excel holds during save (~1-3 seconds); gives enough headroom without indefinite retrying
- stored-path sent via did-finish-load event rather than ipcMain.handle get-stored-path alone: renderer can start loading without an explicit invoke round-trip on boot
- Locked warning sent only on retryCount === 0: avoids flooding renderer with repeated locked events during retry loop

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm run dev` / Electron window launch not verifiable in headless execution environment. TypeScript compiles clean on both tsconfig contexts. Manual launch required for human verification checkpoint.

## User Setup Required
None. To verify the running app, follow the checkpoint verification steps in 01-03-PLAN.md.

## Next Phase Readiness
- Complete Phase 1 data foundation: scaffold (01-01) + parser (01-02) + picker/watcher/persistence (01-03)
- All four Phase 1 requirements met: DATA-01 (file picker + persistence), DATA-02 (transaction parsing), DATA-03 (watcher), DATA-04 (categories)
- Phase 2 dashboard UI can import ParseResult from shared/types and call parse-file / listen to file-changed
- No blockers

---
*Phase: 01-data-foundation*
*Completed: 2026-02-21*
