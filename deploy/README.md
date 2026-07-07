# Deploying MemAide to the Ubuntu droplet

The bridge server (`scripts/run_bridge_server.py`) is a single Python process that runs
**both** the glasses/phone media WebSocket (port **8765**) and the vision live preview
(port **8000**). One droplet, one `systemd` service — you do **not** need a separate server
for the WebSocket.

Target host in this project: `root@67.205.153.42`.

---

## 1. First login — lock down SSH

```bash
# From your own machine (Windows: use your terminal, or PowerShell's ssh):
ssh-copy-id root@67.205.153.42        # add your key so you stop using the password
ssh root@67.205.153.42
```

Once key login works, disable password auth on the server:

```bash
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

> The root password was shared over chat — treat it as burned. Rotate or disable it.

## 2. Install system packages

```bash
apt update && apt install -y python3-venv python3-pip git nginx ufw
```

## 3. Create an unprivileged service user + app dir

```bash
adduser --system --group memaide
mkdir -p /opt/memaide
chown memaide:memaide /opt/memaide
```

## 4. Get the code + build the venv

Requires **Python 3.11+** (`pyproject.toml`). Ubuntu 24.04 ships 3.12 (fine); on 22.04
(`python3 --version` shows 3.10) add the deadsnakes PPA and use `python3.11 -m venv` below.

```bash
git clone <your-repo-url> /opt/memaide
cd /opt/memaide
git checkout anthony/student3-work
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -e .          # add extras as needed: -e ".[judge]" (Anthropic)
.venv/bin/pip install -e ".[service]"   # /infer service needs fastapi+uvicorn
chown -R memaide:memaide /opt/memaide
```

## 5. Configuration (env vars — kept OUT of git)

Create `/etc/memaide/memaide.env` on the server (root-owned, `chmod 600`). The bridge
server reads these:

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | **yes** | Vision describer + STT/TTS |
| `ANTHROPIC_API_KEY` | optional | Judge model (`claude-opus-4-8`) if used |
| `WHATSAPP_TOKEN` | optional | Caregiver escalation alerts |
| `WHATSAPP_PHONE_NUMBER_ID` | optional | Sending number ID |
| `WHATSAPP_TO` | optional | Verified test recipient |
| `WHATSAPP_TEMPLATE` | optional | Defaults to `hello_world`; set `fall_alert` once approved |
| `WHATSAPP_LANG` | optional | Defaults to `en_US` |
| `AI_AGENT_API_KEY` | **yes (prod)** | Shared secret koko sends as `X-Api-Key`; unset = auth disabled (dev only) |

Ports (`WS_PORT=8765`, `PREVIEW_PORT=8000`) live in `src/memaide/config.py`; override via
env only if you change them.

```bash
mkdir -p /etc/memaide
cat > /etc/memaide/memaide.env <<'EOF'
OPENAI_API_KEY=sk-...
# WHATSAPP_TOKEN=...
# WHATSAPP_PHONE_NUMBER_ID=...
# WHATSAPP_TO=...
EOF
chmod 600 /etc/memaide/memaide.env
```

> `config.py` calls `load_dotenv()`, but under systemd the `EnvironmentFile` is the source
> of truth — no `.env` file needed on the server.

## 6. Install the systemd service

```bash
cp /opt/memaide/deploy/memaide-bridge.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now memaide-bridge
systemctl status memaide-bridge          # should be active (running)
journalctl -u memaide-bridge -f          # live logs
```

### /infer service (Slice 1)

The koko backend bridge runs as a second service on port **8080**:

```bash
# venv must have the service extra: pip install -e ".[service]"
cp /opt/memaide/deploy/memaide-infer.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now memaide-infer
curl -s http://127.0.0.1:8080/health      # -> {"status":"ok"}
```

koko sets `AI_AGENT_URL=http://<droplet-ip>:8080` and `AI_AGENT_API_KEY` to the same
secret you put in `/etc/memaide/memaide.env`. Since koko is co-located on the same droplet,
`/infer` can stay bound to the private interface / firewalled to localhost rather than
exposed publicly.

## 7. Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'                   # 80 + 443, once you use Nginx/TLS
# Testing WITHOUT a domain/TLS? open the raw WS port instead:
# ufw allow 8765
ufw enable
```

## 8. TLS + `wss://` (production) — needs a domain

Browsers and the mobile app require **`wss://`** (secure) outside of localhost, and Let's
Encrypt won't issue a cert for a bare IP. So:

1. Point a DNS A record (e.g. `memaide.example.com`) at `67.205.153.42`.
2. Install the proxy config:
   ```bash
   cp /opt/memaide/deploy/nginx-memaide.conf /etc/nginx/sites-available/memaide
   ln -s /etc/nginx/sites-available/memaide /etc/nginx/sites-enabled/memaide
   # edit the file: replace YOUR_DOMAIN
   nginx -t && systemctl reload nginx
   ```
3. Get the cert:
   ```bash
   apt install -y certbot python3-certbot-nginx
   certbot --nginx -d memaide.example.com
   ```

The glasses/phone app then connects to `wss://memaide.example.com/`; preview is at
`https://memaide.example.com/preview/`.

**No domain yet?** For a quick internal test, skip Nginx and point the app at
`ws://67.205.153.42:8765` (with `ufw allow 8765`). Move to `wss://` before any real use.

---

## Updating a deployment

```bash
cd /opt/memaide
git pull
.venv/bin/pip install -e .        # only if deps changed
systemctl restart memaide-bridge
```
