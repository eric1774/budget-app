# Deploying budget-app (Phase 1)

Target: a dedicated LXC on the Proxmox node (alongside the Firefly III TEST
and PROD LXCs). The stack runs Docker inside the LXC.

## 1. Create the LXC

In the Proxmox UI: Debian 12 template, 2 vCPU, 2 GB RAM, 16 GB disk,
static LAN IP. In the container's **Options → Features**, enable
`nesting=1` and `keyctl=1` (required for Docker inside LXC). Unprivileged
container is fine.

On the Proxmox **host**, make sure `lxc-pve` is >= 6.0.5-2 (`apt update &&
apt install lxc-pve`, then stop/start the LXC). Older versions ship an
AppArmor profile that breaks current runc inside unprivileged LXCs — every
`docker run` fails with `open sysctl net.ipv4.ip_unprivileged_port_start
... permission denied` (CVE-2025-52881 fallout).

## 2. Install Docker

```bash
apt update && apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
```

## 3. Get the code

```bash
git clone <repo-remote-or-bundle> /opt/budget-app
cd /opt/budget-app
git checkout feature/phase1-containerize
```

(If the repo has no remote: on the Windows PC run
`git bundle create budget.bundle feature/phase1-containerize` in the
worktree, copy it over with scp, then `git clone budget.bundle /opt/budget-app`.)

## 4. Authorize OneDrive (one-time, interactive)

```bash
cd /opt/budget-app
docker compose run --rm -it onedrive
```

Follow the printed URL, sign in with the Microsoft account, paste the
response URL back. Verify config, then dry-run:

```bash
docker compose run --rm -it onedrive onedrive --confdir /onedrive/conf --display-config
docker compose run --rm -it onedrive onedrive --confdir /onedrive/conf --sync --dry-run
```

Confirm the dry-run lists only files under `BUDGET/2026/`. If the path
prefix differs (Desktop backup naming), fix `onedrive-conf/sync_list`
accordingly and check `BUDGET_XLSX_PATH` in `docker-compose.yml` matches.

If the onedrive sidecar ever ran as root before `ONEDRIVE_UID/GID` was in
place (e.g. during the interactive authorisation above), fix ownership once
— the entrypoint does not reliably chown pre-existing conf files, and the
client will otherwise crash-loop asking for re-authorisation:

```bash
chown -R 1000:1000 /opt/budget-app/onedrive-conf
docker run --rm -v budget-app_budget_mirror:/mnt alpine chown -R 1000:1000 /mnt
```

## 5. Start the stack

```bash
DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose up -d --build
docker compose logs -f onedrive     # watch first sync complete
docker compose logs -f budget-app   # expect: Parsed N transactions ... listening
```

(The classic builder is forced because BuildKit's `RUN npm ci` reliably
dies with `npm error Exit handler never called!` inside this LXC; the same
install succeeds in seconds under `docker run` or the classic builder.)

## 6. Verify

- `curl http://localhost:3737/api/health` → `{"ok":true,"hasSnapshot":true}`
- From a phone/PC on the LAN: `http://<lxc-ip>:3737` renders the dashboard.
- Edit + save the TEST workbook copy on the Windows PC; the dashboard
  updates within ~6 minutes (OneDrive upload + mirror poll — the onedrive
  client enforces a 300 s minimum on `monitor_interval`, so the spec's
  30 s poll is not achievable).

## Rollback

`docker compose down` — nothing outside this LXC changes. The original
Electron app on the Windows PC is untouched and keeps working.

## Prod flip (NOT in this phase)

Changing `BUDGET_XLSX_PATH` to `2026 Budget.xlsx` requires Eric's explicit
approval. The mirror is download-only either way — the server can never
modify the spreadsheet.

## Phase 2: HTTPS + passkey login (Caddy + Pocket ID)

Everything below happens once, on the LXC (`/opt/budget-app`), after `git pull`.
Reminder: builds on this LXC MUST use the classic builder — `DOCKER_BUILDKIT=0`.

### 1. LAN DNS

Point both hostnames at this LXC's IP (192.168.1.x) in your LAN DNS — router DNS
entries or Pi-hole "Local DNS records". Per-device hosts files work as a fallback.

