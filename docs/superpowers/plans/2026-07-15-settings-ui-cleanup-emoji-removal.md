# Settings UI Cleanup + Emoji Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `glasses-test`, adopt Arian's trimmed Settings screen, default the app to the live backend, and strip emojis from all user-visible UI text — without changing any audio/glasses functionality.

**Architecture:** Pure UI/cosmetic edits to Jetpack Compose screens plus one default-value flip in a repository object. No data-layer or audio logic changes. Beacon Debug screen stays in code but loses its button. One Robolectric unit test guards the default-mode flip; one on-device Compose test guards the Settings layout.

**Tech Stack:** Kotlin, Jetpack Compose (Material3), JUnit + Robolectric 4.15.1 (JVM unit tests via `./gradlew test`), Compose UI Test + Espresso (instrumented `androidTest`, runs on device/emulator), Gradle.

**Working directory:** repo root `C:/Users/Anthony/Documents/CS/mem_aide`, branch `glasses-test`. Commit directly onto `glasses-test`.

**Note on running Gradle:** the local shell is PowerShell. Use `.\gradlew` (Windows wrapper). If `./gradlew`/`.\gradlew` cannot run in this environment, the fallback verification is the Android Studio build; instrumented `androidTest` always runs on the user's device during their app test, not in this session.

---

## File Structure

- `app/src/main/java/com/example/memaid/data/ReminderRepository.kt` — flip `demoMode` default (Task 1).
- `app/src/test/java/com/example/memaid/data/ReminderRepositoryDefaultsTest.kt` — **new** Robolectric unit test for the default (Task 1).
- `app/src/main/java/com/example/memaid/ui/screens/SettingsScreen.kt` — remove demo toggle / test / beacon-debug controls, drop `onBeaconDebug` param, strip Register-Glasses emoji (Task 2).
- `app/src/main/java/com/example/memaid/MainActivity.kt` — drop the `onBeaconDebug` callback at the `SettingsScreen(...)` call site; keep the `BeaconDebug` route (Task 2).
- `app/src/androidTest/java/com/example/memaid/SettingsScreenTest.kt` — **new** Compose UI test for the trimmed Settings layout (Task 3).
- Phone screens — emoji strings only (Task 4):
  `HomeScreen.kt`, `HelpScreen.kt`, `GlassesRegisterScreen.kt`, `ReminderDetailScreen.kt`, `PatientSelectScreen.kt`.
- Watch screen — emoji strings only (Task 5):
  `wear/src/main/java/com/example/memaid/wear/presentation/MainActivity.kt`.

---

## Task 1: Default the app to the live backend

**Files:**
- Modify: `app/src/main/java/com/example/memaid/data/ReminderRepository.kt:6`
- Test: `app/src/test/java/com/example/memaid/data/ReminderRepositoryDefaultsTest.kt` (create)

Removing the Settings toggle leaves no runtime way to switch modes, so the fixed default must be
live backend (`demoMode = false`). This test pins that default so it can't silently regress.

- [ ] **Step 1: Write the failing test**

Create `app/src/test/java/com/example/memaid/data/ReminderRepositoryDefaultsTest.kt` (JVM test source set, runs under Robolectric):

```kotlin
package com.example.memaid.data

import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ReminderRepositoryDefaultsTest {

    // With the Settings demo-mode toggle removed, the app must default to the live
    // backend. If this fails, the app would be stranded on fake data with no UI to fix it.
    @Test
    fun demoMode_defaultsToLiveBackend() {
        assertFalse(
            "ReminderRepository.demoMode must default to false (live backend)",
            ReminderRepository.demoMode
        )
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\gradlew :app:testDebugUnitTest --tests "com.example.memaid.data.ReminderRepositoryDefaultsTest"`
Expected: FAIL — assertion error "must default to false" (current default is `true`).

- [ ] **Step 3: Flip the default**

In `app/src/main/java/com/example/memaid/data/ReminderRepository.kt`, change line 6:

```kotlin
    // true = fake data, false = real backend
    var demoMode: Boolean = false
```

(Only the value `true` → `false` changes. Leave every `if (demoMode)` branch in the file intact —
the fake-data code stays, just inactive.)

- [ ] **Step 4: Run test to verify it passes**

