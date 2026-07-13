package com.example.memaid.data

import android.content.Context
import android.content.SharedPreferences

class SessionManager(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("memaide_session", Context.MODE_PRIVATE)

    fun saveToken(token: String) {
        prefs.edit().putString("auth_token", token).apply()
    }

    fun getToken(): String? = prefs.getString("auth_token", null)

    fun isLoggedIn(): Boolean = getToken() != null

    fun saveSelectedPatient(patientId: String, patientName: String) {
        prefs.edit()
            .putString("patient_id", patientId)
            .putString("patient_name", patientName)
            .apply()
    }

    fun getPatientId(): String? = prefs.getString("patient_id", null)

    fun getPatientName(): String? = prefs.getString("patient_name", null)

    fun hasSelectedPatient(): Boolean = getPatientId() != null

    fun saveCaregiverName(name: String) {
        prefs.edit().putString("caregiver_name", name).apply()
    }

    fun getCaregiverName(): String? = prefs.getString("caregiver_name", null)

    fun logout() {
        prefs.edit().clear().apply()
    }

    fun clearPatientSelection() {
        prefs.edit()
            .remove("patient_id")
            .remove("patient_name")
            .apply()
    }

    // Save that a specific reminder was acknowledged
    fun markReminderAcknowledged(reminderId: String) {
        val acked = getAcknowledgedIds().toMutableSet()
        acked.add(reminderId)
        prefs.edit().putStringSet("acked_reminders", acked).apply()
    }

    // Get the set of all acknowledged reminder IDs
    fun getAcknowledgedIds(): Set<String> {
        return prefs.getStringSet("acked_reminders", emptySet()) ?: emptySet()
    }

    // Clear all acknowledgments (useful for testing / new day reset)
    fun clearAcknowledgments() {
        prefs.edit().remove("acked_reminders").apply()
    }

    // The backend identifies the patient by deviceId. Null means no patient is selected.
    //
    // This used to fall back to the "wewe" seed device, which meant that after a logout —
    // or before a patient was picked — the app kept posting the patient's vitals under a
    // device that isn't theirs. The backend answers 404 "No patient found for this device",
    // but had that seed row existed, the data would have silently landed on someone else.
    fun getDeviceId(): String? = prefs.getString("device_id", null)

    fun saveDeviceId(deviceId: String) {
        prefs.edit().putString("device_id", deviceId).apply()
    }
}