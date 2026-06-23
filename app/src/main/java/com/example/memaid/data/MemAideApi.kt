package com.example.memaid.data

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query
import retrofit2.http.Header

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

    @GET("api/mobile/patients")
    suspend fun getPatients(
        @Header("Authorization") token: String
    ): Response<ApiEnvelope<List<ServerPatientItem>>>
}