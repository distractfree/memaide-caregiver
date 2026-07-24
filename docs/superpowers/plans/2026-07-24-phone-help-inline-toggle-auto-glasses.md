# Phone HELP inline toggle + auto glasses vision — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the phone Home `HELP` button toggle the AI voice session inline (no navigation), move Call Caregiver onto Home, and include Meta-glasses vision automatically whenever glasses are connected over Bluetooth — for phone- and watch-started sessions alike.

**Architecture:** A new pure/thin helper `GlassesBluetooth` decides whether glasses are connected by inspecting the phone's bonded+connected Bluetooth devices. Glasses frame capture is extracted into a shared `GlassesCapture` helper used by both `PhoneVoiceSession` (phone path) and `PhoneListenerService` (watch path). `HomeScreen` absorbs the toggle, Call Caregiver, notices, and permission launchers; `HelpScreen` and its route are deleted.

**Tech Stack:** Kotlin, Jetpack Compose (Material3), AndroidX Activity result APIs, Meta Wearables DAT SDK, Gradle (JVM unit tests + androidTest instrumented tests).

Spec: `docs/superpowers/specs/2026-07-24-phone-help-inline-toggle-auto-glasses-design.md`

---

## File Structure

Created:
- `app/src/main/java/com/example/memaid/data/GlassesBluetooth.kt` — Bluetooth glasses detection (pure matchers + device query).
- `app/src/main/java/com/example/memaid/data/GlassesCapture.kt` — shared glasses frame-capture loop.
- `app/src/test/java/com/example/memaid/data/GlassesBluetoothTest.kt` — unit tests for the matchers.
- `app/src/androidTest/java/com/example/memaid/HomeScreenTest.kt` — Compose UI test for Home.

Modified:
- `app/src/main/java/com/example/memaid/data/PhoneVoiceSession.kt` — use `GlassesCapture`.
- `app/src/main/java/com/example/memaid/data/PhoneListenerService.kt` — gated glasses on watch path.
- `app/src/main/java/com/example/memaid/ui/screens/HomeScreen.kt` — inline toggle, Call Caregiver, notices, auto-glasses, permissions.
- `app/src/main/java/com/example/memaid/MainActivity.kt` — drop Help route + `onHelpClick`.
- `app/src/main/java/com/example/memaid/navigation/Screen.kt` — drop `Help` route.

Deleted:
- `app/src/main/java/com/example/memaid/ui/screens/HelpScreen.kt`.

---

## Task 1: GlassesBluetooth detection helper (TDD)

**Files:**
- Create: `app/src/main/java/com/example/memaid/data/GlassesBluetooth.kt`
- Test: `app/src/test/java/com/example/memaid/data/GlassesBluetoothTest.kt`

- [ ] **Step 1: Write the failing test**

`app/src/test/java/com/example/memaid/data/GlassesBluetoothTest.kt`:

```kotlin
package com.example.memaid.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlassesBluetoothTest {

    @Test
    fun isMetaGlasses_matchesRbPrefix() {
        assertTrue(GlassesBluetooth.isMetaGlasses("RB-1A2B"))
        assertTrue(GlassesBluetooth.isMetaGlasses("rb meta"))
    }

    @Test
    fun isMetaGlasses_matchesKnownNames() {
        assertTrue(GlassesBluetooth.isMetaGlasses("Ray-Ban Meta"))
        assertTrue(GlassesBluetooth.isMetaGlasses("meta glasses"))
        assertTrue(GlassesBluetooth.isMetaGlasses("Ray-Ban Stories"))
    }

    @Test
    fun isMetaGlasses_rejectsOthers() {
        assertFalse(GlassesBluetooth.isMetaGlasses("Pixel Buds"))
        assertFalse(GlassesBluetooth.isMetaGlasses("Galaxy Watch"))
        assertFalse(GlassesBluetooth.isMetaGlasses(""))
        assertFalse(GlassesBluetooth.isMetaGlasses(null))
    }

    @Test
    fun shouldCapture_trueWhenAnyMetaConnected() {
        assertTrue(GlassesBluetooth.shouldCapture(listOf("Galaxy Watch", "RB-9Z8Y")))
    }

    @Test
    fun shouldCapture_falseWhenNoneMatchOrEmpty() {
        assertFalse(GlassesBluetooth.shouldCapture(listOf("Galaxy Watch", "Pixel Buds")))
        assertFalse(GlassesBluetooth.shouldCapture(emptyList()))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :app:testDebugUnitTest --tests "com.example.memaid.data.GlassesBluetoothTest"`
