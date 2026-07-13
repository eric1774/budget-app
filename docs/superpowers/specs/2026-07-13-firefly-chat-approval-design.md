# Firefly Chat with Admin-Approved Writes — Design

**Date:** 2026-07-13
**Status:** Approved (design review with Eric, 2026-07-13)

## Goal

Evolve the Budget Dashboard (currently an Electron desktop app) into a containerized web app on the homelab server that adds a natural-language chat interface over Firefly III. All users can read anything via chat; no write ever reaches Firefly without explicit review and approval by an admin. Full IAM: authentication via Pocket ID (OIDC + passkeys), role-based authorization enforced server-side, and an append-only audit trail.

## Decisions (from design review)

| Decision | Choice |
|---|---|
| Host | Docker Compose stack on the homelab server (same box as Firefly III) |
| Users | Family members on the LAN; Eric is admin |
| AI backend | Claude API — Haiku 4.5 default, Sonnet as config toggle |
| Firefly MCP layer | `daften/fireflyiii-mcp`, stdio child process, `MCP_READ_ONLY=true`, preset `insights` (57 read tools) |
| Approval notification | In-app approvals queue + ntfy push to admin's phone |
| Firefly target | Build and validate against TEST (192.168.1.113), then flip config to PROD (192.168.1.199) |
| Proposable writes | Transactions only (create). Accounts/budgets/categories/rules stay admin-direct in Firefly |
| IAM | External IdP: Pocket ID (passkeys). Roles via Pocket ID groups (`budget-admin` group → admin role) |
| Excel access | abraunegg `onedrive` client sidecar, `--monitor --download-only`, `sync_list` scoped to `Desktop/BUDGET/2026`, mirrored to a shared volume |
| TLS | Caddy reverse proxy with internal CA (passkeys/WebAuthn require HTTPS); root cert trusted once per family device |

## Architecture

Docker Compose stack:

| Container | Role |
|---|---|
| `budget-app` | Node/TypeScript backend + existing React UI served as a web app. Owns dashboard, chat, approvals queue, audit log. Spawns fireflyiii-mcp as a stdio child. SQLite on a volume. |
| `pocket-id` | OIDC provider, passkey login, user/group management, its own login event log |
| `caddy` | HTTPS entry point for all services, internal CA |
| `onedrive-sync` | abraunegg client, cloud → `/data/budget` mirror, download-only |
| `ntfy` | Self-hosted push notifications to admin devices |
| Firefly III + Data Importer | Existing containers, unchanged |

Volumes: `/data/budget` (Excel mirror, read-only for budget-app), `/data/app` (SQLite: proposals, chat history, audit log, sessions).

Migration notes: renderer (React) ports nearly as-is; `excel.ts`, stores, and `watcher.ts` become server modules; chokidar watches the mirror path unchanged (the sync client downloads to temp + renames, which chokidar handles). Electron shell retires; phones use the web app (PWA-friendly).

### Excel freshness chain

Excel save → OneDrive upload (secs–1 min) → sync client delta poll (`monitor_interval` ~60s) → file lands on volume → chokidar fires → re-parse. Expected end-to-end lag: 30s–2min. Edits from Excel mobile/web sync the same way. The server can never write back to OneDrive (`--download-only`); the never-touch-prod-xlsx rule is enforced at tool level.

## Authentication (AuthN)

- OIDC authorization code flow with PKCE against Pocket ID; the app is a confidential client.
- App never sees credentials — only the signed ID token. Role derived from the group claim (`budget-admin` → admin; otherwise member).
- Sessions: server-side store; HttpOnly + Secure + SameSite cookies; 12-hour expiry with silent re-auth (passkey tap).
- User management (create/disable users, passkeys, groups) happens in Pocket ID's admin UI.

## Authorization (AuthZ)

Authorization middleware checks role server-side on every API route (never UI-only).

| Capability | Member | Admin |
|---|---|---|
| Sign in (passkey) | ✓ | ✓ |
| Dashboard (Excel views) | ✓ | ✓ |
| Chat: read-only Firefly queries | ✓ | ✓ |
| Propose transactions | ✓ | ✓ (admin writes also go through the queue — one code path, no bypass) |
| See own proposals + status | ✓ | ✓ |
| Approve/reject any proposal | — | ✓ |
| View full audit log | — | ✓ |
| Manage users/groups/passkeys | — | ✓ (in Pocket ID) |
| Hold Firefly write credential | never | never (server env only) |
| Firefly III web UI | — | ✓ (unchanged) |

## Chat engine — read-only by construction

- Per-message flow: authenticated user → budget-app → Claude API with two toolsets:
  1. fireflyiii-mcp read tools (started with `MCP_READ_ONLY=true`; write tools do not exist in the model's toolbox — enforcement is structural, not prompt-based).
  2. One custom app-implemented tool: `propose_transaction` — its only capability is inserting a pending row in SQLite.
- Startup guard: app asserts the loaded tool list and refuses to boot if anything other than `get_*` / `search_*` / `propose_transaction` is present.
- Model: Haiku 4.5 default; Sonnet config toggle. Anthropic API key lives only in server env.
- Per-user chat history in SQLite; per-user daily token budget caps API spend.

## Write path: proposal → approval → execution

1. Model calls `propose_transaction` with the drafted Firefly payload.
2. Server-side validation before queuing: transactions only; configurable amount cap (default: reject > $10,000); source/destination accounts, budget, and category must exist in Firefly (verified via read call).
3. Proposal row: requester identity (from session, never from the model), timestamp, natural-language request, exact payload (type, date, amount, description, source/destination, budget, category), status `pending`.
4. ntfy push to admin, deep-linking to the approvals page (works from phone; same web app).
5. Admin reviews human-readable preview (raw JSON behind an expander) → approve or reject-with-reason.
6. Approve: server executes `POST /api/v1/transactions` with a write-capable Firefly PAT that exists only in the server environment. Firefly transaction ID stored back on the proposal.
7. Requester sees the outcome in their chat thread.
8. Statuses: `pending` / `approved` / `rejected` / `failed` / `expired`. Pending proposals expire after 7 days.

## Accounting (audit)

Append-only `audit_log` table: chat messages, every MCP tool call (name + arguments), proposal lifecycle events, execution results — tagged with user, timestamp, IP. Logins are covered by Pocket ID's event log. Admin UI: filterable audit view (user / date / event type). Backups ride the Docker volume backup.

## Error handling

- Firefly unreachable → chat degrades gracefully; Excel dashboard unaffected.
- Stale mirror → last-synced timestamp shown; warning banner if mirror > 30 min old.
- Claude API failure → visible chat error, retry with backoff; proposals never silently dropped.
- Execution failure → status `failed` with Firefly's error attached, admin notified, no auto-retry.
- Pocket ID down → new logins fail with a clear message; existing sessions run to expiry.

## Testing & rollout phases

1. Containerize app + OneDrive mirror — dashboard served from the server; Electron retired.
2. Caddy + Pocket ID login; roles enforced.
3. Read-only chat against TEST Firefly.
4. Approval queue + ntfy; writes to TEST.
5. Red-team pass (attempt prompt-injection writes — must be structurally impossible; verify startup tool assertion) → flip config to PROD.

Tests: unit — proposal validator, authz middleware, executor; integration — full propose → approve → verify-in-Firefly loop against TEST.

## Out of scope (this cycle)

- Write operations beyond transaction creation (including transaction edits/updates — revisit once the create flow is proven).
- Exposing the app off-LAN (no WAN access, no Graph webhooks).
- Exposing parsed Excel data as chat tools (candidate for a later phase).
- Range-based CSV export feature (separate roadmap item).
