package com.example.memaid.data

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface MemAideApi {

    // --- Patient login (phone number, no password) ---
    // Returns a token that identifies the patient on every subsequent api/mobile/* call.
    @POST("api/mobile/patient-login")
    suspend fun patientLogin(
        @Body request: PatientLoginRequest
    ): Response<PatientLoginResponse>

    // --- Reminders (patient resolved from the Bearer token; no deviceId) ---
    @GET("api/mobile/reminders")
    suspend fun getReminders(): Response<ApiEnvelope<RemindersData>>

    // --- Reminder events ---
    @POST("api/mobile/reminder-events")
    suspend fun postReminderEvent(
        @Body event: ServerReminderEvent
    ): Response<Unit>

    // --- Help events ---
    @POST("api/mobile/help-events")
    suspend fun postHelpEvent(
        @Body event: ServerHelpEvent
    ): Response<Unit>

    @POST("api/mobile/vital-events")
    suspend fun postVitalEvent(
        @Body event: ServerVitalEvent
    ): Response<Unit>

    @POST("api/mobile/ai-sessions/start")
    suspend fun startAiSession(
        @Body request: AiSessionStartRequest
    ): Response<AiSessionData>
}