Expected: FAIL — `GlassesBluetooth` unresolved reference.

- [ ] **Step 3: Write minimal implementation**

`app/src/main/java/com/example/memaid/data/GlassesBluetooth.kt`:

```kotlin
package com.example.memaid.data

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.util.Log

// Decides whether Meta glasses are currently connected to the *phone* over Bluetooth. Used to
// auto-enable glasses vision for a help session (phone- or watch-started) without a manual
// toggle. The name matchers are pure and unit-tested; connectedDeviceNames() is the thin,
// permission-guarded Android query.
object GlassesBluetooth {

    private const val TAG = "GlassesBluetooth"

    // Ray-Ban Meta glasses expose a default Bluetooth name beginning with "RB". Match that
    // prefix plus other known/alternate names, case-insensitively.
    private val SUBSTRINGS = listOf("ray-ban", "meta", "stories")

    fun isMetaGlasses(name: String?): Boolean {
        val n = name?.trim()?.lowercase() ?: return false
        if (n.isEmpty()) return false
        if (n.startsWith("rb")) return true
        return SUBSTRINGS.any { n.contains(it) }
    }

    fun shouldCapture(connectedNames: List<String>): Boolean =
        connectedNames.any { isMetaGlasses(it) }

    // Names of bonded devices that are *currently connected*. BluetoothDevice.isConnected() is a
    // hidden-but-stable API reached by reflection — the standard way to check connection without a
    // profile-proxy round trip. Needs BLUETOOTH_CONNECT (already requested in MainActivity); any
    // failure (no adapter, denied permission, reflection/SecurityException) -> emptyList.
    fun connectedDeviceNames(context: Context): List<String> {
        return try {
            val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter: BluetoothAdapter = manager?.adapter ?: return emptyList()
            if (!adapter.isEnabled) return emptyList()
            adapter.bondedDevices.orEmpty()
                .filter { device ->
                    try {
                        device.javaClass.getMethod("isConnected").invoke(device) as? Boolean ?: false
                    } catch (e: Exception) {
                        false
                    }
                }
                .mapNotNull { runCatching { it.name }.getOrNull() }
        } catch (e: SecurityException) {
            Log.w(TAG, "BLUETOOTH_CONNECT not granted: ${e.message}")
            emptyList()
        } catch (e: Exception) {
            Log.w(TAG, "Bluetooth query failed: ${e.message}")
            emptyList()
        }
    }

    fun glassesConnected(context: Context): Boolean =
        shouldCapture(connectedDeviceNames(context))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :app:testDebugUnitTest --tests "com.example.memaid.data.GlassesBluetoothTest"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/example/memaid/data/GlassesBluetooth.kt app/src/test/java/com/example/memaid/data/GlassesBluetoothTest.kt
git commit -m "Add GlassesBluetooth: detect connected Meta glasses over Bluetooth"
```

---

## Task 2: Extract shared GlassesCapture helper

Move the glasses frame loop out of `PhoneVoiceSession` so both session paths share one implementation.

**Files:**
- Create: `app/src/main/java/com/example/memaid/data/GlassesCapture.kt`
- Modify: `app/src/main/java/com/example/memaid/data/PhoneVoiceSession.kt`

- [ ] **Step 1: Create GlassesCapture**

`app/src/main/java/com/example/memaid/data/GlassesCapture.kt`:

