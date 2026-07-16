# Design: Settings UI cleanup + emoji removal on `glasses-test`

**Date:** 2026-07-15
**Branch:** `glasses-test` (commit onto it directly)

## Goal

Integrate Arian's UI tidy-up into my glasses/audio branch (`glasses-test`, HEAD `ac964d4`)
**without** pulling in any of Arian's functional changes and **without** touching any of my
audio/glasses functionality. Two cosmetic changes only:

1. Adopt Arian's trimmed **Settings screen**.
2. Strip emojis from user-visible UI text across phone + watch, replacing with text only.

My work takes precedence. Arian's branch (`origin/arian/student1-work`, HEAD `6ee48f3`) mixes a
large functional change (reminder-sync, vitals/ack fixes) with one UI cleanup; only the UI cleanup
comes across.

## Scope

### Change 1 — Settings screen cleanup (`SettingsScreen.kt`, `MainActivity.kt`)

Adopt Arian's trimmed `SettingsScreen` layout:

- **Remove** the Demo Mode toggle `Card`, the "Backend URL" row, the "Mode" row, the
  "Send Test to Watch" button, and the "Beacon Debug" button.
- **Remove** the now-unused `onBeaconDebug` parameter from `SettingsScreen(...)` and the imports it
  dragged in (`FakeDataRepository`, `ReminderRepository`, `mutableStateOf`, `remember`, `setValue`,
  and the `PhoneMessenger`/`launch` usage).
- **Keep** the "Register Glasses" button and the Patient Name / Device ID / Caregiver rows.
- Device ID: keep **my** non-null `getDeviceId(): String`; drop Arian's `?: "Not set"` elvis
  (unnecessary against a non-null return, would be a compile warning).
- In `MainActivity.kt`, remove the `onBeaconDebug = { navController.navigate(Screen.BeaconDebug.route) }`
  callback passed to `SettingsScreen`.

### Change 2 — Keep Beacon Debug screen, hide its button

- **Keep** `composable(Screen.BeaconDebug.route) { BeaconDebugScreen(...) }` in `MainActivity.kt`
  and keep `BeaconDebugScreen.kt` untouched. The screen stays in code, just unreachable from the UI.
  No functionality is removed.

### Change 3 — Default to live backend (`ReminderRepository.kt`)

- Flip `var demoMode: Boolean = true` → `false`. This is the one deliberate behavior change: with the
  Settings toggle gone, the app must default to the live backend so a real phone+watch test hits the
  server. All fake-data branches remain in place, just inactive.

### Change 4 — Strip emojis from user-visible UI text (phone + watch)

Replace emoji-prefixed / emoji-bearing **user-visible** strings with text-only equivalents.

Phone screens:

| File | Before | After |
|---|---|---|
| `SettingsScreen.kt` | `🥽 Register Glasses` | `Register Glasses` |
| `HomeScreen.kt` | `🆘  HELP` | `HELP` |
| `HomeScreen.kt` | `✅ All reminders completed!` | `All reminders completed!` |
| `HomeScreen.kt` | `Done ✓` | `Done` |
| `HelpScreen.kt` | `🥽 Include glasses vision` | `Include glasses vision` |
| `HelpScreen.kt` | `⏹  End AI Session` / `🎙  Talk to AI Assistant` | `End AI Session` / `Talk to AI Assistant` |
| `HelpScreen.kt` | `🆘  Call Caregiver` | `Call Caregiver` |
| `HelpScreen.kt` | `🎙 AI session active — speak now` | `AI session active — speak now` |
| `HelpScreen.kt` | `✓ Help request sent. Opening WhatsApp...` | `Help request sent. Opening WhatsApp...` |
| `GlassesRegisterScreen.kt` | `🥽 Meta Glasses` | `Meta Glasses` |
| `GlassesRegisterScreen.kt` | `✓ Registered` | `Registered` |
| `ReminderDetailScreen.kt` | `🔔 Test Notification (fires in 3s)` | `Test Notification (fires in 3s)` |
| `ReminderDetailScreen.kt` | `✓  I Did This` | `I Did This` |
| `ReminderDetailScreen.kt` | `✅ Acknowledged` | `Acknowledged` |

Watch (`wear/presentation/MainActivity.kt`), visible UI only:

| Before | After |
|---|---|
| `❤️ …bpm` | `…bpm` |
| `🏃 $motionState` | `$motionState` |
| `⏹ End Session` / `🆘 Help` | `End Session` / `Help` |
| `📞 Call Caregiver` | `Call Caregiver` |
| `✓ Done` | `Done` |

**Bare selection checkmarks** (not prefixes): `PatientSelectScreen.kt` `text = "✓"` and any
`GlassesRegister` bare `✓` indicator — replaced with a Material `Icon(Icons.Default.Check)` (a vector,
not an emoji) so the layout does not collapse to an empty box.

**Out of scope:** `Log.d` / `Log.e` developer log strings (the emoji hits throughout `wear/`
services, `VitalsSensorManager`, `WatchMessenger`, etc.) are logcat output, not UI, and are left
unchanged.

## Explicitly NOT touched

- Any of my audio/glasses functionality (`PhoneAudioSession`, `VoiceBridge`, `SpeechEndpointer`,
  wear audio streaming, half-duplex gate).
- My newer `GlassesRegisterScreen.kt` and `HelpScreen.kt` logic — only emoji strings on them change;
  Arian's older versions of these screens are ignored (they differ only because his branch predates
  my audio work).
- Any of Arian's functional changes (reminder-sync, vitals/ack delivery, device-id nullability,
  `ReminderSync`, `TimeUtils`, etc.). UI only.

## Testing

1. **Unit test** (`app/src/test/`, Robolectric — runs via `./gradlew test`): assert
   `ReminderRepository.demoMode == false`, guarding the safety-critical default so the app is never
   silently re-stranded in demo mode.
2. **Compose UI integration test** (`app/src/androidTest/`, existing compose-ui-test deps, runs on a
   device/emulator): render `SettingsScreen` and assert removed controls are **absent**
   ("Send Test to Watch", "Beacon Debug", "Demo Mode") and kept controls are **present**
   ("Register Glasses", "Device ID"). Requires a minimal `MainViewModel`/fake. **Fallback:** if a
   clean `MainViewModel` instance proves too heavy/fragile, keep the demoMode unit test as the
   automated guard and verify the Settings layout via the compile check + the on-device run instead.
3. **Build verification (run in this environment):** `./gradlew :app:compileDebugKotlin` (and wear
   module) to prove the removed-parameter signature change, dropped imports, and elvis removal compile
   clean.
4. **Emoji sweep verification:** after editing, re-run the emoji `git grep -P` over the UI `.kt`
   files (logs excluded) and confirm **zero** matches in visible `Text(...)`.

## Delivery

One commit onto `glasses-test`, e.g.:
"Integrate Arian's Settings cleanup + strip UI emojis; default to live backend".

Then the user runs the app test on both phone and watch.
