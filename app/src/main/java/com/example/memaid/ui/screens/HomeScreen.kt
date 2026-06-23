package com.example.memaid.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.memaid.data.Reminder
import com.example.memaid.data.ReminderStatus
import com.example.memaid.ui.MainViewModel
import androidx.compose.material.icons.filled.Settings

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: MainViewModel,
    onReminderClick: (String) -> Unit,
    onHelpClick: () -> Unit,
    onSettingClick: () -> Unit
) {
    val reminders by viewModel.reminders.collectAsState()
    val currentRoom by viewModel.currentRoom.collectAsState()
    val watchConnected by viewModel.watchConnected.collectAsState()
    val patientName by viewModel.patientName.collectAsState()

    val todayReminders = reminders.filter {
        it.active && it.status == ReminderStatus.PENDING
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

            item {
                Button(
                    onClick = onHelpClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(72.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFD32F2F)
                    )
                ) {
                    Text(
                        text = "🆘  HELP",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }

            item {
                Text(
                    text = "Today's Pending Reminders (${todayReminders.size})",
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
                            Text("✅ All reminders completed!", fontSize = 16.sp)
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
        ReminderStatus.ACKNOWLEDGED -> "Done ✓"
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