```kotlin
package com.example.memaid.data

import android.content.Context
import android.util.Log
import com.example.memaid.video.FrameEncoder
import com.example.memaid.video.GlassesFrameSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

// Meta glasses camera -> JPEG data-URL -> the given session WebSocket (server vision pipeline).
// Shared by the phone-local session (PhoneVoiceSession) and the watch session
// (PhoneListenerService). GlassesFrameSource throws if the glasses aren't ready; we log and
// swallow so audio keeps running. Returns the Job so the caller cancels it on teardown.
object GlassesCapture {

    private const val TAG = "GlassesCapture"

    fun start(appCtx: Context, voiceBridge: VoiceBridge, scope: CoroutineScope): Job =
        scope.launch {
            try {
                Log.d(TAG, "starting glasses frame capture")
                val encoder = FrameEncoder()
                val source = GlassesFrameSource(appCtx)
                var frameCount = 0
                encoder.encode(source.frames()).collect { dataUrl ->
                    frameCount++
                    if (frameCount == 1 || frameCount % 30 == 0) {
                        Log.d(
                            TAG,
                            "glasses frame #$frameCount wsConnected=${voiceBridge.isConnected} bytes=${dataUrl.length}"
                        )
                    }
                    voiceBridge.sendFrame(dataUrl)
                }
                Log.w(TAG, "glasses frame flow ended after $frameCount frame(s)")
            } catch (e: Exception) {
                Log.e(TAG, "glasses capture FAILED: ${e.message}", e)
            }
        }
}
```

- [ ] **Step 2: Point PhoneVoiceSession at the shared helper**

In `app/src/main/java/com/example/memaid/data/PhoneVoiceSession.kt`:

Replace the glasses-start line inside `start(...)`:

```kotlin
                    if (withGlasses) startGlassesCapture(appCtx)
```

with:

```kotlin
                    if (withGlasses) framesJob = GlassesCapture.start(appCtx, voiceBridge, scope)
```

Then delete the entire private `startGlassesCapture` function (the `private fun startGlassesCapture(appCtx: Context) { ... }` block) and remove the now-unused imports it required: `com.example.memaid.video.FrameEncoder` and `com.example.memaid.video.GlassesFrameSource`. Leave `framesJob`, `stop()`, and all other members unchanged.

- [ ] **Step 3: Build to verify it compiles**

Run: `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/com/example/memaid/data/GlassesCapture.kt app/src/main/java/com/example/memaid/data/PhoneVoiceSession.kt
git commit -m "Extract shared GlassesCapture used by the phone session"
```

---

## Task 3: Home screen — inline toggle, Call Caregiver, auto-glasses

Rewrite `HomeScreen` to own the help interaction. Replace the whole file.

**Files:**
- Modify (replace): `app/src/main/java/com/example/memaid/ui/screens/HomeScreen.kt`

- [ ] **Step 1: Replace HomeScreen.kt**

`app/src/main/java/com/example/memaid/ui/screens/HomeScreen.kt`:

