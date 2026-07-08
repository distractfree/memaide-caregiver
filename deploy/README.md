# Deploying MemAide to the Ubuntu droplet

The bridge server (`scripts/run_bridge_server.py`) is a single Python process that runs
**both** the glasses/phone media WebSocket (port **8765**) and the vision live preview
(port **8000**). One droplet, one `systemd` service — you do **not** need a separate server
for the WebSocket.

Target host in this project: `root@67.205.153.42`.

> **Topology (confirmed 2026-07-07): two separate droplets, NOT co-located.**
> - **My AI service** (this repo): `67.205.153.42`
> - **koko's backend** (Node/Prisma): `134.122.115.15:4000`
>
> Because we are on different machines, all cross-service calls use **public IPs, not
> `127.0.0.1`**, port 8080/8765 must be **opened to koko/devices in the firewall** (§7), and
> `AI_AGENT_API_KEY` / `KOKO_API_KEY` are **mandatory** (the traffic crosses the public
> internet). Anything below that says "co-located / localhost" is the old assumption —
> follow the cross-host instructions.

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
| `WHATSAPP_TEMPLATE` | optional | Defaults to `hello_world`; set `caregiver_alert` for live-session alerts |
| `WHATSAPP_LANG` | optional | Defaults to `en_US`; the `caregiver_alert` template is `en`, so set `WHATSAPP_LANG=en` |
| `CAREGIVER_PORTAL_BASE_URL` | for caregiver alerts | Base URL of koko's caregiver portal (e.g. `https://caregiver.guardianova.com`) — used for the `{{4}}` live-session link |
| `CAREGIVER_SESSION_PATH` | optional | Path template to one session; defaults to `/session/{id}` |
| `AI_AGENT_API_KEY` | **yes (cross-host)** | Shared secret koko sends as `X-Api-Key` on `/infer` + `/session/start`. Since koko is on a different droplet, this is **mandatory**, not optional — it's the only thing gating your public endpoints. Must match koko's `AI_AGENT_API_KEY`. |
| `KOKO_BASE_URL` | **yes for live sessions** | koko's backend base URL — my server POSTs escalation + transcript callbacks here. Cross-host value: `http://134.122.115.15:4000`. Unset = callbacks are logged no-ops (standalone dev). |
| `KOKO_API_KEY` | if koko requires it | Secret my server sends as `X-Api-Key` on the escalation/conclude callbacks. Set to whatever koko expects; unset = callbacks sent with no auth header. |

`KOKO_BASE_URL` / `KOKO_API_KEY` are only used by the **session server** (§6a). The
older `/infer`-only and bridge services ignore them.

**Caregiver-alert WhatsApp (live-session escalation).** On escalation the session server
sends the caregiver the approved `caregiver_alert` template with 4 variables: `{{1}}`
caregiver name, `{{2}}` patient name, `{{3}}` situation phrase (derived from the
escalation), `{{4}}` a link to the live session in koko's caregiver portal. To enable it:
set `WHATSAPP_TEMPLATE=caregiver_alert` **and `WHATSAPP_LANG=en`** (the template's language
is `en`, not `en_US`; `hello_world` takes no variables and is rejected), `WHATSAPP_TOKEN` /
`WHATSAPP_PHONE_NUMBER_ID`, and `CAREGIVER_PORTAL_BASE_URL`. Set `CAREGIVER_SESSION_PATH` if
koko's route differs from the default `/session/{id}` — **confirm this route with koko**, a
wrong path 404s the link in the caregiver's message. The recipient is the caregiver's phone
from koko's `/session/start` payload, falling back to `WHATSAPP_TO`. Without `WHATSAPP_TOKEN`
the notifier isn't built and the session runs normally.

Ports (`WS_PORT=8765`, `PREVIEW_PORT=8000`) live in `src/memaide/config.py`; override via
env only if you change them.

```bash
mkdir -p /etc/memaide
cat > /etc/memaide/memaide.env <<'EOF'
OPENAI_API_KEY=sk-...
# Cross-host integration with koko (134.122.115.15:4000):
AI_AGENT_API_KEY=<shared secret, must match koko's AI_AGENT_API_KEY>
KOKO_BASE_URL=http://134.122.115.15:4000
# KOKO_API_KEY=<secret koko expects on my callbacks, if any>
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

koko sets `AI_AGENT_URL=http://67.205.153.42:8080` (your public IP) and `AI_AGENT_API_KEY`
to the same secret you put in `/etc/memaide/memaide.env`. **koko is on a separate droplet
(`134.122.115.15`), so `/infer` must be reachable at your public IP — not localhost.** Open
port 8080 to koko's IP only (§7), and keep `AI_AGENT_API_KEY` set so the exposed endpoint is
authenticated.

