package com.example.memaid.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await

// Mirrors the phone's current reminder list onto the watch.
//
// This uses the DataClient rather than the MessageClient on purpose: a DataItem is
// replicated state, so it survives the watch app being closed and is re-delivered when
// the watch reconnects. A message sent while the watch app is dead would just be dropped.
object ReminderSync {

    const val PATH = "/reminders"

    fun push(context: Context, patientName: String, reminders: List<Reminder>) {
        put(
            context,
            patientName,
            reminders.map { reminder ->
                DataMap().apply {
                    putString("reminderId", reminder.reminderId)
                    putString("title", reminder.title)
                    putString("description", reminder.description)
                    putString("timeOfDay", reminder.timeOfDay)
                    putString("status", reminder.status.name)
                }
            }
        )
    }

    // When the watch acknowledges a reminder, PhoneListenerService has no reminder list of
    // its own to re-push, so the DataItem would still say PENDING. The watch only looks
    // acknowledged because of in-memory state — restart it and the patient could tap the
    // same medication again. Edit the acknowledged reminder in place instead.
    suspend fun markAcknowledged(context: Context, reminderId: String) {
        try {
            val buffer = Wearable.getDataClient(context).dataItems.await()
            val dataMap = buffer.firstOrNull { it.uri.path == PATH }
                ?.let { DataMapItem.fromDataItem(it).dataMap }
            buffer.release()
            if (dataMap == null) return

            val updated = dataMap.getDataMapArrayList("reminders").orEmpty().map { entry ->
                if (entry.getString("reminderId") == reminderId) {
                    DataMap().apply {
                        putAll(entry)
                        putString("status", ReminderStatus.ACKNOWLEDGED.name)
                    }
                } else {
                    entry
                }
            }
            put(context, dataMap.getString("patientName").orEmpty(), updated)
        } catch (e: Exception) {
            Log.e("ReminderSync", "⚠️ Could not mark $reminderId done on watch: ${e.message}")
        }
    }

    private fun put(context: Context, patientName: String, reminders: List<DataMap>) {
        val request = PutDataMapRequest.create(PATH).apply {
            dataMap.putString("patientName", patientName)
            dataMap.putDataMapArrayList("reminders", ArrayList(reminders))
        }.asPutDataRequest().setUrgent()

        Wearable.getDataClient(context).putDataItem(request)
            .addOnSuccessListener {
                Log.d("ReminderSync", "⌚ Pushed ${reminders.size} reminders for $patientName")
            }
            .addOnFailureListener { e ->
                Log.e("ReminderSync", "⚠️ Reminder push failed: ${e.message}")
            }
    }
}