```kotlin
package com.example.memaid.ui.screens

import android.Manifest
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.memaid.data.GlassesBluetooth
import com.example.memaid.data.PhoneVoiceSession
import com.example.memaid.data.Reminder
import com.example.memaid.data.ReminderStatus
import com.example.memaid.ui.MainViewModel
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.WearablesError
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: MainViewModel,
    onReminderClick: (String) -> Unit,
    onSettingClick: () -> Unit
) {
    val reminders by viewModel.reminders.collectAsState()
    val currentRoom by viewModel.currentRoom.collectAsState()
    val watchConnected by viewModel.watchConnected.collectAsState()
    val patientName by viewModel.patientName.collectAsState()

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // Inline AI voice session (same model as the watch Help button): tap toggles it on/off.
    // Glasses vision is added automatically when Meta glasses are connected over Bluetooth.
    var sessionActive by remember { mutableStateOf(PhoneVoiceSession.isActive) }
    var sessionBusy by remember { mutableStateOf(false) }
    var glassesNotice by remember { mutableStateOf<String?>(null) }
    var useGlasses by remember { mutableStateOf(false) }
    var helpSent by remember { mutableStateOf(false) }

    // Glasses camera access is a Wearables permission (granted via the Meta AI app), separate
    // from Android CAMERA. Requested only when glasses are actually connected.
    val glassesCamPermission = rememberLauncherForActivityResult(
        Wearables.RequestPermissionContract()
    ) { _ ->
        val started = PhoneVoiceSession.start(context, withGlasses = true)
        sessionActive = started
        sessionBusy = !started
    }

    // Android runtime permissions: RECORD_AUDIO always, plus CAMERA when glasses are connected.
    val androidPermissions = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.values.any { !it }) return@rememberLauncherForActivityResult
        if (useGlasses) {
            // The Wearables permission contract calls Wearables.getInstance() synchronously at
            // launch() time, which throws until the SDK is initialized in this process. Init off
            // the main thread first; treat ALREADY_INITIALIZED as success (the instance already
            // exists). On failure, fall back to audio-only instead of crashing.
            scope.launch {
                val initOk = withContext(Dispatchers.IO) {
                    Wearables.initialize(context.applicationContext).fold(
                        { true },
                        { err, _ ->
                            if (err == WearablesError.ALREADY_INITIALIZED) {
                                true
                            } else {
                                Log.e("HomeScreen", "Wearables init failed: ${err.description}")
                                false
                            }
                        }
                    )
                }
                if (initOk) {
                    glassesCamPermission.launch(Permission.CAMERA)
                } else {
                    glassesNotice = "Glasses unavailable — starting audio only."
                    val started = PhoneVoiceSession.start(context, withGlasses = false)
                    sessionActive = started
                    sessionBusy = !started
                }
            }
        } else {
            val started = PhoneVoiceSession.start(context, withGlasses = false)
            sessionActive = started
            sessionBusy = !started
        }
    }

    fun startSession() {
        sessionBusy = false
        glassesNotice = null
        scope.launch {
            useGlasses = withContext(Dispatchers.IO) { GlassesBluetooth.glassesConnected(context) }
            val perms = mutableListOf(Manifest.permission.RECORD_AUDIO)
            if (useGlasses) perms += Manifest.permission.CAMERA
            androidPermissions.launch(perms.toTypedArray())
        }
    }

    // End the session if Home is left while it is active.
    DisposableEffect(Unit) {
        onDispose { if (sessionActive) PhoneVoiceSession.stop() }
    }

    val todayReminders = reminders.filter {
        it.active && (it.status == ReminderStatus.PENDING || it.status == ReminderStatus.MISSED)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("MemAide", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                ),
                actions = {
                    IconButton(onClick = onSettingClick) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Settings"
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(vertical = 16.dp)
        ) {
            item {
                Text(
                    text = "Hello, $patientName",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StatusCard(
                        modifier = Modifier.weight(1f),
                        icon = { Icon(Icons.Default.LocationOn, contentDescription = null) },
                        label = "Current Room",
                        value = currentRoom
                    )
                    StatusCard(
                        modifier = Modifier.weight(1f),
                        icon = { Icon(Icons.Default.Watch, contentDescription = null) },
                        label = "Watch",
                        value = if (watchConnected) "Connected" else "Not Connected",
                        valueColor = if (watchConnected) Color(0xFF2E7D32) else Color(0xFFC62828)
                    )
                }
            }

            // HELP toggles the AI session inline (mirrors the watch Help button).
            item {
                Button(
                    onClick = {
                        if (!sessionActive) {
                            startSession()
                        } else {
                            PhoneVoiceSession.stop()
                            sessionActive = false
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(72.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (sessionActive) Color(0xFF757575) else Color(0xFFD32F2F)
                    )
                ) {
                    Text(
                        text = if (sessionActive) "END SESSION" else "HELP",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }

            // Call Caregiver posts the backend help event (neutral styling to distinguish it
            // from the red HELP toggle).
            item {
                Button(
                    onClick = {
                        viewModel.sendHelpEvent(sourceDevice = "phone")
                        helpSent = true
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(64.dp)
                ) {
                    Text(
                        text = "Call Caregiver",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            if (sessionActive) {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFE3F2FD))) {
                        Text(
                            text = "AI session active — speak now",
                            modifier = Modifier.padding(16.dp),
                            textAlign = TextAlign.Center,
                            color = Color(0xFF1565C0)
                        )
                    }
                }
            }

            if (helpSent) {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E0))) {
                        Text(
                            text = "Help request sent to your caregiver.",
                            modifier = Modifier.padding(16.dp),
                            textAlign = TextAlign.Center,
                            color = Color(0xFFE65100)
                        )
                    }
                }
            }

            if (sessionBusy) {
                item {
                    DismissibleNotice(
                        text = "A session is already in use on the watch.",
                        onDismiss = { sessionBusy = false }
                    )
                }
            }

            glassesNotice?.let { notice ->
                item {
                    DismissibleNotice(text = notice, onDismiss = { glassesNotice = null })
                }
            }

            item {
                Text(
                    text = "Today's Reminders (${todayReminders.size})",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }

            if (todayReminders.isEmpty()) {
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Box(
                            modifier = Modifier
                                .padding(24.dp)
                                .fillMaxWidth(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("All reminders completed!", fontSize = 16.sp)
                        }
                    }
                }
            }

            items(todayReminders) { reminder ->
                ReminderCard(
                    reminder = reminder,
                    onClick = { onReminderClick(reminder.reminderId) }
                )
            }
        }
    }
}

// An orange info card the user can dismiss with an X (e.g. "session in use", "glasses unavailable").
@Composable
private fun DismissibleNotice(text: String, onDismiss: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E0))) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = text,
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 12.dp),
                color = Color(0xFFE65100)
            )
            IconButton(onClick = onDismiss) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Dismiss",
                    tint = Color(0xFFE65100)
                )
            }
        }
    }
}

@Composable
fun StatusCard(
    modifier: Modifier = Modifier,
    icon: @Composable () -> Unit,
    label: String,
    value: String,
    valueColor: Color = MaterialTheme.colorScheme.onSurface
) {
    Card(modifier = modifier) {
        Column(modifier = Modifier.padding(12.dp)) {
            icon()
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = label,
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = value,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = valueColor
            )
        }
    }
}

@Composable
fun ReminderCard(reminder: Reminder, onClick: () -> Unit) {
    val statusColor = when (reminder.status) {
        ReminderStatus.PENDING -> Color(0xFFF57C00)
        ReminderStatus.ACKNOWLEDGED -> Color(0xFF2E7D32)
        ReminderStatus.MISSED -> Color(0xFFC62828)
    }
    val statusLabel = when (reminder.status) {
        ReminderStatus.PENDING -> "Pending"
        ReminderStatus.ACKNOWLEDGED -> "Done"
        ReminderStatus.MISSED -> "Missed"
    }

    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = reminder.title,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 16.sp
                )
                Text(
                    text = reminder.description,
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2
                )
                Text(
                    text = "⏰ ${com.example.memaid.data.TimeUtils.toAmPm(reminder.timeOfDay)}",
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Surface(
                color = statusColor.copy(alpha = 0.15f),
                shape = MaterialTheme.shapes.small
            ) {
                Text(
                    text = statusLabel,
                    color = statusColor,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }
    }
}
```

