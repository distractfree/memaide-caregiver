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

// Patient login: phone number only, no password. The token returned here identifies the
// patient on every api/mobile/* call, so nothing downstream sends a deviceId anymore.
// Phone must include the leading "+" and country code (e.g. "+11234567890").
data class PatientLoginRequest(
    val phoneNumber: String
)

// Response shape (per Koko): { success, token, patient: { id } }.
// Note the token is top-level (not nested under "data"), and the patient carries only an
// id — the human-readable name arrives later from GET api/mobile/reminders.
data class PatientLoginResponse(
    val success: Boolean,
    val token: String,
    val patient: PatientLoginInfo
)

data class PatientLoginInfo(
    val id: String
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
    // The patient is now resolved from the Bearer token; deviceId is no longer required
    // and may be absent from the response, so keep it optional.
    val deviceId: String? = null
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

// The patient is resolved from the Bearer token, so these event bodies no longer carry a
// deviceId (per Koko: "use the token for all mobile API calls; do not send deviceId").
data class ServerReminderEvent(
    val reminderId: String,
    val status: String,            // scheduled | delivered | acknowledged | missed
    val sourceDevice: String,      // phone | watch | system
    val scheduledAt: String,       // when the reminder was due — required by the backend
    val acknowledgedAt: String? = null
)

data class ServerHelpEvent(
    val sourceDevice: String,      // phone | watch | system
    val status: String,            // triggered | whatsapp_opened | failed | cancelled
    val triggeredAt: String? = null,
    val whatsappNumber: String? = null
)

data class ServerVitalEvent(
    val heartRate: Int?,           // omitted when the watch has no reading
    val motionState: String,
    val sourceDevice: String,
    val timestamp: String
)

data class AiSessionStartRequest(
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