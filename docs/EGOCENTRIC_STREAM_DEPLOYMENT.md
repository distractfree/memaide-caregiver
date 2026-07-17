# Egocentric glasses stream deployment guide

This guide prepares the existing GuardiaNova deployment for the authenticated
egocentric-frame callback. It is a runbook only: it does **not** authorize an
automatic deployment, PM2 restart, NGINX edit, or production `.env` change.

The production callback is:

```text
POST https://caregiver.guardianova.com/api/ai-sessions/{session_id}/frames
```

Only Anthony's server calls this endpoint. The caregiver browser polls Koko's
backend; it never receives an Anthony URL, a media token, or a public image URL.

## Required non-secret environment values

Set these values in the backend process environment before sending real frames:

```env
AI_FRAME_JSON_LIMIT=1mb
AI_FRAME_MAX_DECODED_BYTES=786432
AI_FRAME_CACHE_TTL_SECONDS=300
AI_FRAME_CACHE_MAX_SESSIONS=50
```

Do not print, replace, or add `AI_CALLBACK_API_KEY` here. It is an existing
secret shared only with Anthony through the approved channel.

From `~/memaide-caregiver/server`, the following commands update only those
four non-secret variables without dumping the entire `.env` file:

```bash
grep -q '^AI_FRAME_JSON_LIMIT=' .env \
  && sed -i 's/^AI_FRAME_JSON_LIMIT=.*/AI_FRAME_JSON_LIMIT=1mb/' .env \
  || printf '\nAI_FRAME_JSON_LIMIT=1mb\n' >> .env

grep -q '^AI_FRAME_MAX_DECODED_BYTES=' .env \
  && sed -i 's/^AI_FRAME_MAX_DECODED_BYTES=.*/AI_FRAME_MAX_DECODED_BYTES=786432/' .env \
  || printf 'AI_FRAME_MAX_DECODED_BYTES=786432\n' >> .env

grep -q '^AI_FRAME_CACHE_TTL_SECONDS=' .env \
  && sed -i 's/^AI_FRAME_CACHE_TTL_SECONDS=.*/AI_FRAME_CACHE_TTL_SECONDS=300/' .env \
  || printf 'AI_FRAME_CACHE_TTL_SECONDS=300\n' >> .env

grep -q '^AI_FRAME_CACHE_MAX_SESSIONS=' .env \
  && sed -i 's/^AI_FRAME_CACHE_MAX_SESSIONS=.*/AI_FRAME_CACHE_MAX_SESSIONS=50/' .env \
  || printf 'AI_FRAME_CACHE_MAX_SESSIONS=50\n' >> .env
```

Review only the four variable names and values after editing; do not paste the
whole `.env` into a terminal, ticket, chat, or log.

## Inspect NGINX before editing

On the production host, first locate the active server block and its existing
proxy includes:

```bash
sudo nginx -T
sudo grep -R "server_name caregiver.guardianova.com" \
  /etc/nginx/sites-enabled /etc/nginx/conf.d
```

Check whether the current API proxy is declared directly in the server block or
through an `include`. Reuse the existing proxy headers/include rather than
copying a second, potentially inconsistent proxy configuration.

NGINX evaluates exact locations first, then prefix locations, then regex
locations (unless a selected prefix uses `^~`). Therefore a generic declaration
such as `location ^~ /api/` prevents the regex example below from being chosen.
If that exists, place `client_max_body_size 1m;` inside the existing `^~ /api/`
location or add a more-specific `^~ /api/ai-sessions/` location that reuses the
same proxy settings. Do not assume a regex location will override `^~`.

When the existing configuration permits a regex location, add this scoped block
inside the observed `server { ... }` for `caregiver.guardianova.com`:

```nginx
location ~ ^/api/ai-sessions/[^/]+/frames$ {
    client_max_body_size 1m;

    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 5s;
    proxy_send_timeout 10s;
    proxy_read_timeout 10s;
}
```

The backend also enforces the route-specific 1 MB JSON parser and a 786,432-byte
decoded-image limit. The NGINX body limit is only the proxy boundary. Do not
globally increase `client_max_body_size` unless the reviewed configuration makes
a safely scoped location impractical. Do not put API keys in NGINX.

