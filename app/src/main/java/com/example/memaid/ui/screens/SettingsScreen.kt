package com.example.memaid.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.memaid.data.FakeDataRepository
import com.example.memaid.data.ReminderRepository
import com.example.memaid.ui.MainViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: MainViewModel,
    onBack: () -> Unit,
    onLogout: () -> Unit,
    onBeaconDebug: () -> Unit
) {
    // Read the REAL current values
    val patientName by viewModel.patientName.collectAsState()
    val deviceId = viewModel.sessionManager.getDeviceId()
    var demoMode by remember { mutableStateOf(ReminderRepository.demoMode) }
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()

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
            SettingsRow(
                label = "Backend URL",
                value = if (demoMode) "Demo (no server)" else "134.122.115.15:4000"
            )
            SettingsRow(
                label = "Mode",
                value = if (demoMode) "Demo / Fake Data" else "Live / Backend"
            )

            // Demo / Live toggle
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
                ) {
                    Column {
                        Text("Demo Mode", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            text = if (demoMode) "Using fake data" else "Using live backend",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = demoMode,
                        onCheckedChange = {
                            demoMode = it
                            ReminderRepository.demoMode = it
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            OutlinedButton(
                onClick = {
                    scope.launch {
                        com.example.memaid.data.PhoneMessenger.sendMessage(
                            context,
                            "/test",
                            "Hello from phone"
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("📤 Send Test to Watch")
            }

            OutlinedButton(
                onClick = onBeaconDebug,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("📡 Beacon Debug")
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