Note: the `⏰` glyph is preserved from the existing file (this plan does not change reminder styling).

- [ ] **Step 2: Commit**

```bash
git add app/src/main/java/com/example/memaid/ui/screens/HomeScreen.kt
git commit -m "Home: inline HELP session toggle + Call Caregiver + auto glasses"
```

---

## Task 4: Remove HelpScreen route and navigation

**Files:**
- Modify: `app/src/main/java/com/example/memaid/MainActivity.kt`
- Modify: `app/src/main/java/com/example/memaid/navigation/Screen.kt`
- Delete: `app/src/main/java/com/example/memaid/ui/screens/HelpScreen.kt`

- [ ] **Step 1: Update the Home composable call in MainActivity**

In `app/src/main/java/com/example/memaid/MainActivity.kt`, in the `composable(Screen.Home.route)` block, remove the `onHelpClick` lambda so the call reads:

```kotlin
            HomeScreen(
                viewModel = viewModel,
                onReminderClick = { reminderId ->
                    navController.navigate(Screen.ReminderDetail.createRoute(reminderId))
                },
                onSettingClick = {
                    navController.navigate(Screen.Settings.route)
                },
            )
```

- [ ] **Step 2: Delete the Help composable block in MainActivity**

Remove this entire block from the `NavHost`:

```kotlin
        composable(Screen.Help.route) {
            HelpScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() }
            )
        }
```

- [ ] **Step 3: Remove the Help route**

In `app/src/main/java/com/example/memaid/navigation/Screen.kt`, delete the line:

```kotlin
    object Help : Screen("help")
```

- [ ] **Step 4: Delete HelpScreen.kt**

```bash
git rm app/src/main/java/com/example/memaid/ui/screens/HelpScreen.kt
```

- [ ] **Step 5: Build to verify it compiles**

Run: `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL, no unresolved `Screen.Help` / `HelpScreen` references.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/com/example/memaid/MainActivity.kt app/src/main/java/com/example/memaid/navigation/Screen.kt
git commit -m "Remove HelpScreen route; Home owns the help flow now"
```

---

## Task 5: Auto-glasses on the watch-started session

Add gated glasses capture to the watch path, reusing `GlassesCapture` + `GlassesBluetooth`.

