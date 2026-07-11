package com.example.memaid.ui.screens

import android.Manifest
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import com.example.memaid.data.FakeDataRepository
import com.example.memaid.data.PhoneAudioSession
import com.example.memaid.ui.MainViewModel
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.types.Permission

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HelpScreen(
    viewModel: MainViewModel,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    var helpSent by remember { mutableStateOf(false) }

    // AI voice session (phone mic + speaker; optionally Meta glasses camera frames)
    val phoneSession = remember { PhoneAudioSession(context) }
    var sessionActive by remember { mutableStateOf(false) }
    var useGlasses by remember { mutableStateOf(false) }

    // Glasses camera access is a *Wearables* permission (granted via the Meta AI app), separate
    // from Android's CAMERA permission. Requested last, after the Android permissions below.
    val glassesCamPermission = rememberLauncherForActivityResult(
        Wearables.RequestPermissionContract()
    ) { _ ->
        // Start regardless of the exact result: GlassesFrameSource fails gracefully (logged,
        // audio keeps running) if access was actually denied.
        phoneSession.start(withGlasses = true)
        sessionActive = true
    }

    // Android runtime permissions: RECORD_AUDIO always, plus CAMERA when glasses are enabled.
    val androidPermissions = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.values.any { !it }) return@rememberLauncherForActivityResult
        if (useGlasses) {
            glassesCamPermission.launch(Permission.CAMERA)
        } else {
            phoneSession.start(withGlasses = false)
            sessionActive = true
        }
    }

    fun startSession() {
        val perms = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (useGlasses) perms += Manifest.permission.CAMERA
        androidPermissions.launch(perms.toTypedArray())
    }

    // Stop the session if the screen is left
    DisposableEffect(Unit) {
        onDispose {
            if (sessionActive) phoneSession.stop()
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
                    text = "🥽 Include glasses vision",
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
                        phoneSession.stop()
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
                    text = if (sessionActive) "⏹  End AI Session" else "🎙  Talk to AI Assistant",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Caregiver / WhatsApp button (existing feature)
            Button(
                onClick = {
                    viewModel.sendHelpEvent(sourceDevice = "phone")
                    val number = FakeDataRepository.CAREGIVER_WHATSAPP_NUMBER
                    val uri = Uri.parse("https://wa.me/$number")
                    val intent = Intent(Intent.ACTION_VIEW, uri)
                    context.startActivity(intent)
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
                    text = "🆘  Call Caregiver",
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
                        text = "✓ Help request sent. Opening WhatsApp...",
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
                        text = "🎙 AI session active — speak now",
                        modifier = Modifier.padding(16.dp),
                        textAlign = TextAlign.Center,
                        color = Color(0xFF1565C0)
                    )
                }
            }
        }
    }
}