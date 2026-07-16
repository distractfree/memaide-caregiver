package com.example.memaid.data

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface MemAideApi {

    // --- Login (caregiver) ---
    @POST("api/auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<ApiEnvelope<LoginData>>

    // --- Reminders (identified by deviceId, no auth header) ---
    @GET("api/mobile/reminders")
    suspend fun getReminders(
        @Query("deviceId") deviceId: String
    ): Response<ApiEnvelope<RemindersData>>

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

    // Authorization: Bearer <jwt> is attached by ApiClient's auth interceptor.
    @GET("api/mobile/patients")
    suspend fun getPatients(): Response<ApiEnvelope<List<ServerPatientItem>>>

    @POST("api/mobile/ai-sessions/start")
    suspend fun startAiSession(
        @Body request: AiSessionStartRequest
    ): Response<AiSessionData>
}