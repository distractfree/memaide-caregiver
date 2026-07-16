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
import com.example.memaid.data.ReminderStatus
import com.example.memaid.ui.MainViewModel
import androidx.compose.ui.platform.LocalContext
import com.example.memaid.data.ReminderNotifier
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReminderDetailScreen(
    reminderId: String,
    viewModel: MainViewModel,
    onBack: () -> Unit
) {
    val allReminders by viewModel.reminders.collectAsState()
    val reminder = allReminders.find { it.reminderId == reminderId }
    val context = LocalContext.current
    val scope = rememberCoroutineScope ()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Reminder Details") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        if (reminder == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                Text("Reminder not found.")
            }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = reminder.title,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
            )

            Text(
                text = "⏰ ${com.example.memaid.data.TimeUtils.toAmPm(reminder.timeOfDay)}  •  ${reminder.frequency}",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            HorizontalDivider()

            Card(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = reminder.description,
                    fontSize = 18.sp,
                    modifier = Modifier.padding(16.dp),
                    lineHeight = 26.sp
                )
            }

            val statusColor = when (reminder.status) {
                ReminderStatus.PENDING -> Color(0xFFF57C00)
                ReminderStatus.ACKNOWLEDGED -> Color(0xFF2E7D32)
                ReminderStatus.MISSED -> Color(0xFFC62828)
            }
            Text(
                text = "Status: ${reminder.status.name}",
                color = statusColor,
                fontWeight = FontWeight.SemiBold,
                fontSize = 16.sp
            )

            Spacer(modifier = Modifier.weight(1f))

            // Test notification button (fires in 3 seconds so you can see it)
            OutlinedButton(
                onClick = {
                    scope.launch {
                        kotlinx.coroutines.delay(3000) // wait 3 sec
                        ReminderNotifier.showReminder(
                            context = context,
                            reminderId = reminder.reminderId,
                            title = reminder.title,
                            description = reminder.description
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Test Notification (fires in 3s)")
            }

            Spacer(modifier = Modifier.height(8.dp))

            if (reminder.status != ReminderStatus.ACKNOWLEDGED) {
                Button(
                    onClick = {
                        viewModel.acknowledgeReminder(reminder.reminderId, "phone")
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(60.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF2E7D32)
                    )
                ) {
                    Text("I Did This", fontSize = 20.sp, color = Color.White)
                }
            } else {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFFE8F5E9)
                    )
                ) {
                    Box(
                        modifier = Modifier
                            .padding(16.dp)
                            .fillMaxWidth(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Acknowledged",
                            color = Color(0xFF2E7D32),
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}