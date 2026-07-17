# Egocentric stream release checklist

Use this checklist for a planned deployment only. It does not authorize an
automatic deploy, production configuration edit, service restart, or NGINX
reload. Never paste `.env`, bearer tokens, callback keys, frame payloads, or
PM2 logs containing request bodies into a terminal transcript, chat, or ticket.

The detailed callback payload and NGINX examples remain in
[`EGOCENTRIC_STREAM_DEPLOYMENT.md`](EGOCENTRIC_STREAM_DEPLOYMENT.md). The
end-to-end behavior is documented in
[`EGOCENTRIC_STREAM_E2E_RUNBOOK.md`](EGOCENTRIC_STREAM_E2E_RUNBOOK.md).

## Ordered release steps

1. Review `git status`, the intended diff, and this checklist. Confirm no
   unrelated local work, `.env`, generated output, or Graphify artifact is in
   the release change.
2. Run the repository checks locally: backend `npm run build && npm test`, then
   client `npm run lint && npm test && npm run build`.
3. Obtain reviewer approval, commit only the intended source, tests, and
   documentation, and push the approved revision. Record the commit SHA.
4. SSH to the production host using the normal deployment account and change to
   the existing checkout. Do not use root or copy a new checkout over it.
5. Fetch and fast-forward to the recorded approved revision; stop if the
   deployed branch has unexpected local changes or does not match that SHA.
6. In `server`, run `npm ci` (or the project-approved locked install) and
   `npm run build`; do not run `prisma migrate reset`, seeds, or destructive DB
   commands.
7. In `client`, run the locked install, `npm run lint`, `npm test`, and
   `npm run build`. Publish the resulting static assets only through the
   existing site deployment procedure.
8. Verify—without printing values—that production has `AI_CALLBACK_API_KEY`,
   `AI_AGENT_URL`, `AI_AGENT_WS_URL`, and `AI_AGENT_API_KEY` (or the legacy
   alias), plus the four documented `AI_FRAME_*` limits.
9. From `server`, run `npm run egocentric-stream:verify`. It must pass its
   read-only configuration and Prisma/model checks. Treat its process-local
   cache warning as a required PM2 status check, not as a failure to ignore.
10. Run `pm2 status` and confirm exactly one backend process serves this API.
    The latest-frame cache is intentionally process-local; do not run PM2
    cluster mode without shared cache support.
11. Restart only the existing backend process with its normal environment
    update command (for example, `pm2 restart memaide-backend --update-env`),
    then confirm it is online and free of startup environment errors.
12. Check `GET /api/health` over the public API and confirm the normal healthy
    response before testing callback traffic.
13. Inspect the active NGINX configuration with `sudo nginx -T` and locate the
    TLS `server` block for `caregiver.guardianova.com`. Confirm the existing
    generic `/api/` proxy path, SSL listener/certificate, upstream, and shared
    proxy headers before changing anything.
14. Back up the exact active NGINX source file with a timestamp, preserving its
    symlink/layout, before editing. Do not create a second conflicting server
    block.
15. Choose one observed NGINX layout:
    - **Approach A — existing API location:** when `location ^~ /api/` is the
      active API proxy, set `client_max_body_size 1m;` inside that existing
      location and retain its proxy include/headers.
    - **Approach B — scoped AI-session location:** when location precedence
      permits it, add a more-specific `location ^~ /api/ai-sessions/` that
      retains the same upstream and proxy headers and sets
      `client_max_body_size 1m;`. Use a regex frames location only when no
      selected `^~ /api/` block would bypass it.
16. Run `sudo nginx -t`; reload NGINX only after it succeeds. If it fails, do
    not reload—restore the timestamped backup, validate again, and stop.
17. Using a real active AI session ID and the callback key through the approved
    secret channel, perform the first JPEG callback, a vision-only callback,
    duplicate/out-of-order checks, and an oversize rejection check. Confirm
    expected `202`, `401`, `409`, and `413` behavior without logging payloads.
18. In the caregiver portal, sign in as the assigned caregiver, open the
    patient’s Stream Status page, confirm the image appears only for that
    patient, test stale/reconnect behavior, switch patients, and verify no old
    image survives the switch or an ended/failed stream.
19. Have Anthony verify the frame callback contract and bounded retry behavior;
    have Arian verify the first mobile start/status/stop flow against the same
    session. Do not infer a stream heartbeat from a successful registration.
20. Send the conclude callback, verify the caregiver endpoint returns no image
    afterward, and record the result. If any release check fails, stop traffic
    tests, restore the prior NGINX configuration if changed, return to the
    prior approved application revision, restart the known-good backend, and
    rerun health before declaring rollback complete.

## Copyable handoffs

**Anthony:**

> Please send `POST /api/ai-sessions/{session_id}/frames` with the approved
> `X-Api-Key`, monotonic `seq`, ISO timestamp, and either a JPEG frame or
> vision-only payload. Treat `202` as acknowledged, stop frames on `409`, and
> use bounded backoff only for `5xx`. Please confirm the first-frame,
> duplicate, out-of-order, oversize, and conclude checks with Koko.

**Arian:**

> Please keep the existing mobile stream start/status/stop contract and test
> it with the same active AI session. Send a terminal stop/status when the
> stream ends; do not attempt to reactivate an ended stream. Confirm Koko sees
> the stream end and no frame remains after conclude.

## Release evidence to retain

Record the deploy commit SHA, UTC start/end time, PM2 one-process confirmation,
Nginx backup filename, `nginx -t` result, health result, callback status codes,
caregiver portal result, Anthony/Arian acknowledgements, and either the final
conclude result or the rollback result. Keep the record free of credentials,
JWTs, base64 frames, or patient names.