Run: `.\gradlew :app:testDebugUnitTest --tests "com.example.memaid.data.ReminderRepositoryDefaultsTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/example/memaid/data/ReminderRepository.kt app/src/test/java/com/example/memaid/data/ReminderRepositoryDefaultsTest.kt
git commit -m "Default demoMode to live backend; pin with unit test"
```

---

## Task 2: Trim the Settings screen and drop the Beacon Debug button

**Files:**
- Modify: `app/src/main/java/com/example/memaid/ui/screens/SettingsScreen.kt`
- Modify: `app/src/main/java/com/example/memaid/MainActivity.kt:214-216`

Remove the Demo Mode toggle Card, the "Backend URL" and "Mode" rows, the "Send Test to Watch" and
"Beacon Debug" buttons, and the `onBeaconDebug` parameter. Keep the "Register Glasses" button (emoji
stripped) and the Logout button. Keep my non-null `getDeviceId(): String` (no `?: "Not set"`).

- [ ] **Step 1: Replace `SettingsScreen.kt` with the trimmed version**

Replace the entire file `app/src/main/java/com/example/memaid/ui/screens/SettingsScreen.kt` with:

```kotlin
package com.example.memaid.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.memaid.ui.MainViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: MainViewModel,
    onBack: () -> Unit,
    onLogout: () -> Unit,
    onRegisterGlasses: () -> Unit
) {
    // Read the REAL current values
    val patientName by viewModel.patientName.collectAsState()
    val deviceId = viewModel.sessionManager.getDeviceId()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Patient Configuration", style = MaterialTheme.typography.titleMedium)

            SettingsRow(label = "Patient Name", value = patientName)
            SettingsRow(label = "Device ID", value = deviceId)
            SettingsRow(label = "Caregiver", value = viewModel.sessionManager.getCaregiverName() ?: "—")

            Spacer(modifier = Modifier.weight(1f))

            OutlinedButton(
                onClick = onRegisterGlasses,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Register Glasses")
            }

            Button(
                onClick = onLogout,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error
                )
            ) {
                Text("Logout", color = MaterialTheme.colorScheme.onError)
            }
        }
    }
}

@Composable
fun SettingsRow(label: String, value: String) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(text = value, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
```

- [ ] **Step 2: Remove the `onBeaconDebug` callback at the call site**

In `app/src/main/java/com/example/memaid/MainActivity.kt`, inside `composable(Screen.Settings.route)`,
delete these three lines from the `SettingsScreen(...)` call (currently around lines 214-216):

```kotlin
                onBeaconDebug = {
                    navController.navigate(Screen.BeaconDebug.route)
                },
```

The call must end up as:

```kotlin
        composable(Screen.Settings.route) {
            SettingsScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onLogout = {
                    viewModel.logout()
                    navController.navigate(Screen.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onRegisterGlasses = {
                    navController.navigate(Screen.GlassesRegister.route)
                }
            )
        }
```

Do **not** touch the `composable(Screen.BeaconDebug.route) { BeaconDebugScreen(...) }` block earlier
in the file — the screen stays registered, just unreachable.

- [ ] **Step 3: Verify it compiles**

Run: `.\gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL. (This proves the dropped `onBeaconDebug` parameter, the removed imports,
and the removed `?: "Not set"`-free `getDeviceId()` all line up.)

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/com/example/memaid/ui/screens/SettingsScreen.kt app/src/main/java/com/example/memaid/MainActivity.kt
git commit -m "Trim Settings screen: remove demo toggle, test-to-watch, and beacon-debug button"
```

---

## Task 3: Compose UI test for the trimmed Settings screen

**Files:**
- Test: `app/src/androidTest/java/com/example/memaid/SettingsScreenTest.kt` (create)

This is an instrumented test — it runs on the user's device/emulator during the app test, not in this
session. It asserts the removed controls are gone and the kept controls remain.

`SettingsScreen` needs a `MainViewModel`. **Before writing the test, open
`app/src/main/java/com/example/memaid/ui/MainViewModel.kt` and check its constructor.** If it can be
constructed in an instrumented test with the `androidx.test` application `Context` (i.e. its
constructor takes only an `Application`/`Context` or has a no-arg/default form), use the real one as
shown below. If it requires collaborators that are impractical to build on-device, **apply the spec
fallback**: skip this test, rely on the Task 1 unit test plus the Task 2 compile check and the
on-device run, and note that in the commit message. Do not invent a fake that duplicates ViewModel
logic.

