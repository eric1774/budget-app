---
phase: 09-assets-tab-ui
plan: redesign
subsystem: assets
tags: [assets, transactions, ledger, recharts, ipc]
dependency_graph:
  requires: [08-asset-data-layer]
  provides: [transaction-ledger-ui]
  affects: [AssetsTab, AccountDetailPanel, AccountModals, assets-store, index.ts, types.ts]
tech_stack:
  added: []
  patterns: [deposit/withdrawal ledger, running balance, discriminated union modal state]
key_files:
  created: []
  modified:
    - src/shared/types.ts
    - src/main/assets-store.ts
    - src/main/index.ts
    - src/renderer/src/components/AssetsTab.tsx
    - src/renderer/src/components/AccountDetailPanel.tsx
    - src/renderer/src/components/AccountModals.tsx
decisions:
  - Transaction ledger replaces snapshot model — deposits add to balance, withdrawals subtract
  - accountBalance() is a pure running-sum helper, not stored — computed on read
  - DeleteTransactionModal takes transactionId string only (not full Transaction object) — simpler and sufficient
  - onTransactionChange callback on AccountDetailPanel lets AssetsTab reload after any transaction mutation
  - AssetsTab removed inline snapshot list — AccountDetailPanel now owns full transaction log and charts
metrics:
  duration: 20 min
  completed_date: "2026-03-02"
  tasks: 3
  files_modified: 6
---

# Phase 09 Redesign: Assets Tab — Snapshot to Transaction Ledger Summary

Replaced the broken snapshot model with a deposit/withdrawal transaction ledger. Account balance is now a running sum of all transactions. Net assets total, charts, and transaction log all update correctly when transactions are added or removed.

## What Was Built

### Data Layer (Commit 1)
- `src/shared/types.ts`: Replaced `BalanceSnapshot` with `Transaction` (`id`, `type: 'deposit'|'withdrawal'`, `amount`, `date`, `note?`). Updated `AssetAccount.snapshots` to `AssetAccount.transactions`. Removed `updatedAt` fields.
- `src/main/assets-store.ts`: Rewrote store. Removed `addSnapshot`, `updateSnapshot`, `deleteSnapshot`. Added `addTransaction`, `updateTransaction`, `deleteTransaction`. Added `accountBalance(account)` helper (running sum).

### IPC (Commit 2)
- `src/main/index.ts`: Replaced `assets:add-snapshot`, `assets:update-snapshot`, `assets:delete-snapshot` with `assets:add-transaction`, `assets:update-transaction`, `assets:delete-transaction`. Updated imports.

### UI (Commit 3)
- `AssetsTab.tsx`: Balance computed via `accountBalance()` running sum. Net assets total sums all accounts. Account card shows current balance and last transaction date. Removed inline snapshot list — detail panel handles transactions.
- `AccountDetailPanel.tsx`: Full transaction log (descending by date) with type badges (green deposit / red withdrawal), amounts, notes. Running balance line chart (ascending). Per-transaction bar chart (deposits positive/green, withdrawals negative/red). "+ Add Transaction" button. Per-row edit/delete buttons. Empty state when 0 transactions. Accepts `onTransactionChange` callback.
- `AccountModals.tsx`: Replaced 3 snapshot modals with `AddTransactionModal`, `EditTransactionModal`, `DeleteTransactionModal`. Type radio (deposit/withdrawal). Kept `AddAccountModal`, `EditAccountModal`, `DeleteAccountModal` unchanged (except `account.transactions.length` in delete confirmation).

## Commits

| Hash | Message |
|------|---------|
| 2c21023 | feat(assets-redesign): replace BalanceSnapshot with Transaction in types.ts and assets-store.ts |
| 5d58438 | feat(assets-redesign): update IPC channels for transaction-based store |
| adba816 | feat(assets-redesign): update Assets UI for deposit/withdrawal ledger |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/shared/types.ts` — Transaction type present, BalanceSnapshot removed
- [x] `src/main/assets-store.ts` — transaction CRUD functions exported
- [x] `src/main/index.ts` — IPC channels updated
- [x] `src/renderer/src/components/AssetsTab.tsx` — uses accountBalance(), transaction-based
- [x] `src/renderer/src/components/AccountDetailPanel.tsx` — transaction log + charts
- [x] `src/renderer/src/components/AccountModals.tsx` — Add/Edit/Delete Transaction modals
- [x] TypeScript: zero errors (`npx tsc --noEmit` clean)
- [x] 3 atomic commits created

## Self-Check: PASSED
