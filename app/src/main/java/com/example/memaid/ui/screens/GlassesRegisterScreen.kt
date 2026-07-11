package com.example.memaid.ui.screens

import android.app.Activity
import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.types.RegistrationState

/**
 * One-time Meta Wearables registration. `Wearables.startRegistration(activity)` hands off to the
 * Meta AI app to link the glasses; the result comes back as a change to [Wearables.registrationState],
 * which we mirror live. Once it reads REGISTERED, the Help screen's "Include glasses vision" toggle
 * can stream frames. Registration is separate from the Android CAMERA + Wearables CAMERA permissions,
 * which are requested lazily on the Help screen when a session actually starts.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GlassesRegisterScreen(onBack: () -> Unit) {
    val context = LocalContext.current

    // Idempotent: safe if GlassesFrameSource or a previous visit already initialized the SDK.
    LaunchedEffect(Unit) {
        runCatching { Wearables.initialize(context.applicationContext) }
            .onFailure { Log.w("GlassesRegister", "Wearables.initialize failed", it) }
    }

    val regState by Wearables.registrationState.collectAsState()
    val registered = regState == RegistrationState.REGISTERED

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Register Glasses") },
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
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "🥽 Meta Glasses",
                style = MaterialTheme.typography.headlineSmall
            )
            Text(
                text = "Link your Meta smart glasses once. This opens the Meta AI app to " +
                    "complete pairing; come back here when it's done.",
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "Registration",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = if (registered) "✓ Registered" else regState.toString(),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }

            Button(
                onClick = {
                    val activity = context as? Activity
                    if (activity == null) {
                        Log.e("GlassesRegister", "No Activity available for startRegistration")
                        return@Button
                    }
                    runCatching { Wearables.startRegistration(activity) }
                        .onFailure { Log.e("GlassesRegister", "startRegistration failed", it) }
                },
                enabled = !registered,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (registered) "Glasses Registered" else "Register Glasses")
            }
        }
    }
}