**Files:**
- Modify: `app/src/main/java/com/example/memaid/data/PhoneListenerService.kt`

- [ ] **Step 1: Add a frames Job field**

Below `private val voiceBridge = VoiceBridge()` (near line 122), add:

```kotlin
    private var glassesJob: kotlinx.coroutines.Job? = null
```

- [ ] **Step 2: Start glasses capture when the watch session opens**

In `onChannelOpened`, immediately after the `// STEP 1: Start the AI session ...` block's closing brace (after the `channelScope.launch { ... }` that starts the AI session and connects the WS), add:

```kotlin
        // Auto-include glasses vision on the watch-started session too, when Meta glasses are
        // connected to the phone over Bluetooth. GlassesCapture degrades gracefully if the stream
        // can't open, so audio is unaffected.
        if (GlassesBluetooth.glassesConnected(applicationContext)) {
            Log.d("PhoneListener", "glasses connected — attaching vision to watch session")
            glassesJob = GlassesCapture.start(applicationContext, voiceBridge, channelScope)
        }
```

- [ ] **Step 3: Cancel it on channel close**

In `onChannelClosed`, inside the `if (channel.path == "/help_audio_stream")` block, add the cancel alongside the existing release:

```kotlin
        if (channel.path == "/help_audio_stream") {
            glassesJob?.cancel()
            glassesJob = null
            HelpSessionManager.release(HelpSessionManager.Owner.WATCH)
            Log.d("PhoneListener", "Audio channel closed, reason=$closeReason")
        }
```

- [ ] **Step 4: Build to verify it compiles**

Run: `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/example/memaid/data/PhoneListenerService.kt
git commit -m "Attach glasses vision to watch-started sessions when glasses are connected"
```

---

## Task 6: Home screen Compose UI test

Verify the new Home layout: HELP + Call Caregiver present, glasses switch gone.

**Files:**
- Create: `app/src/androidTest/java/com/example/memaid/HomeScreenTest.kt`

- [ ] **Step 1: Write the test**

`app/src/androidTest/java/com/example/memaid/HomeScreenTest.kt`:

```kotlin
package com.example.memaid

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.memaid.ui.MainViewModel
import com.example.memaid.ui.screens.HomeScreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HomeScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun setHome() {
        val app = ApplicationProvider.getApplicationContext<android.app.Application>()
        val viewModel = MainViewModel(app)
        composeRule.setContent {
            HomeScreen(
                viewModel = viewModel,
                onReminderClick = {},
                onSettingClick = {}
            )
        }
    }

    @Test
    fun helpAndCallCaregiver_areDisplayed() {
        setHome()
        composeRule.onNodeWithText("HELP").assertIsDisplayed()
        composeRule.onNodeWithText("Call Caregiver").assertIsDisplayed()
    }

    @Test
    fun glassesVisionSwitch_isAbsent() {
        setHome()
        composeRule.onNodeWithText("Include glasses vision", substring = true).assertDoesNotExist()
    }
}
```

- [ ] **Step 2: Run the test (needs a connected device/emulator)**

Run: `./gradlew :app:connectedDebugAndroidTest --tests "com.example.memaid.HomeScreenTest"`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add app/src/androidTest/java/com/example/memaid/HomeScreenTest.kt
git commit -m "Add Home screen UI test: HELP + Call Caregiver, no glasses switch"
```

---

## Full verification

- Unit tests (JVM, no device):
  `./gradlew :app:testDebugUnitTest`
- Instrumented tests (needs emulator/device):
  `./gradlew :app:connectedDebugAndroidTest`
- Compile check only:
  `./gradlew :app:compileDebugKotlin`

## Self-review notes

- Spec §1 (inline toggle + Call Caregiver + delete HelpScreen/route) → Tasks 3, 4.
- Spec §2 (Bluetooth glasses detection, pure matchers, auto `useGlasses`) → Tasks 1, 3.
- Spec §3 (shared capture into watch path) → Tasks 2, 5.
- Testing (unit matchers + Home UI) → Tasks 1, 6.
- Type consistency: `GlassesBluetooth.glassesConnected` / `shouldCapture` / `isMetaGlasses` and `GlassesCapture.start(appCtx, voiceBridge, scope): Job` used identically across Tasks 2, 3, 5.
