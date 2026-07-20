package com.example.memaid.ui.screens

import android.Manifest
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
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
import com.example.memaid.data.PhoneVoiceSession
import com.example.memaid.ui.MainViewModel
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.WearablesError

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HelpScreen(
    viewModel: MainViewModel,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    var helpSent by remember { mutableStateOf(false) }

    // Phone-mic AI voice session (endpointer sends audio_end + commit for one coherent reply
    // per turn); optionally also streams Meta glasses camera frames into the same session.
    var sessionActive by remember { mutableStateOf(PhoneVoiceSession.isActive) }
    var sessionBusy by remember { mutableStateOf(false) }
    var glassesNotice by remember { mutableStateOf<String?>(null) }
    var useGlasses by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // Glasses camera access is a *Wearables* permission (granted via the Meta AI app), separate
    // from Android's CAMERA permission. Requested last, after the Android permissions below.
    val glassesCamPermission = rememberLauncherForActivityResult(
        Wearables.RequestPermissionContract()
    ) { _ ->
        // Start regardless of the exact result: GlassesFrameSource fails gracefully (logged,
        // audio keeps running) if access was actually denied.
        val started = PhoneVoiceSession.start(context, withGlasses = true)
        sessionActive = started
        sessionBusy = !started
    }

    // Android runtime permissions: RECORD_AUDIO always, plus CAMERA when glasses are enabled.
    val androidPermissions = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.values.any { !it }) return@rememberLauncherForActivityResult
        if (useGlasses) {
            // The Wearables permission contract calls Wearables.getInstance() synchronously at
            // launch() time, which throws (and crashes on the main thread) until the SDK has been
            // initialized in this process. Registration state persists across launches, but the
            // SDK instance does not — so initialize here (off the main thread; it does a native
            // handshake) before launching the glasses permission. If init fails, fall back to an
            // audio-only session instead of crashing.
            scope.launch {
                val initOk = withContext(Dispatchers.IO) {
                    // The SDK is a process singleton: initialize() succeeds only on the first call
                    // and returns ALREADY_INITIALIZED (a *failure*) on every call after that. We
                    // only need the instance to exist before launching the permission contract
                    // (which calls getInstance() synchronously), so an already-initialized SDK is
                    // success for us. Treating it as failure is what made glasses report
                    // "unavailable" on every session after the first.
                    Wearables.initialize(context.applicationContext).fold(
                        { true },
                        { err, _ ->
                            if (err == WearablesError.ALREADY_INITIALIZED) {
                                true
                            } else {
                                Log.e("HelpScreen", "Wearables init failed: ${err.description}")
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
        val perms = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (useGlasses) perms += Manifest.permission.CAMERA
        androidPermissions.launch(perms.toTypedArray())
    }

    // Stop the session if the screen is left
    DisposableEffect(Unit) {
        onDispose {
            if (sessionActive) PhoneVoiceSession.stop()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Help") },
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
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = "Need Help?",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Talk to your AI assistant, or contact your caregiver.",
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Toggle: also stream Meta glasses camera into the session (needs one-time
            // registration in Settings > Register Glasses). Locked while a session is active.
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Include glasses vision",
                    fontSize = 16.sp
                )
                Switch(
                    checked = useGlasses,
                    onCheckedChange = { useGlasses = it },
                    enabled = !sessionActive
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // AI voice session button
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
                    .height(64.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (sessionActive) Color(0xFF757575) else Color(0xFF1976D2)
                )
            ) {
                Text(
                    text = if (sessionActive) "End AI Session" else "Talk to AI Assistant",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Notify the caregiver via the backend help event (no WhatsApp hand-off).
            Button(
                onClick = {
                    viewModel.sendHelpEvent(sourceDevice = "phone")
                    helpSent = true
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFD32F2F)
                )
            ) {
                Text(
                    text = "Call Caregiver",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            if (helpSent) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFFFFF3E0)
                    )
                ) {
                    Text(
                        text = "Help request sent to your caregiver.",
                        modifier = Modifier.padding(16.dp),
                        textAlign = TextAlign.Center,
                        color = Color(0xFFE65100)
                    )
                }
            }

            if (sessionActive) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFFE3F2FD)
                    )
                ) {
                    Text(
                        text = "AI session active — speak now",
                        modifier = Modifier.padding(16.dp),
                        textAlign = TextAlign.Center,
                        color = Color(0xFF1565C0)
                    )
                }
            }

            if (sessionBusy) {
                DismissibleNotice(
                    text = "A session is already in use on the watch.",
                    onDismiss = { sessionBusy = false }
                )
            }

            glassesNotice?.let { notice ->
                DismissibleNotice(
                    text = notice,
                    onDismiss = { glassesNotice = null }
                )
            }
        }
    }
}

// An orange info card the user can dismiss with an X (e.g. "session in use", "glasses unavailable").
@Composable
private fun DismissibleNotice(text: String, onDismiss: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E0))
    ) {
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
