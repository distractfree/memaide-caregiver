package com.example.memaid.data

data class Reminder(
    val reminderId: String,
    val patientId: String,
    val title: String,
    val description: String,
    val timeOfDay: String,
    val frequency: String,
    val active: Boolean,
    val status: ReminderStatus = ReminderStatus.PENDING
)

enum class ReminderStatus {
    PENDING,
    ACKNOWLEDGED,
    MISSED
}

data class ReminderAckEvent(
    val patientId: String,
    val reminderId: String,
    val status: String = "acknowledged",
    val acknowledgedAt: String,
    val sourceDevice: String
)

data class HelpEvent(
    val patientId: String,
    val triggeredAt: String,
    val sourceDevice: String,
    val status: String,
    val fallbackMode: String,
    val beaconRoom: String?,
    val activityState: String?
)

data class BeaconConfig(
    val beaconId: String,
    val roomName: String,
    val beaconUuid: String,
    val major: Int,
    val minor: Int,
    val thresholdDistanceM: Double = 3.0,
    val dwellSeconds: Int = 5
)

data class BeaconEvent(
    val patientId: String,
    val beaconId: String,
    val roomName: String,
    val detectedAt: String,
    val estimatedDistanceM: Double,
    val dwellSeconds: Int
)

data class VitalEvent(
    val patientId: String,
    val timestamp: String,
    val heartRateBpm: Int?,
    val motionState: String?,
    val stepsDelta: Int?,
    val imuActivityScore: Double?,
    val beaconRoom: String?,
    val sourceDevice: String = "watch"
)

data class LoginRequest(
    val email: String,
    val password: String
)

data class LoginResponse(
    val token: String,
    val caregiverId: String,
    val name: String
)

data class Patient(
    val patientId: String,
    val name: String,
    val deviceId: String?
)

// Patient configuration loaded from the backend
data class PatientConfig(
    val patientId: String,
    val patientName: String,
    val caregiverWhatsappNumber: String?,
    val backendVersion: String? = null
)

// ---- Server response wrappers ----
// The backend wraps everything in { success, data }

data class ApiEnvelope<T>(
    val success: Boolean,
    val data: T
)

// ---- Login ----
data class LoginData(
    val token: String,
    val caregiver: CaregiverInfo
)

data class CaregiverInfo(
    val id: String,
    val name: String,
    val email: String,
    val createdAt: String?
)

// ---- Reminders (server shape) ----
// The server returns reminders nested under data.reminders,
// alongside a patient object.
data class RemindersData(
    val patient: ServerPatient,
    val reminders: List<ServerReminder>
)

data class ServerPatient(
    val id: String,
    val name: String,
    val deviceId: String
)

// The server's reminder uses different field names than our UI model.
data class ServerReminder(
    val id: String,
    val type: String,
    val description: String,
    val timeOfDay: String,
    val frequency: String,
    val active: Boolean
)

// ---- Event request bodies (server shape) ----

data class ServerReminderEvent(
    val deviceId: String,
    val reminderId: String,
    val status: String,            // scheduled | delivered | acknowledged | missed
    val sourceDevice: String,      // phone | watch | system
    val acknowledgedAt: String? = null
)

data class ServerHelpEvent(
    val deviceId: String,
    val sourceDevice: String,      // phone | watch | system
    val status: String,            // triggered | whatsapp_opened | failed | cancelled
    val triggeredAt: String? = null,
    val whatsappNumber: String? = null
)

// Patient list from GET /api/mobile/patients
data class PatientsData(
    val patients: List<ServerPatientItem>
)

data class ServerPatientItem(
    val id: String,
    val name: String,
    val deviceId: String?
)

data class ServerVitalEvent(
    val deviceId: String,
    val heartRate: Int,
    val motionState: String,
    val sourceDevice: String,
    val timestamp: String
)

data class AiSessionStartRequest(
    val deviceId: String,
    val vitals: String? = null,
    val beacons: List<String> = emptyList()
)


data class HelloMessage(
    val type: String,
    val session_id: String
)

data class AiSessionData(
    val success: Boolean,
    val sessionId: String,
    val websocketUrl: String,
    val helloMessage: HelloMessage
)