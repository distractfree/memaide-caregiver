package com.example.memaid.data

import java.time.LocalTime
import java.time.format.DateTimeFormatter

object FakeDataRepository {


    // Returns a time N minutes from now as "HH:mm" — keeps reminders pending for testing
    private fun minutesFromNow(minutes: Long): String {
        return LocalTime.now()
            .plusMinutes(minutes)
            .format(DateTimeFormatter.ofPattern("HH:mm"))
    }

    const val PATIENT_ID = "p123"
    const val CAREGIVER_WHATSAPP_NUMBER = "11234567890"

    // Your two physical KBeacons, mapped to rooms.
    // Same UUID, distinguished by Minor.
    const val BEACON_UUID = "E2C56DB5-DFFB-48D2-B060-D0F5A71096E0"


    fun getFakeReminders(): List<Reminder> = listOf(
        Reminder(
            reminderId = "r001",
            patientId = PATIENT_ID,
            title = "Afternoon medication",
            description = "Take blood pressure pill with a full glass of water.",
            timeOfDay = minutesFromNow(1),
            frequency = "daily",
            active = true,
            status = ReminderStatus.PENDING
        ),
        Reminder(
            reminderId = "r002",
            patientId = PATIENT_ID,
            title = "Lunch Reminder",
            description = "Have lunch. Try to eat something healthy.",
            timeOfDay = "12:30",
            frequency = "daily",
            active = true,
            status = ReminderStatus.ACKNOWLEDGED
        ),
        Reminder(
            reminderId = "r003",
            patientId = PATIENT_ID,
            title = "Afternoon Walk",
            description = "Take a 10-minute walk outside if weather permits.",
            timeOfDay = "15:00",
            frequency = "daily",
            active = true,
            status = ReminderStatus.PENDING
        ),
        Reminder(
            reminderId = "r004",
            patientId = PATIENT_ID,
            title = "Evening Medication",
            description = "Take cholesterol pill after dinner.",
            timeOfDay = "19:00",
            frequency = "daily",
            active = true,
            status = ReminderStatus.MISSED
        ),
        Reminder(
            reminderId = "r005",
            patientId = PATIENT_ID,
            title = "Hydration Check",
            description = "Drink a glass of water before bed.",
            timeOfDay = "21:00",
            frequency = "daily",
            active = true,
            status = ReminderStatus.PENDING
        )
    )

    fun getFakePatients(): List<Patient> = listOf(
        Patient(patientId = "p123", name = "John Smith", deviceId = null),
        Patient(patientId = "p124", name = "Mary Johnson", deviceId = null),
        Patient(patientId = "p125", name = "Kevin Lee", deviceId = null)
    )
}