- [ ] **Step 1: Write the test**

Create `app/src/androidTest/java/com/example/memaid/SettingsScreenTest.kt`:

```kotlin
package com.example.memaid

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.memaid.ui.MainViewModel
import com.example.memaid.ui.screens.SettingsScreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun setSettings() {
        // NOTE: adjust MainViewModel construction to match its real constructor.
        val app = ApplicationProvider.getApplicationContext<android.app.Application>()
        val viewModel = MainViewModel(app)
        composeRule.setContent {
            SettingsScreen(
                viewModel = viewModel,
                onBack = {},
                onLogout = {},
                onRegisterGlasses = {}
            )
        }
    }

    @Test
    fun keptControls_areDisplayed() {
        setSettings()
        composeRule.onNodeWithText("Register Glasses").assertIsDisplayed()
        composeRule.onNodeWithText("Device ID").assertIsDisplayed()
        composeRule.onNodeWithText("Logout").assertIsDisplayed()
    }

    @Test
    fun removedControls_areAbsent() {
        setSettings()
        composeRule.onNodeWithText("Send Test to Watch", substring = true).assertDoesNotExist()
        composeRule.onNodeWithText("Beacon Debug", substring = true).assertDoesNotExist()
        composeRule.onNodeWithText("Demo Mode", substring = true).assertDoesNotExist()
    }
}
```

(`assertDoesNotExist` is on the same `onNodeWithText(...)` finder — import is covered by the
`androidx.compose.ui.test.*` finders already referenced. If the linter flags it, add
`import androidx.compose.ui.test.assertDoesNotExist` — it is part of the compose-ui-test artifact.)

- [ ] **Step 2: Run on device/emulator**

Run (with a device/emulator connected): `.\gradlew :app:connectedDebugAndroidTest --tests "com.example.memaid.SettingsScreenTest"`
Expected: PASS. If it cannot run in this environment, the user runs it during their on-device app test.

- [ ] **Step 3: Commit**

```bash
git add app/src/androidTest/java/com/example/memaid/SettingsScreenTest.kt
git commit -m "Add Compose UI test for trimmed Settings screen"
```

---

## Task 4: Strip emojis from phone UI text

**Files:**
- Modify: `app/src/main/java/com/example/memaid/ui/screens/HomeScreen.kt`
- Modify: `app/src/main/java/com/example/memaid/ui/screens/HelpScreen.kt`
- Modify: `app/src/main/java/com/example/memaid/ui/screens/GlassesRegisterScreen.kt`
- Modify: `app/src/main/java/com/example/memaid/ui/screens/ReminderDetailScreen.kt`
- Modify: `app/src/main/java/com/example/memaid/ui/screens/PatientSelectScreen.kt`

Each edit removes the emoji **and** any leading/trailing space it left behind. Use exact string
replacement (the emoji text is unique on each line).

- [ ] **Step 1: HomeScreen.kt**

Replace `text = "🆘  HELP"` → `text = "HELP"`
Replace `Text("✅ All reminders completed!", fontSize = 16.sp)` → `Text("All reminders completed!", fontSize = 16.sp)`
Replace `ReminderStatus.ACKNOWLEDGED -> "Done ✓"` → `ReminderStatus.ACKNOWLEDGED -> "Done"`

- [ ] **Step 2: HelpScreen.kt**

Replace `text = "🥽 Include glasses vision"` → `text = "Include glasses vision"`
Replace `text = if (sessionActive) "⏹  End AI Session" else "🎙  Talk to AI Assistant"` → `text = if (sessionActive) "End AI Session" else "Talk to AI Assistant"`
Replace `text = "🆘  Call Caregiver"` → `text = "Call Caregiver"`
Replace `text = "✓ Help request sent. Opening WhatsApp..."` → `text = "Help request sent. Opening WhatsApp..."`
Replace `text = "🎙 AI session active — speak now"` → `text = "AI session active — speak now"`

- [ ] **Step 3: GlassesRegisterScreen.kt**

