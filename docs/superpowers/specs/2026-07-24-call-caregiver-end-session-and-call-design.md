# Call Caregiver: end any open session, then call

Date: 2026-07-24
Branch: watch-phone-app

## Goal

Make "Call Caregiver" (on both phone and watch) end any open AI help session — whether the
session is owned by the phone or the watch — and then place a phone call to the hardcoded
caregiver number. Bring the phone's Call Caregiver to parity with the watch's (which places a
real call) and align the phone's UI alerts to the new flow.

Decisions (from brainstorming):
- Scope: **phone and watch** both get "end session, then call".
- Backend: **call only** — drop the phone's backend help-event post (`sendHelpEvent`).
- Number: `+16614370992` (the watch's existing hardcoded number), centralized on the phone as
  `FakeDataRepository.CAREGIVER_PHONE_NUMBER`.

## Current behavior

- Phone Call Caregiver: `viewModel.sendHelpEvent("phone")` (backend help event), shows a
  "Help request sent to your caregiver." card. Does not call.
- Watch Call Caregiver: `ACTION_CALL` to `+16614370992`; no session teardown.
- Session ownership: `HelpSessionManager.owner` (NONE/PHONE/WATCH), single-owner.
- End phone session: `PhoneVoiceSession.stop()` (releases PHONE).
- End watch session: phone sends `/session_busy` → wear `DataLayerListenerService` →
  `WatchSessionStatus.signalBusy()` → wear UI stops streaming → channel closes →
  `PhoneListenerService.onChannelClosed` releases WATCH.
- Phone manifest has no `CALL_PHONE`; the wear manifest does.

## Design

### Symmetric `/end_session` message

One new data-layer path handled on each side. Each Call Caregiver ends its own local session
directly and tells the other device to end whatever it might own — covering all four cases
(session owned by phone or watch × ended from phone or watch) without inventing new lifecycle:

- Phone Call Caregiver: `PhoneVoiceSession.stop()` (no-op if idle) **and** send `/end_session`
  to the watch.
- Watch Call Caregiver: `audioStreamer.stopStream()` (no-op if idle) **and** send `/end_session`
  to the phone.

Handlers:
- Phone `PhoneListenerService.onMessageReceived` case `"/end_session"` → `PhoneVoiceSession.stop()`.
- Watch `DataLayerListenerService.onMessageReceived` path `"/end_session"` →
  `WatchSessionStatus.signalEnd()`.

`WatchSessionStatus` gains a second one-shot counter mirroring `busySignals`:
`endSignals` / `signalEnd()`. The wear UI reacts to an increment by stopping its stream and
setting `helpStatus = "Session ended"` (neutral, vs. "In use on phone" for busy).

Stopping the watch stream closes the channel, which releases WATCH ownership; `PhoneVoiceSession
.stop()` releases PHONE ownership. No echo: receiving `/end_session` only tears a stream down; it
does not re-send.

### Place the call

Both devices dial the same `+16614370992`.

- Watch: prepend the end-session step (stop own stream + send `/end_session` to phone) before the
  existing `ACTION_CALL`; set `helpStatus = "Calling caregiver"`.
- Phone: add `CALL_PHONE` to the app manifest. On Call Caregiver tap: end sessions via a new
  `HelpSessionController.endAll(context)`, then request `CALL_PHONE`; if granted place an
  `ACTION_CALL`, if denied fall back to `ACTION_DIAL` (opens the dialer prefilled). The phone's
  `sendHelpEvent` call and the "Help request sent" card are removed.

`HelpSessionController.endAll(context)` (phone, data package): `PhoneVoiceSession.stop()` +
fire-and-forget `PhoneMessenger.sendMessage(context, "/end_session", "call_caregiver")`.

### Phone UI alerts (aligned to the new flow)

- Remove the `helpSent` state and the "Help request sent to your caregiver." card.
- Add a `callStatus: String?` alert:
  - "Calling caregiver" when the call is placed (parity with the watch's status).
  - "Call permission needed" when `CALL_PHONE` is denied (same string the watch uses), after
    which the dialer is opened as a fallback.
- Keep: "AI session active — speak now" (while `sessionActive`), "A session is already in use on
  the watch." (`sessionBusy`), and the glasses notice.
- After Call Caregiver ends a session, set the screen's local `sessionActive = false` so the HELP
  toggle and the active card update immediately.

## Files

app:
- `app/src/main/AndroidManifest.xml` — add `CALL_PHONE`.
- `app/src/main/java/com/example/memaid/data/FakeDataRepository.kt` — add
  `CAREGIVER_PHONE_NUMBER = "+16614370992"`.
- `app/src/main/java/com/example/memaid/data/HelpSessionController.kt` — new; `endAll`.
- `app/src/main/java/com/example/memaid/ui/screens/HomeScreen.kt` — Call Caregiver rewrite +
  alert changes.
- `app/src/main/java/com/example/memaid/data/PhoneListenerService.kt` — handle `/end_session`.

wear:
- `wear/src/main/java/com/example/memaid/wear/data/WatchSessionStatus.kt` — add
  `endSignals`/`signalEnd`.
- `wear/src/main/java/com/example/memaid/wear/presentation/DataLayerListenerService.kt` — handle
  `/end_session`.
- `wear/src/main/java/com/example/memaid/wear/presentation/MainActivity.kt` — Call Caregiver
  ends session + sends `/end_session` + `helpStatus = "Calling caregiver"`; react to `endSignals`.

## Testing

This is Android glue (intents + Wear data-layer messages), not unit-testable without
instrumentation. Both devices are connected, so verify live:
1. Phone-owned session, Call Caregiver on phone → session ends, phone dials.
2. Phone-owned session, Call Caregiver on watch → phone session ends, watch dials.
3. Watch-owned session, Call Caregiver on watch → watch stream ends, watch dials.
4. Watch-owned session, Call Caregiver on phone → watch stream ends, phone dials.
5. No session, either device → dials immediately.

## Out of scope

- Changing the AI session/audio pipeline or the backend.
- The caregiver phone number value (kept as the watch's existing `+16614370992`).