## Safe validation, reload, and rollback

1. Back up the actual file before editing it. Replace the placeholder with the
   path discovered above.

   ```bash
   sudo cp /etc/nginx/sites-enabled/<caregiver-site> \
     /etc/nginx/sites-enabled/<caregiver-site>.$(date +%Y%m%d%H%M%S).bak
   ```

2. Edit the live source file (not a broken symlink target) using the observed
   layout and location precedence.
3. Validate before every reload:

   ```bash
   sudo nginx -t
   ```

4. Reload only after validation succeeds:

   ```bash
   sudo systemctl reload nginx
   ```

5. If validation fails, do **not** reload. Restore the timestamped backup,
   rerun `sudo nginx -t`, and only then reload:

   ```bash
   sudo cp /etc/nginx/sites-enabled/<caregiver-site>.<timestamp>.bak \
     /etc/nginx/sites-enabled/<caregiver-site>
   sudo nginx -t
   sudo systemctl reload nginx
   ```

## Anthony handoff contract

Send Anthony the endpoint and existing callback key through the approved secret
channel, not a browser URL.

```text
POST https://caregiver.guardianova.com/api/ai-sessions/{session_id}/frames
Content-Type: application/json
X-Api-Key: <existing callback key>
```

For a newly accepted callback, Koko returns HTTP `202`:

```json
{
  "success": true,
  "accepted": true,
  "sessionId": "...",
  "seq": 12,
  "receivedAt": "2026-07-15T10:32:01.000Z"
}
```

Duplicate and out-of-order sequence values also return `202`, with
`"accepted": false` and a reason. Anthony should treat the following statuses
as follows:

| Status | Meaning |
| --- | --- |
| `202` | Callback acknowledged; duplicates/out-of-order values are intentionally ignored. |
| `401` | Callback-key problem. |
| `404` | Unknown AI session. |
| `409` | AI session or its associated stream is terminal; do not retry as a frame. |
| `413` | Request/image is too large. |
| `400` / `422` | Invalid payload. |
| `5xx` | Temporary Koko backend failure; retry with bounded backoff. |

Anthony may send image-only or vision-only callbacks. JPEGs must be raw standard
base64 with `mime: "image/jpeg"`; never send a browser data URL. Vision-only
callbacks advance sequence metadata and retain the last valid JPEG in the
process cache, but vision metadata is not displayed in the caregiver portal.

## Manual callback checks

Run these only after a real active `AiSession` ID is supplied manually. The
commands intentionally never echo `CALLBACK_KEY`.

```bash
cd ~/memaide-caregiver/server
CALLBACK_KEY=$(grep '^AI_CALLBACK_API_KEY=' .env | cut -d= -f2-)
SESSION_ID='<paste an active AiSession ID here>'
BASE_URL='https://caregiver.guardianova.com'
TINY_JPEG_B64='/9j/2Q=='
```

First JPEG callback (measure total request time; expected HTTP `202`):

```bash
curl --silent --show-error --output /tmp/egocentric-frame-response.json \
  --write-out 'HTTP %{http_code} total=%{time_total}s\n' \
  -X POST "$BASE_URL/api/ai-sessions/$SESSION_ID/frames" \
  -H 'Content-Type: application/json' \
  -H "X-Api-Key: $CALLBACK_KEY" \
  --data '{"seq":0,"ts":"2026-07-15T10:32:00.000Z","image":{"mime":"image/jpeg","b64":"/9j/2Q=="}}'
```

Vision-only callback (it must not blank the last image):

```bash
curl --silent --show-error --output /tmp/egocentric-vision-response.json \
  --write-out 'HTTP %{http_code} total=%{time_total}s\n' \
  -X POST "$BASE_URL/api/ai-sessions/$SESSION_ID/frames" \
  -H 'Content-Type: application/json' \
  -H "X-Api-Key: $CALLBACK_KEY" \
  --data '{"seq":1,"ts":"2026-07-15T10:32:02.000Z","vision":{"label":"kitchen","flags":["person_seated"]}}'
```

Duplicate and out-of-order checks (both should receive `202` with
`accepted:false`):

