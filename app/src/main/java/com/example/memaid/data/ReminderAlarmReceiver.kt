package com.example.memaid.data

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Android calls this when a scheduled reminder alarm fires.
// It pulls the reminder details out of the intent and shows the notification.
class ReminderAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val reminderId = intent.getStringExtra("reminderId") ?: return
        val title = intent.getStringExtra("title") ?: "Reminder"
        val description = intent.getStringExtra("description") ?: ""

        // Make sure the channel exists (in case app was killed)
        ReminderNotifier.createChannel(context)

        // Show the notification
        ReminderNotifier.showReminder(context, reminderId, title, description)

        println("⏰ Alarm fired for reminder: $reminderId")
    }
}