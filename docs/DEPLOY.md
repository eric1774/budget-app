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