```bash
curl --silent --show-error --output /tmp/egocentric-duplicate-response.json \
  --write-out 'HTTP %{http_code} total=%{time_total}s\n' \
  -X POST "$BASE_URL/api/ai-sessions/$SESSION_ID/frames" \
  -H 'Content-Type: application/json' -H "X-Api-Key: $CALLBACK_KEY" \
  --data '{"seq":1,"ts":"2026-07-15T10:32:03.000Z","vision":{"label":"kitchen"}}'

curl --silent --show-error --output /tmp/egocentric-out-of-order-response.json \
  --write-out 'HTTP %{http_code} total=%{time_total}s\n' \
  -X POST "$BASE_URL/api/ai-sessions/$SESSION_ID/frames" \
  -H 'Content-Type: application/json' -H "X-Api-Key: $CALLBACK_KEY" \
  --data '{"seq":0,"ts":"2026-07-15T10:32:04.000Z","vision":{"label":"kitchen"}}'
```

Conclude callback (use real session/patient IDs and current timestamps):

```bash
PATIENT_ID='<paste the matching patient ID here>'
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
curl --silent --show-error --output /tmp/egocentric-conclude-response.json \
  --write-out 'HTTP %{http_code} total=%{time_total}s\n' \
  -X POST "$BASE_URL/api/ai-sessions/$SESSION_ID/conclude" \
  -H 'Content-Type: application/json' -H "X-Api-Key: $CALLBACK_KEY" \
  --data "{\"id\":\"$SESSION_ID\",\"patient_id\":\"$PATIENT_ID\",\"started_at\":\"$NOW\",\"ended_at\":\"$NOW\",\"transcript\":[],\"escalated\":false,\"status\":\"ended\",\"outcome\":\"manual_production_check\"}"
```

For the caregiver frame check, obtain a valid caregiver JWT through the normal
login flow and enter it without echoing it. Replace `STREAM_SESSION_ID` with
the lightweight stream ID found in the portal or database query.

```bash
read -r -s -p 'Caregiver JWT: ' CAREGIVER_TOKEN; printf '\n'
STREAM_SESSION_ID='<paste the glasses StreamSession ID here>'
curl --silent --show-error \
  -H "Authorization: Bearer $CAREGIVER_TOKEN" \
  "$BASE_URL/api/stream-sessions/$STREAM_SESSION_ID/frame/latest"
unset CAREGIVER_TOKEN CALLBACK_KEY
```

Use a lightweight database query only; it deliberately selects no image field
or full metadata document:

```bash
psql "$DATABASE_URL" -c "
SELECT id, patient_id, source, status, started_at, ended_at,
       metadata->>'aiSessionId' AS ai_session_id,
       metadata->>'lastFrameSeq' AS last_frame_seq,
       metadata->>'lastFrameReceivedAt' AS last_frame_received_at,
       metadata->>'endReason' AS end_reason
FROM stream_sessions
WHERE metadata->>'aiSessionId' = '$SESSION_ID'
ORDER BY created_at DESC;"
```

Inspect operational logs without request bodies, headers, or callback payloads:

```bash
pm2 status
pm2 logs memaide-backend --lines 100
```

## Cache and stale-frame boundaries

Frame cache entries exist only in the running backend process. Successful
conclude, caregiver/mobile resolve, supersession, mobile stream stop, and
terminal stream-status changes delete the local cache after database commit.
The caregiver latest-frame endpoint independently rejects cached imagery when
the StreamSession or AI session is terminal, so a race or stale cache entry
cannot expose an ended frame.

`npm run ai-sessions:cleanup-stale -- --apply` is a separate Node process. It
closes matching AI/stream rows in PostgreSQL but cannot delete the PM2 process's
in-memory `Map`. That stale local entry remains only until cache TTL expiry or a
backend restart; the endpoint still refuses it because it checks database
terminal state first. Do not claim the cleanup script clears PM2 memory and do
not add IPC or Redis solely for that purpose.

No automatic server job ends a stream after an eight-second frame gap. The
portal marks the retained image stale while the stream remains active and keeps
polling. Future Anthony integration should add an explicit heartbeat and
error/end callback contract before automatic disconnect termination is
considered.
