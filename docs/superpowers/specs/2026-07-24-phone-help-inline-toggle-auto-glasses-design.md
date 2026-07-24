# Phone HELP inline toggle + automatic glasses vision

Date: 2026-07-24
Branch: watch-phone-app

## Goal

Make the phone's help flow behave like the watch:

1. The Home `HELP` button toggles the AI voice session **inline** — no navigation to a
   separate page. Label shows `HELP` when idle and `END SESSION` while a session is running.
2. Remove the manual "Include glasses vision" switch. Glasses vision is included
   **automatically** whenever Meta glasses are connected to the phone over Bluetooth, and
   omitted otherwise.
3. The automatic behavior applies whether the session was started from the **phone** or the
   **watch**.

Constraint: keep changes minimal and surgical. This branch shares the watch flow with another
developer (Arian); touch the shared `PhoneListenerService` as little as possible.

## Current behavior (for reference)

- `HomeScreen` HELP button calls `onHelpClick`, which navigates to `Screen.Help` /
  `HelpScreen`.
- `HelpScreen` holds: a "Talk to AI Assistant" / "End AI Session" toggle button, a
  "Call Caregiver" button (`viewModel.sendHelpEvent("phone")`), an "Include glasses vision"
  `Switch`, and status/notice cards. It owns the RECORD_AUDIO / CAMERA / Wearables-CAMERA
  permission launchers and starts `PhoneVoiceSession`.
- `PhoneVoiceSession.start(context, withGlasses)` acquires the single-owner session
  (`HelpSessionManager`), opens the AI WebSocket, streams the phone mic, and — when
  `withGlasses` — runs `startGlassesCapture` (a private frame loop over `GlassesFrameSource`
  + `FrameEncoder` into the same `VoiceBridge`).
- `PhoneListenerService.onChannelOpened` handles the **watch-started** session (mic audio over
  a Wear data-layer channel). It is **audio only** today — no glasses capture.

## Design

### 1. Home screen owns the help UI (delete HelpScreen)

Move the help interaction onto `HomeScreen`:

- Replace the navigating `HELP` button with an inline session toggle. Label + color follow
  `PhoneVoiceSession.isActive`: `HELP` (red `0xFFD32F2F`) when idle, `END SESSION`
  (grey `0xFF757575`) when active. Tapping starts or stops the session.
- Add a `Call Caregiver` button directly below it (red), calling
  `viewModel.sendHelpEvent(sourceDevice = "phone")` — the behavior moved verbatim from
  `HelpScreen`.
- Move the status/notice cards to Home: "AI session active — speak now" while active,
  "A session is already in use on the watch." when start is refused, and the
  "Help request sent to your caregiver." confirmation. Reuse the `DismissibleNotice`
  composable (relocate it alongside Home, or into a small shared file).
- Move the permission-launcher logic (RECORD_AUDIO always; CAMERA + Wearables-CAMERA only
  when glasses are used) from `HelpScreen` into Home. The `useGlasses` value is **computed**
  (see §2), not read from a switch.
- Stop the session on dispose (existing `DisposableEffect` behavior), so leaving Home ends
  an active session — matching today's HelpScreen behavior.

Remove the navigation:

- Delete `HelpScreen.kt`.
- Remove `Screen.Help` from `navigation/Screen.kt`.
- Remove the `Screen.Help` `composable { HelpScreen(...) }` block and the `onHelpClick`
  navigation lambda in `MainActivity.kt`; drop the `onHelpClick` parameter from `HomeScreen`.
- `PhoneListenerService` already sets an `openHelp` intent extra that `MainActivity` never
  reads; leave it — it only brings the app to the foreground. No behavior depends on it.

### 2. Automatic glasses detection over Bluetooth

New helper `com.example.memaid.data.GlassesBluetooth`:

```
object GlassesBluetooth {
    // Pure, unit-testable.
    // Meta glasses advertise a default Bluetooth name beginning with "RB" (Ray-Ban Meta).
    // Also match legacy / alternate names. Case-insensitive.
    private val PATTERNS = listOf("rb", "ray-ban", "meta", "stories")
    fun isMetaGlasses(name: String?): Boolean
    fun shouldCapture(connectedNames: List<String>): Boolean =
        connectedNames.any { isMetaGlasses(it) }

    // Thin Android query. Enumerate BluetoothAdapter.bondedDevices, keep those currently
    // connected (BluetoothDevice.isConnected()), return their names. Any failure
    // (no adapter, denied BLUETOOTH_CONNECT, reflection/SecurityException) -> emptyList.
    fun connectedDeviceNames(context: Context): List<String>

    // Convenience: shouldCapture(connectedDeviceNames(context)).
    fun glassesConnected(context: Context): Boolean
}
```

