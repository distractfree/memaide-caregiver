# Egocentric glasses stream end-to-end runbook

Use this runbook with an approved deployment and real test patient. It does not
change production state until the operator intentionally starts a session or
sends the listed callbacks. Record timestamps, HTTP statuses, session IDs, and
safe error codes; never record callback keys, JWTs, headers, or base64.

## 1. Preflight

1. Confirm backend and frontend health through the normal portal URL and health
   endpoint.
2. Confirm PM2 is online:

   ```bash
   pm2 status
   pm2 logs memaide-backend --lines 100
   ```

3. Confirm the active NGINX configuration passes:

   ```bash
   sudo nginx -t
   ```

4. Confirm the deployment/environment procedure in
   [EGOCENTRIC_STREAM_DEPLOYMENT.md](EGOCENTRIC_STREAM_DEPLOYMENT.md) has been
   followed. Do not print `.env` or API keys.

## 2. Start the control session

1. Have Arian start an AI session using a valid device ID through the existing
   app flow.
2. Record the returned `sessionId`, `websocketUrl`, and `helloMessage` in the
   test record. Do not treat the WebSocket URL as a caregiver browser URL.
3. Confirm Anthony successfully registered the new AI session.
4. Confirm previous non-terminal AI sessions for that patient were superseded
   only after the new registration succeeded. Their associated glasses streams
   should be `ended` with `endReason=superseded_by_new_ai_session`.

## 3. Establish the frame stream

1. Have Anthony send sequence `0` (or the real first sequence) to
   `POST /api/ai-sessions/{sessionId}/frames` using the existing callback key.
2. Confirm the callback returns HTTP `202` quickly, ideally within Anthony's
   five-second timeout target.
3. Confirm one `StreamSession` exists with:

   - `source = glasses`
   - `status = active`
   - `metadata.aiSessionId = sessionId`
   - lightweight latest sequence/timestamp fields only

4. Confirm the callback did not create a frame-history table, object-storage
   object, public URL, or PostgreSQL base64 field.

## 4. Caregiver portal behavior

1. Log in as the owning caregiver and select the patient.
2. Open **Stream Status**.
3. Confirm the expected progression:

   - **Waiting** before a JPEG is available.
   - **Live** within the two-second frame polling interval after an accepted
     JPEG callback.
   - **Stale / waiting for a new frame** after frames pause for at least eight
     seconds. The old frame remains visible with an overlay; it must not be
     described as live.
   - **Live** again after a newer JPEG callback arrives.

4. Confirm the browser polls status approximately every three seconds and the
   latest-frame endpoint approximately every two seconds while visible.
5. Confirm a vision-only callback advances the event but leaves the prior JPEG
   visible.
6. Confirm duplicate and out-of-order sequences receive acknowledged `202`
   responses with `accepted:false` and do not change the displayed image.
7. Confirm no vision description, label, flags, advisory flags, or base64 text
   appears in the caregiver UI, browser storage, or console logging.

## 5. Terminal lifecycle checks

1. Have Anthony send the valid `/conclude` callback for the same `sessionId`.
2. Confirm it resolves (or errors, when Anthony reports a failure) the
   `AiSession`, stores its transcript exactly once, and ends every associated
   active/starting `StreamSession` without deleting history.
3. Confirm stream metadata records the appropriate end reason and the cached
   frame becomes unavailable after the database transaction commits.
4. Confirm the portal's next status poll shows:

   - `hasActiveStream: false`
   - `activeSession: null`
   - `viewerAvailable: false`
   - `latestSession` as the ended stream
   - an ended/failed viewer state with no image

5. Refresh Stream Status and call the caregiver latest-frame endpoint again.
   It must return `200` with `data.available:false`, never a prior JPEG.
6. Send one deliberately late frame callback. Confirm HTTP `409`, no new
   StreamSession, no reactivation, no metadata mutation, and no cache refill.
7. Repeat the conclude callback. It must be successful and reconcile any
   accidentally active associated stream without duplicating transcript rows or
   changing an existing `endedAt` without cause.

## 6. Alternate terminal paths

Run these paths in separate test sessions when they are part of the release:

- Caregiver resolves the AI session: its glasses stream ends with
  `caregiver_resolved` and the cache is deleted.
- Arian resolves the AI session from mobile: its glasses stream ends with
  `mobile_resolved` and the cache is deleted.
- A newer AI session successfully registers: older non-terminal AI sessions and
  their active/starting glasses streams end with
  `superseded_by_new_ai_session`. A failed new registration must leave the
  previous working session/stream alone.
- `POST /api/mobile/stream/stop`: an associated glasses cache becomes
  unavailable; repeating the stop is safe and does not create terminal history
  twice.

## 7. Failure recording

For each pass, record only:

| Check | Record |
| --- | --- |
| Callback latency | `curl` total time and HTTP status |
| Session linkage | AI session ID and StreamSession ID |
| Viewer transition | waiting/live/stale/ended timestamps |
| Sequence behavior | sequence number and accepted/ignored result |
| Terminal result | final AI/stream status and safe end reason |
| Failure | safe error code/message, never request body or secret |

If Anthony stops sending frames without concluding, leave the stream active and
record the portal's stale transition. This MVP has no heartbeat/error callback
and intentionally does not auto-end streams after a short gap. Escalate a
repeated disconnect for follow-up with Anthony rather than inventing a terminal
state.

## 8. Repeatability and acceptance

Repeat the complete flow more than once with fresh AI sessions. A release is
ready for the egocentric feature only when all of the following hold:

- Every accepted first frame produces one active glasses stream.
- The caregiver can view only the newest active frame for their own patient.
- Terminal paths remove the view immediately and preserve history.
- Repeated callbacks/stops/resolves are safe.
- No base64 is persisted or exposed in status summaries.
- NGINX validation, PM2 health, and backend/frontend checks are green.
