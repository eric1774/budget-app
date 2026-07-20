# SimpleFIN Live Balances — Design (agreed 2026-07-20)

Outcome of a grilling session with Eric. Goal: Navy Federal and Fidelity account
balances appear live and accurate on the Asset Page.

## Decisions

### 1. Provider: SimpleFIN Bridge (not Plaid)
- $15/year flat, no approval process, single authenticated GET API.
- Both institutions confirmed in SimpleFIN's directory (Navy Federal Credit
  Union + brokerage variants; Fidelity Investments).
- Plaid rejected: no hobbyist tier, production approval questionnaire,
  pay-per-call pricing. Webhooks are moot anyway — the deployment is LAN-only,
  so anything push-based can never reach the server. Polling is the design.

### 2. Scope: balances only (Option A)
- Linked accounts get a live balance snapshot + last-synced timestamp.
- Transaction feeds are NOT ingested into the app's transaction model.
- Raw SimpleFIN sync responses are stored on disk so a future
  "real transactions" feature can backfill from history.

### 3. Sync cadence: scheduled + manual (Option C)
- Server-side scheduled sync twice daily (~6am and ~6pm America/Chicago).
- Manual "Sync now" button; refused if last sync < ~15 minutes ago (cooldown
  protects the bridge from button-mashing).
- Every sync updates a per-account visible "Last synced" timestamp.
- Polling more often is pointless: SimpleFIN's upstream (MX) refreshes bank
  data only a few times per day.

### 4. Account onboarding: explicit mapping (Option B)
- After connect, discovered remote accounts are listed; for each the admin
  chooses: attach to existing account / create new / ignore.
- Attach preserves the local account's name, type, and history; its balance
  source switches to sync. Follows the existing `syncedWithDashboard`
  precedent (external balance source flag).
- Unmapped remote accounts never appear on the Asset Page.

### 5. Credential + authorization
- SimpleFIN flow: admin pastes one-time setup token → server claims it →
  receives permanent access URL (credential-bearing URL). That URL is THE
  secret.
- Stored server-side in `simplefin.json` under `APP_DATA_DIR` (survives
  container rebuilds via `app_data` volume). Never sent to the browser.
  No .env storage (would put a live credential in compose files).
- Admin-only: connect/disconnect, mapping. Any signed-in user: view balances,
  trigger "Sync now".

### 6. Existing manual transactions on attach: keep, frozen (Option B)
- Manual transactions stay stored and viewable as history but stop driving
  balance; `accountBalance()` short-circuits to the synced balance for linked
  accounts.
- Adding new manual transactions to a linked account is disabled.
- Unlink reverts the account to transaction-derived balance. Nothing is ever
  deleted by linking.

### 7. Balance history: snapshot on sync (Option B)
- Each successful sync writes a dated balance snapshot per linked account,
  one per day (later syncs overwrite that day's entry). ~365 entries/acct/yr.
- History accrues from link date forward; no fake backfill.

### 8. Failure UX: "never lie, never zero"
- Failed syncs never wipe or zero balances; last-known value + timestamp stay.
- Staleness: timestamp tints to warning after ~36h (multiple missed syncs).
- Broken institution connection (MX rot): "needs attention" badge on affected
  accounts; admins get a link out to SimpleFIN Bridge to repair (the only
  place it can be fixed).
- Revoked credential: settings panel shows integration disconnected.
- No modals, no toast spam — quiet, visible truth on the page.

### 9. UI surfaces (execute under gpt-taste)
- Assets section header: "Sync now" button + compact last-synced readout
  (everyone); "Linked accounts" button (admin-only) opening management modal.
- Management modal (existing AccountModals pattern): setup-token connect flow,
  connection status, discovered-accounts mapping list (attach/create/ignore),
  needs-attention states + repair link.
- Account cards: linked accounts get a small live indicator (institution +
  "synced 3h ago"), warning tint when stale, needs-attention badge on broken
  connections. Manual accounts unchanged.
- AccountDetailPanel (linked): balance-snapshot history chart replaces the
  transaction-entry ledger; frozen manual entries preserved in a collapsed
  "historical entries" section; manual entry disabled with a one-line
  explanation.

### 10. Net worth integration (first-class requirement)
- Net Worth History: seeded from sync snapshots for linked accounts
  (last-known-snapshot-per-month, carry-forward — same idea the chart already
  uses for transaction-derived balances) so growth/loss over time is real.
- Net Worth by Type: each linked account contributes its live synced balance
  under its AccountType (inherited via attach, or chosen at create-new).

## Non-goals (this feature)
- Ingesting/displaying real bank transaction feeds (raw responses are kept for
  a future feature).
- Plaid or any multi-provider abstraction.
- Webhooks/push (impossible on LAN-only deployment).
- Encryption-at-rest for the access URL (LAN-only LXC; file permissions and
  the OS boundary are the honest layer).

## Branch
`feature/plaid-assets` off master (ac25db2). Name predates the provider
decision; the feature is SimpleFIN.
