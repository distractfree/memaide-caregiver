package com.example.memaid.data

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.time.LocalTime
import java.time.LocalDateTime
import java.time.ZoneId

// Schedules reminders to fire at their configured time using AlarmManager.
object ReminderScheduler {

    // Schedule a single reminder. If its time today has passed, schedule for tomorrow.
    fun schedule(context: Context, reminder: Reminder) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        // Build the intent that the alarm will fire
        val intent = Intent(context, ReminderAlarmReceiver::class.java).apply {
            putExtra("reminderId", reminder.reminderId)
            putExtra("title", reminder.title)
            putExtra("description", reminder.description)
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            reminder.reminderId.hashCode(), // unique per reminder
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Work out the next time this reminder should fire
        val triggerTime = nextTriggerMillis(reminder.timeOfDay) ?: return

        // Set an exact alarm (with fallback if exact alarms aren't permitted)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent
                    )
                } else {
                    // Fallback: inexact alarm (still works, just not to-the-second)
                    alarmManager.set(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
                }
            } else {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent
                )
            }
            println("📅 Scheduled '${reminder.title}' for ${reminder.timeOfDay}")
        } catch (e: SecurityException) {
            println("⚠️ Could not schedule exact alarm: ${e.message}")
        }
    }

    // Schedule all active, pending reminders
    fun scheduleAll(context: Context, reminders: List<Reminder>) {
        reminders
            .filter { it.active && it.status == ReminderStatus.PENDING }
            .forEach { schedule(context, it) }
    }

    // Cancel a scheduled reminder (e.g. after it's acknowledged)
    fun cancel(context: Context, reminderId: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, ReminderAlarmReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            reminderId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pendingIntent)
    }

    // Calculate the next epoch-millis for a given "HH:mm" time.
    // If the time already passed today, returns tomorrow's occurrence.
    private fun nextTriggerMillis(timeOfDay: String): Long? {
        return try {
            val time = LocalTime.parse(timeOfDay)
            val now = LocalDateTime.now()
            var target = now.toLocalDate().atTime(time)

            // If today's time already passed, schedule for tomorrow
            if (target.isBefore(now)) {
                target = target.plusDays(1)
            }

            target.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        } catch (e: Exception) {
            null
        }
    }
}

