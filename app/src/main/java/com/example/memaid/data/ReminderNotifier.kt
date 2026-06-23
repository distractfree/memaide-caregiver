package com.example.memaid.data

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

// Handles creating the notification channel and showing reminder notifications.
object ReminderNotifier {

    const val CHANNEL_ID = "memaide_reminders"
    private const val CHANNEL_NAME = "Reminders"

    // Create the notification channel. Required on Android 8+.
    // Safe to call multiple times — Android ignores duplicates.
    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH // HIGH = makes sound + pops up
            ).apply {
                description = "Medication and activity reminders"
                enableVibration(true)
            }
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    // Show a reminder notification. Tapping it opens the reminder detail screen.
    fun showReminder(
        context: Context,
        reminderId: String,
        title: String,
        description: String
    ) {
        // Build an intent that reopens the app at this reminder
        val intent = Intent(context, Class.forName("com.example.memaid.MainActivity")).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("openReminderId", reminderId)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            reminderId.hashCode(), // unique per reminder
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info) // built-in icon for now
            .setContentTitle(title)
            .setContentText(description)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 500, 250, 500))
            .setAutoCancel(true) // dismiss when tapped
            .setContentIntent(pendingIntent)
            .build()

        // Show it (wrapped in try/catch in case permission isn't granted)
        try {
            NotificationManagerCompat.from(context)
                .notify(reminderId.hashCode(), notification)
        } catch (e: SecurityException) {
            println("⚠️ Notification permission not granted: ${e.message}")
        }
    }
}