Matching rule for `isMetaGlasses`: trim, lowercase, then true if the name **starts with `rb`**
or **contains** any of `ray-ban` / `meta` / `stories`. The `rb` prefix is the observed default
connection name for Ray-Ban Meta glasses; keeping the list small and centralized makes it easy
to extend if a device reports a different name.

`connectedDeviceNames` reads currently-connected devices. `BluetoothDevice.isConnected()` is a
hidden-but-stable API reached by reflection (`getMethod("isConnected")`), the standard way to
tell whether a bonded device is connected without a profile-proxy round trip. Requires
`BLUETOOTH_CONNECT` (already requested in `MainActivity`); if not granted, `getName()` /
reflection throw `SecurityException`, which we swallow and treat as "not connected"
(audio-only).

Decision points that call it:

- **Phone path (Home):** on HELP tap, compute `useGlasses = GlassesBluetooth.glassesConnected(ctx)`
  before launching permissions. If true, the permission list adds CAMERA and, after the Android
  grants, the Wearables CAMERA permission is requested and the session starts with
  `withGlasses = true`; otherwise start audio-only. This replaces the SDK-init/registration
  dance the old HelpScreen ran — we only touch the Wearables SDK when a Meta device is actually
  connected.
- **Watch path (PhoneListenerService):** see §3.

`GlassesFrameSource` still guards and degrades gracefully (logs, audio continues) if the stream
cannot actually open, so a stale/edge Bluetooth state never crashes a session.

### 3. Share glasses capture into the watch path

Extract the private `PhoneVoiceSession.startGlassesCapture` frame loop into a reusable helper so
both session paths use one implementation:

```
object GlassesCapture {
    // Launches frame capture (GlassesFrameSource -> FrameEncoder -> voiceBridge.sendFrame)
    // on the given scope; returns the Job so the caller can cancel on teardown. Swallows and
    // logs failures so audio keeps running.
    fun start(appCtx: Context, voiceBridge: VoiceBridge, scope: CoroutineScope): Job
}
```

- `PhoneVoiceSession` calls `GlassesCapture.start(...)` in place of its private method (keeps
  its `framesJob` cancellation on `stop()`).
- `PhoneListenerService.onChannelOpened`, after it has acquired the session and begun connecting
  the WebSocket, starts glasses capture **iff** `GlassesBluetooth.glassesConnected(applicationContext)`,
  storing the `Job` and cancelling it in `onChannelClosed` (next to the existing
  `HelpSessionManager.release`). This is the only change to the shared watch file: one gated
  call plus a cancel — roughly five lines beyond the shared helper.

## Files

Changed:
- `app/src/main/java/com/example/memaid/ui/screens/HomeScreen.kt` — inline toggle, Call
  Caregiver, notices, auto-glasses, permission launchers.
- `app/src/main/java/com/example/memaid/MainActivity.kt` — drop Help route + `onHelpClick`.
- `app/src/main/java/com/example/memaid/navigation/Screen.kt` — drop `Help` route.
- `app/src/main/java/com/example/memaid/data/PhoneVoiceSession.kt` — use `GlassesCapture`.
- `app/src/main/java/com/example/memaid/data/PhoneListenerService.kt` — gated glasses on watch
  path.

Added:
- `app/src/main/java/com/example/memaid/data/GlassesBluetooth.kt`
- `app/src/main/java/com/example/memaid/data/GlassesCapture.kt`

Deleted:
- `app/src/main/java/com/example/memaid/ui/screens/HelpScreen.kt`

## Testing

Small set, chosen for signal without hardware/network:

- **Unit** `app/src/test/java/com/example/memaid/data/GlassesBluetoothTest.kt`:
  - `isMetaGlasses`: `"RB-1A2B"`, `"Ray-Ban Meta"`, `"meta glasses"`, `"Ray-Ban Stories"` -> true;
    `"Pixel Buds"`, `"Galaxy Watch"`, `""`, `null` -> false.
  - `shouldCapture`: list containing a Meta name -> true; list of non-Meta names / empty -> false.
- **Compose UI** `app/src/androidTest/java/com/example/memaid/HomeScreenTest.kt` (mirrors
  `SettingsScreenTest`):
  - Home displays `HELP` and `Call Caregiver`.
  - The `Include glasses vision` switch is absent (`assertDoesNotExist`).

Not unit-tested (require a device/permissions/network, unchanged risk): live Bluetooth
enumeration, the actual session start/stop, and glasses frame streaming. These are exercised
manually on device.

## Out of scope

- Any change to the watch app UI (`wear/`), the AI session backend calls, or the audio pipeline.
- Distinguishing "registered but powered-off" glasses beyond what the Bluetooth connection state
  already tells us.
- Unrelated refactoring of `PhoneListenerService`.
