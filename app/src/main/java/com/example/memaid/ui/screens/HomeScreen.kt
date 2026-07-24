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