Replace `text = "🥽 Meta Glasses"` → `text = "Meta Glasses"`
Replace `text = if (registered) "✓ Registered" else regState.toString()` → `text = if (registered) "Registered" else regState.toString()`

- [ ] **Step 4: ReminderDetailScreen.kt**

Replace `Text("🔔 Test Notification (fires in 3s)")` → `Text("Test Notification (fires in 3s)")`
Replace `Text("✓  I Did This", fontSize = 20.sp, color = Color.White)` → `Text("I Did This", fontSize = 20.sp, color = Color.White)`
Replace `text = "✅ Acknowledged"` → `text = "Acknowledged"`

- [ ] **Step 5: PatientSelectScreen.kt — replace bare checkmark with a Material icon**

Add this import (alphabetically near the existing `import androidx.compose.material.icons.filled.Person`):

```kotlin
import androidx.compose.material.icons.filled.Check
```

Replace this block:

```kotlin
                Text(
                    text = "✓",
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp
                )
```

with:

```kotlin
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = "Selected",
                    tint = MaterialTheme.colorScheme.primary
                )
```

- [ ] **Step 6: Verify emojis are gone and it compiles**

Run: `git grep -nP "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2190}-\x{21FF}\x{2B00}-\x{2BFF}\x{FE0F}\x{2705}\x{2714}\x{2713}]" -- "app/src/main/java/com/example/memaid/ui/**/*.kt"`
Expected: **no output** (zero matches).

Run: `.\gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add app/src/main/java/com/example/memaid/ui/screens/
git commit -m "Strip emojis from phone UI text"
```

---

## Task 5: Strip emojis from watch UI text

**Files:**
- Modify: `wear/src/main/java/com/example/memaid/wear/presentation/MainActivity.kt`

Only user-visible `Text(...)` strings change. **Leave every `Log.d`/`Log.e` string in this file and
in the other `wear/` files untouched** — those are logcat output, not UI.

- [ ] **Step 1: Replace the visible-text emojis**

Replace `text = "❤️ ${if (heartRate > 0) "$heartRate bpm" else "reading..."}"` → `text = "${if (heartRate > 0) "$heartRate bpm" else "reading..."}"`
Replace `text = "🏃 $motionState"` → `text = "$motionState"`
Replace `text = if (acknowledged) "✓ Done" else "I Did This"` → `text = if (acknowledged) "Done" else "I Did This"`
Replace `text = if (streaming) "⏹ End Session" else "🆘 Help"` → `text = if (streaming) "End Session" else "Help"`
Replace `text = "📞 Call Caregiver"` → `text = "Call Caregiver"`

- [ ] **Step 2: Verify visible-text emojis are gone and it compiles**

Run: `git grep -nP "text = .*[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2190}-\x{21FF}\x{2B00}-\x{2BFF}\x{FE0F}\x{2705}\x{2714}\x{2713}]" -- "wear/src/main/java/**/*.kt"`
Expected: **no output** (the remaining `Log.d`/`Log.e` emoji lines don't start with `text = ` and are intentionally kept).

Run: `.\gradlew :wear:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add wear/src/main/java/com/example/memaid/wear/presentation/MainActivity.kt
git commit -m "Strip emojis from watch UI text"
```

---

## Task 6: Final verification before hardware test

- [ ] **Step 1: Full unit-test + build sweep**

Run: `.\gradlew :app:testDebugUnitTest`
Expected: PASS (includes `ReminderRepositoryDefaultsTest` and the existing `FrameEncoderTest`).

Run: `.\gradlew :app:assembleDebug :wear:assembleDebug`
Expected: BUILD SUCCESSFUL for both modules.

- [ ] **Step 2: Confirm no unintended functional diff**

Run: `git diff --stat glasses-test@{u}..HEAD`
Expected: only the files named in this plan appear (ReminderRepository, SettingsScreen, MainActivity,
the five phone screens, the watch MainActivity, and the two new test files). No audio/data-layer files.

- [ ] **Step 3: Hand off to the user**

The user runs the app on phone + watch to confirm: Settings shows only Register Glasses + Logout (no
demo toggle / test / beacon buttons), the app talks to the live backend, and no emojis appear in any
button or label. The `SettingsScreenTest` instrumented test runs on-device here if not already run.
