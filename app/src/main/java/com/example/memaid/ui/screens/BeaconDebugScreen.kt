package com.example.memaid.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.memaid.ui.MainViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BeaconDebugScreen(
    viewModel: MainViewModel,
    onBack: () -> Unit
) {
    val detected by viewModel.detectedBeacon.collectAsState()
    val currentRoom by viewModel.currentRoom.collectAsState()

    // Start scanning when this screen opens, stop when it closes
    DisposableEffect(Unit) {
        val started = viewModel.startBeaconScanning()
        onDispose {
            viewModel.stopBeaconScanning()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Beacon Debug") },
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
            // Current room
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text("Current Room", fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Text(
                        currentRoom,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }

            Text("Live Detection", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)

            if (detected == null) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Box(
                        modifier = Modifier.padding(24.dp).fillMaxWidth(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("🔍 Scanning for beacons...\nMake sure Bluetooth and Location are ON.",
                            fontSize = 14.sp)
                    }
                }
            } else {
                val b = detected!!
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        DebugRow("Room", b.roomName)
                        DebugRow("Beacon ID", b.beaconId)
                        DebugRow("Major / Minor", "${b.major} / ${b.minor}")
                        DebugRow("Signal (RSSI)", "${b.rssi} dBm")
                        DebugRow("Est. Distance", "%.1f m".format(b.estimatedDistanceM))
                    }
                }
            }

            Text(
                "Note: BLE only works on a physical device with Bluetooth + Location enabled.",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun DebugRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
        Text(value, fontWeight = FontWeight.Medium, fontSize = 14.sp)
    }
}

