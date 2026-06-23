package com.example.memaid.data

object ReminderRepository {

    // true = fake data, false = real backend
    var demoMode: Boolean = true

    // --- Login ---
    suspend fun login(email: String, password: String): Result<LoginResponse> {
        if (demoMode) {
            return Result.success(
                LoginResponse(
                    token = "fake_token_12345",
                    caregiverId = "c001",
                    name = email.substringBefore("@")
                )
            )
        }
        return try {
            val response = ApiClient.api.login(LoginRequest(email, password))
            if (response.isSuccessful && response.body() != null) {
                val data = response.body()!!.data
                Result.success(
                    LoginResponse(
                        token = data.token,
                        caregiverId = data.caregiver.id,
                        name = data.caregiver.name
                    )
                )
            } else {
                Result.failure(Exception("Login failed: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // --- Get reminders ---
    suspend fun getReminders(deviceId: String): Result<List<Reminder>> {
        if (demoMode) {
            return Result.success(FakeDataRepository.getFakeReminders())
        }
        return try {
            val response = ApiClient.api.getReminders(deviceId)
            if (response.isSuccessful && response.body() != null) {
                val data = response.body()!!.data
                // Translate server reminders into our UI model
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
                Result.success(mapped)
            } else {
                Result.failure(Exception("Server error: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // --- Send acknowledgment ---
    suspend fun sendAck(deviceId: String, reminderId: String, sourceDevice: String): Result<Unit> {
        val event = ServerReminderEvent(
            deviceId = deviceId,
            reminderId = reminderId,
            status = "acknowledged",
            sourceDevice = sourceDevice,
            acknowledgedAt = TimeUtils.nowIsoUtc()
        )
        if (demoMode) {
            println("📤 [DEMO] Would send ack: $event")
            return Result.success(Unit)
        }
        return try {
            val response = ApiClient.api.postReminderEvent(event)
            if (response.isSuccessful) Result.success(Unit)
            else Result.failure(Exception("Server error: ${response.code()}"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // Returns the patient name AND reminders, so the UI can show the real patient.
    suspend fun getRemindersWithPatient(deviceId: String): Result<Pair<String, List<Reminder>>> {
        if (demoMode) {
            return Result.success(Pair("Demo Patient", FakeDataRepository.getFakeReminders()))
        }
        return try {
            val response = ApiClient.api.getReminders(deviceId)
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
    suspend fun sendHelp(deviceId: String, sourceDevice: String, whatsappNumber: String?): Result<Unit> {
        val event = ServerHelpEvent(
            deviceId = deviceId,
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
            else Result.failure(Exception("Server error: ${response.code()}"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // Fetch the logged-in caregiver's patients
    suspend fun getPatients(token: String): Result<List<Patient>> {
        if (demoMode) {
            return Result.success(FakeDataRepository.getFakePatients())
        }
        return try {
            val response = ApiClient.api.getPatients("Bearer $token")
            if (response.isSuccessful && response.body() != null) {
                val list = response.body()!!.data.map { p ->
                    Patient(
                        patientId = p.id,
                        name = p.name,
                        deviceId = p.deviceId   // the key field!
                    )
                }
                Result.success(list)
            } else {
                Result.failure(Exception("Server error: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}