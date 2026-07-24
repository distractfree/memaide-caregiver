package com.example.memaid.data

object ReminderRepository {

    // true = fake data, false = real backend
    var demoMode: Boolean = false

    // --- Patient login (phone number, no password) ---
    // Returns the raw login payload: a token (which the caller stores as the Bearer
    // credential) plus the patient id. The patient's display name is NOT in this response —
    // it arrives with the first reminders fetch.
    suspend fun patientLogin(phoneNumber: String): Result<PatientLoginResponse> {
        if (demoMode) {
            return Result.success(
                PatientLoginResponse(
                    success = true,
                    token = "fake_token_12345",
                    patient = PatientLoginInfo(id = FakeDataRepository.PATIENT_ID)
                )
            )
        }
        return try {
            val response = ApiClient.api.patientLogin(PatientLoginRequest(phoneNumber))
            val body = response.body()
            if (response.isSuccessful && body != null && body.success) {
                Result.success(body)
            } else {
                Result.failure(Exception("Login failed: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // --- Send acknowledgment ---
    suspend fun sendAck(
        reminderId: String,
        sourceDevice: String,
        timeOfDay: String
    ): Result<Unit> {
        val event = ServerReminderEvent(
            reminderId = reminderId,
            status = "acknowledged",
            sourceDevice = sourceDevice,
            scheduledAt = TimeUtils.scheduledAtIsoUtc(timeOfDay),
            acknowledgedAt = TimeUtils.nowIsoUtc()
        )
        if (demoMode) {
            println("📤 [DEMO] Would send ack: $event")
            return Result.success(Unit)
        }
        return try {
            println("📤 Sending ack: $event")
            val response = ApiClient.api.postReminderEvent(event)
            if (response.isSuccessful) Result.success(Unit)
            else {
                val errorBody = response.errorBody()?.string()
                println("⚠️ ACK error ${response.code()} body=$errorBody")
                Result.failure(Exception("Server error: ${response.code()} — $errorBody"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // Returns the patient name AND reminders, so the UI can show the real patient.
    // The patient is resolved server-side from the Bearer token — no deviceId is sent.
    suspend fun getRemindersWithPatient(): Result<Pair<String, List<Reminder>>> {
        if (demoMode) {
            return Result.success(Pair("Demo Patient", FakeDataRepository.getFakeReminders()))
        }
        return try {
            val response = ApiClient.api.getReminders()
            if (response.isSuccessful && response.body() != null) {
                val data = response.body()!!.data
                val patientName = data.patient.name
                val mapped = data.reminders.map { sr ->
                    Reminder(
                        reminderId = sr.id,
                        patientId = data.patient.id,
                        title = sr.type.replaceFirstChar { it.uppercase() },
                        description = sr.description,
                        timeOfDay = sr.timeOfDay,
                        frequency = sr.frequency,
                        active = sr.active,
                        status = ReminderStatus.PENDING
                    )
                }
                Result.success(Pair(patientName, mapped))
            } else {
                Result.failure(Exception("Server error: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // --- Send help event ---
    suspend fun sendHelp(sourceDevice: String, whatsappNumber: String?): Result<Unit> {
        val event = ServerHelpEvent(
            sourceDevice = sourceDevice,
            status = "triggered",
            triggeredAt = TimeUtils.nowIsoUtc(),
            whatsappNumber = whatsappNumber
        )
        if (demoMode) {
            println("📤 [DEMO] Would send help: $event")
            return Result.success(Unit)
        }
        return try {
            val response = ApiClient.api.postHelpEvent(event)
            if (response.isSuccessful) Result.success(Unit)
            else {
                val errorBody = response.errorBody()?.string()
                println("⚠️ Help 500 body: $errorBody")
                Result.failure(Exception("Server error: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun sendVitals(heartRate: Int, motionState: String): Result<Unit> {
        val event = ServerVitalEvent(
            heartRate = heartRate.takeIf { it > 0 },
            motionState = motionState,
            sourceDevice = "watch",
            timestamp = TimeUtils.nowIsoUtc()
        )
        if (demoMode) {
            println("📤 [DEMO] Would send vitals: $event")
            return Result.success(Unit)
        }
        return try {
            val response = ApiClient.api.postVitalEvent(event)
            if (response.isSuccessful) Result.success(Unit)
            else {
                val errorBody = response.errorBody()?.string()
                println("⚠️ VITALS error ${response.code()} body=$errorBody")
                Result.failure(Exception("Server error: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // The patient is resolved from the Bearer token, so no deviceId is passed here.
    suspend fun startAiSession(): Result<AiSessionData> {
        return try {
            val response = ApiClient.api.startAiSession(
                AiSessionStartRequest(vitals = null, beacons = emptyList())
            )
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                val errorBody = response.errorBody()?.string()
                println("⚠️ AI session start error ${response.code()} body=$errorBody")
                Result.failure(Exception("Server error: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}