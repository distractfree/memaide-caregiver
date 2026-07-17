package com.example.memaid.wear.presentation

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import com.example.memaid.wear.data.ReminderStore
import com.example.memaid.wear.data.WatchSessionStatus
import com.example.memaid.wear.presentation.theme.MemAidTheme
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    lateinit var vitalsSensorManager: VitalsSensorManager

    private val permissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        Log.d("Vitals", "Permissions: $results")
        if (results[android.Manifest.permission.BODY_SENSORS] == true) {
            vitalsSensorManager.startHeartRate()
        } else {
            Log.w("Vitals", "⚠️ BODY_SENSORS denied — motion only, no heart rate")
        }
    }

    private val messageListener = MessageClient.OnMessageReceivedListener { messageEvent ->
        val path = messageEvent.path
        val data = String(messageEvent.data)
        Log.d("WatchDataLayer", "📩 Message received (Activity): path=$path data=$data")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        vitalsSensorManager = VitalsSensorManager(this)
        vitalsSensorManager.startMotion()
        permissionsLauncher.launch(
            arrayOf(
                android.Manifest.permission.BODY_SENSORS,
                android.Manifest.permission.CALL_PHONE,
                android.Manifest.permission.RECORD_AUDIO
            )
        )

        // Every 30 seconds, send the latest vitals to the phone. Send as soon as we have
        // either signal — a watch off the wrist still reports motion, and on an emulator
        // heart rate never arrives at all.
        lifecycleScope.launch {
            while (true) {
                delay(30_000)
                val hr = vitalsSensorManager.heartRate.value
                val motion = vitalsSensorManager.motionState.value
                if (hr > 0 || motion != "unknown") {
                    val payload = "$hr|$motion"
                    Log.d("Vitals", "📤 Sending vitals: $payload")
                    WatchMessenger.sendMessage(this@MainActivity, "/vitals", payload)
                } else {
                    Log.d("Vitals", "⏸ No HR and no motion yet — nothing to send")
                }
            }
        }

        setContent {
            WearApp(vitalsSensorManager)
        }
    }

    override fun onResume() {
        super.onResume()
        Wearable.getMessageClient(this).addListener(messageListener)
    }

    override fun onPause() {
        super.onPause()
        Wearable.getMessageClient(this).removeListener(messageListener)
    }

    override fun onDestroy() {
        super.onDestroy()
        vitalsSensorManager.stop()
    }
}

@Composable
fun WearApp(vitals: VitalsSensorManager) {
    MemAidTheme {
        val context = androidx.compose.ui.platform.LocalContext.current
        val scope = androidx.compose.runtime.rememberCoroutineScope()

        val heartRate by vitals.heartRate.collectAsState()
        val motionState by vitals.motionState.collectAsState()

        val reminders by ReminderStore.reminders.collectAsState()
        val patientName by ReminderStore.patientName.collectAsState()
        val ackedLocally = remember { mutableStateListOf<String>() }
        var helpStatus by remember { mutableStateOf<String?>(null) }

        // A DataItem only fires on change, so pick up whatever already synced.
        LaunchedEffect(Unit) { ReminderStore.loadCached(context) }
        val audioStreamer = remember { AudioStreamer(context) }
        var streaming by remember { mutableStateOf(false) }

        // The phone owns a session already: it sent "/session_busy", so tear our half-started
        // stream down and tell the user rather than leaving a dead "session" on the watch.
        val busySignals by WatchSessionStatus.busySignals.collectAsState()
        LaunchedEffect(busySignals) {
            if (busySignals > 0) {
                Log.d("WatchMain", "busy signal #$busySignals - tearing down stream, showing in-use")
                audioStreamer.stopStream()
                streaming = false
                helpStatus = "In use on phone"
            }
        }

        AppScaffold {
            val listState = rememberTransformingLazyColumnState()

            ScreenScaffold(scrollState = listState) { contentPadding ->
                TransformingLazyColumn(
                    contentPadding = contentPadding,
                    state = listState
                ) {
                    item {
                        ListHeader {
                            Text(text = if (patientName.isBlank()) "MemAide" else patientName)
                        }
                    }

                    // Vitals card
                    item {
                        Card(onClick = { }, modifier = Modifier.fillMaxWidth()) {
                            Text(
                                text = "${if (heartRate > 0) "$heartRate bpm" else "reading..."}",
                                style = MaterialTheme.typography.titleMedium
                            )
                            Text(
                                text = "$motionState",
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        }
                    }

                    if (reminders.isEmpty()) {
                        item {
                            Card(onClick = { }, modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    text = "No reminders yet",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }

                    reminders.forEach { reminder ->
                        item {
                            val done = reminder.status == "ACKNOWLEDGED" ||
                                    ackedLocally.contains(reminder.reminderId)

                            Card(onClick = { }, modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    text = reminder.title,
                                    style = MaterialTheme.typography.titleMedium
                                )
                                Text(
                                    text = reminder.description,
                                    style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.padding(top = 4.dp)
                                )
                                Text(
                                    text = reminder.timeOfDay,
                                    style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.padding(top = 4.dp)
                                )
                                Button(
                                    onClick = {
                                        ackedLocally.add(reminder.reminderId)
                                        scope.launch {
                                            // The phone's listener has no reminder list of
                                            // its own, so send the time it was due too.
                                            WatchMessenger.sendMessage(
                                                context,
                                                "/reminder_ack",
                                                "${reminder.reminderId}|${reminder.timeOfDay}"
                                            )
                                        }
                                    },
                                    enabled = !done,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = 8.dp)
                                ) {
                                    Text(
                                        text = if (done) "Done" else "I Did This",
                                        modifier = Modifier.fillMaxWidth(),
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                        }
                    }

                    // Help button — starts/ends the AI help session (per the HELP sequence diagram)
                    item {
                        Button(
                            onClick = {
                                if (!streaming) {
                                    helpStatus = "Help request sent"
                                    scope.launch {
                                        WatchMessenger.sendMessage(context, "/help", "help_pressed")
                                    }
                                    audioStreamer.startStream()
                                    streaming = true
                                } else {
                                    audioStreamer.stopStream()
                                    streaming = false
                                    helpStatus = "Session ended"
                                }
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.errorContainer,
                                contentColor = MaterialTheme.colorScheme.onErrorContainer
                            ),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = if (streaming) "End Session" else "Help",
                                modifier = Modifier.fillMaxWidth(),
                                textAlign = TextAlign.Center
                            )
                        }
                    }

                    // Call Caregiver button
                    item {
                        Button(
                            onClick = {
                                val number = "+16614370992" // caregiver number
                                val callIntent = android.content.Intent(
                                    android.content.Intent.ACTION_CALL,
                                    android.net.Uri.parse("tel:$number")
                                )
                                try {
                                    context.startActivity(callIntent)
                                } catch (e: SecurityException) {
                                    helpStatus = "Call permission needed"
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "Call Caregiver",
                                modifier = Modifier.fillMaxWidth(),
                                textAlign = TextAlign.Center
                            )
                        }
                    }

                    if (helpStatus != null) {
                        item {
                            Text(
                                text = helpStatus!!,
                                style = MaterialTheme.typography.bodySmall,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}