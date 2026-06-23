package com.example.memaid.data

import java.time.Instant
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale

object TimeUtils {

    // Converts "15:00" or "08:00" into "3 PM" / "8 AM"
    // If the minutes aren't :00, it shows them too: "15:30" -> "3:30 PM"
    fun toAmPm(timeOfDay: String): String {
        return try {
            val time = LocalTime.parse(timeOfDay) // expects "HH:mm"
            val hour24 = time.hour
            val minute = time.minute

            val amPm = if (hour24 < 12) "AM" else "PM"
            // Convert 24-hour to 12-hour: 0 -> 12, 13 -> 1, etc.
            val hour12 = when (hour24 % 12) {
                0 -> 12
                else -> hour24 % 12
            }

            if (minute == 0) {
                "$hour12 $amPm"          // "3 PM"
            } else {
                String.format(Locale.US, "%d:%02d %s", hour12, minute, amPm) // "3:30 PM"
            }
        } catch (e: Exception) {
            timeOfDay // if parsing fails, just show the original
        }
    }

    // Produces a backend-ready UTC timestamp like "2026-06-10T08:03:00Z"
    fun nowIsoUtc(): String {
        return DateTimeFormatter.ISO_INSTANT.format(Instant.now())
    }

    // Returns true if the reminder's time has passed by more than `graceMinutes`.
    // Used to decide if a pending reminder should be marked "missed".
    fun isPastWithGrace(timeOfDay: String, graceMinutes: Long = 5): Boolean {
        return try {
            val reminderTime = LocalTime.parse(timeOfDay)
            val cutoff = reminderTime.plusMinutes(graceMinutes)
            LocalTime.now().isAfter(cutoff)
        } catch (e: Exception) {
            false
        }
    }
}