### 6a. Session server (Slice 2) — SUPERSEDES the infer + bridge services

`scripts/run_session_server.py` runs **one** process that hosts `/session/start` **and**
`/infer` on port **8080** *and* the glasses/phone media WebSocket on port **8765**, all
sharing one `SessionRegistry`. This is the live voice/vision path: koko POSTs
`/session/start` with patient context, the device opens the WS with `hello {session_id}`,
my server correlates the two and POSTs escalation (real-time) + the transcript (on
conclude) back to koko.

Because it re-hosts `/infer` (8080) and owns the media WS (8765), it **collides with both
older services** — you cannot run all three. The session server *replaces* them:

```bash
# Stop + disable the two it supersedes (both ports are now owned by the session server):
systemctl disable --now memaide-infer memaide-bridge

# Install the session service (needs the service extra: pip install -e ".[service]"):
cp /opt/memaide/deploy/memaide-session.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now memaide-session
systemctl status memaide-session         # should be active (running)
curl -s http://127.0.0.1:8080/health     # -> {"status":"ok"}
journalctl -u memaide-session -f         # live logs
```

Requires `KOKO_BASE_URL=http://134.122.115.15:4000` (+ `KOKO_API_KEY` if koko checks it) in
`/etc/memaide/memaide.env` for the callbacks to koko; without them the server still runs but
logs the callbacks as no-ops. Because koko is a **separate droplet**, koko reaches
`/session/start` + `/infer` at your **public** `67.205.153.42:8080` (not localhost) — open
8080 to koko's IP in §7. nginx (§8) still fronts the media WS on `/`.

> Only migrate once koko's `/session/start` caller + inbound callback endpoints and the
> device client exist — until then the session server starts and idles with nothing to
> drive the live loop. Running the older `memaide-infer` service is fine in the meantime.

## 7. Firewall (cross-host: koko must reach you)

Because koko is on a **different droplet**, it calls your `/infer` + `/session/start` at
`67.205.153.42:8080`. That port must be open — but scope it to **koko's IP only**, not the
whole internet, since `AI_AGENT_API_KEY` is your only other gate.

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'                           # 80 + 443, once you use Nginx/TLS

# koko -> me: HTTP API (/infer, /session/start), restricted to koko's droplet:
ufw allow from 134.122.115.15 to any port 8080

# devices -> me: media WebSocket. Behind nginx/TLS (§8) you don't open 8765 directly;
# for a quick no-TLS test, open it (ideally to the device's IP, or briefly to all):
# ufw allow 8765
ufw enable
ufw status                                        # confirm the rules are active
```

> Once you move the media WS behind nginx (§8), traffic arrives on 443 and 8765 stays
> firewalled. Only open 8765 directly for a pre-TLS smoke test.

## 8. TLS + `wss://` (production) — needs a domain

Browsers and the mobile app require **`wss://`** (secure) outside of localhost, and Let's
Encrypt won't issue a cert for a bare IP. One cert fronts **both** services the session
server hosts: the media WS (8765) **and** `/infer` + `/session/` (8080). This matters
because koko is a **separate droplet** (`134.122.115.15`), so `/infer` — which carries
patient context + the shared `X-Api-Key` — crosses the public internet and must be TLS'd
too, not just the browser-facing WS.

`guardianova.com` already exists (koko's portal is live at `caregiver.guardianova.com`),
so no new registrar is needed — just a **subdomain A record for this droplet**, which koko
adds since he owns DNS:

1. Have koko point a subdomain A record (e.g. `ai.guardianova.com`) at `67.205.153.42`.
   Confirm with `dig +short <subdomain>`.
2. Install the proxy config:
   ```bash
   cp /opt/memaide/deploy/nginx-memaide.conf /etc/nginx/sites-available/memaide
   ln -s /etc/nginx/sites-available/memaide /etc/nginx/sites-enabled/memaide
   # edit the file: replace YOUR_DOMAIN with the subdomain
   nginx -t && systemctl reload nginx
   ```
3. Get the cert:
   ```bash
   apt install -y certbot python3-certbot-nginx
   certbot --nginx -d ai.guardianova.com
   ```
4. **Cutover (cross-student):** koko sets `AI_AGENT_URL=https://ai.guardianova.com` (was
   `http://67.205.153.42:8080`); Arian points the app at `wss://ai.guardianova.com/` (was
   `ws://67.205.153.42:8765`) and drops `usesCleartextTraffic`. Then close the raw ports:
   `ufw delete allow 8765` and re-scope 8080 to localhost (traffic now arrives on 443).

The glasses/phone app then connects to `wss://ai.guardianova.com/`; `/infer` is at
`https://ai.guardianova.com/infer`; preview is at `https://ai.guardianova.com/preview/`.

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