- `budget.home.arpa` → LXC IP
- `id.home.arpa` → LXC IP

Verify from a family device: `nslookup budget.home.arpa` returns the LXC IP.

### 2. Environment file

    cp .env.example .env
    openssl rand -base64 32   # → paste as POCKET_ID_ENCRYPTION_KEY

Leave OIDC_CLIENT_ID / OIDC_CLIENT_SECRET empty for now (step 4 fills them).

### 3. First start — Pocket ID setup

    DOCKER_BUILDKIT=0 docker compose up -d --build caddy pocket-id

budget-app will not start yet (missing OIDC vars) — expected.

1. Open `https://id.home.arpa/setup` on Eric's machine (accept the TLS warning
   this once, or do step 5 first).
2. Create the admin account (Eric) and register a passkey.
3. Admin UI → **User Groups** → create group `budget-admin` → add Eric.
4. Create accounts for each family member (no group needed — they become members).

### 4. Register the OIDC client

Pocket ID admin UI → **OIDC Clients** → Add:

- Name: `Budget Dashboard`
- Callback URL: `https://budget.home.arpa/auth/callback`
- PKCE: enabled
- Leave it a confidential client; copy the **Client ID** and the **Client Secret**
  (shown once) into `.env`.

Then:

    DOCKER_BUILDKIT=0 docker compose up -d --build

`docker logs budget-app` should show
`Auth enabled — OIDC issuer https://id.home.arpa, admin group "budget-admin", sessions 12h`.

### 5. Trust the internal CA on family devices

Export the root cert:

    docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./budget-ca.crt

- **Windows:** double-click → Install Certificate → Local Machine →
  "Trusted Root Certification Authorities".
- **iPhone/iPad:** AirDrop or email `budget-ca.crt` → install profile →
  Settings → General → About → Certificate Trust Settings → enable full trust.
- **Android:** Settings → Security → Encryption & credentials → Install a certificate → CA.

### 6. Verify

1. `https://budget.home.arpa` from a family device → redirected to Pocket ID →
   passkey tap → dashboard loads with your name in the header.
2. Eric's header badge shows `admin`; a member account shows no badge role.
3. `https://budget.home.arpa/api/snapshot` in a private/incognito window → 401
   (JSON error, not data) — the API is closed to the unauthenticated LAN.
4. Sign out → "Signed out" page → Sign in again works with one passkey tap.

### Ops notes

- Sessions last 12h (`SESSION_TTL_HOURS`); expired sessions are swept hourly.
- `AUTH_DISABLED=1` exists for local development ONLY. The server refuses to
  boot without OIDC config unless it is set, so auth cannot fall off silently.
- Pocket ID data (users, passkeys, its own login audit log) lives in the
  `pocket_id_data` volume — include it in volume backups.
- If Pocket ID is down, existing sessions keep working until expiry; only new
  logins fail (with a clear 502 from `/auth/login`).
- Rollback: `git checkout master && DOCKER_BUILDKIT=0 docker compose up -d --build`
  (the Phase 1 compose file has no caddy/pocket-id services; stray containers:
  `docker compose down` first).
- Role changes in Pocket ID (adding/removing someone from budget-admin) take effect at next login — an existing session keeps its role until it expires (≤12h).
- The group's **Name** (slug) in Pocket ID must be exactly `budget-admin` — the
  friendly name doesn't matter, the slug is what goes in the groups claim
  (UAT caught `budget_admin` with an underscore silently mapping to member).
- The `ca-perms` one-shot service makes Caddy's internal CA root readable by
  budget-app (Caddy creates its PKI tree `0700 root:root`). If budget-app ever
  logs `Ignoring extra certs … Permission denied` or logins fail with
  `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, re-run `docker compose up ca-perms`,
  then `docker restart budget-app` (the CA bundle is only read at boot).
- A dashboard stuck on the loading skeleton means the page outlived its session
  (12h expiry, or cookies cleared mid-session) — since the UAT fixes it
  redirects to sign-in by itself; on an older build, F5 does it.
