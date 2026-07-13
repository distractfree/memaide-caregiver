package com.example.memaid.wear.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.tasks.await

data class WatchReminder(
    val reminderId: String,
    val title: String,
    val description: String,
    val timeOfDay: String,
    val status: String
)

// Holds the reminders pushed from the phone. The listener service and the UI are separate
// entry points into the same process, so this has to be shared state rather than something
// the Activity owns.
object ReminderStore {

    const val PATH = "/reminders"

    private val _reminders = MutableStateFlow<List<WatchReminder>>(emptyList())
    val reminders: StateFlow<List<WatchReminder>> = _reminders.asStateFlow()

    private val _patientName = MutableStateFlow("")
    val patientName: StateFlow<String> = _patientName.asStateFlow()

    fun update(dataMap: DataMap) {
        _patientName.value = dataMap.getString("patientName") ?: ""
        _reminders.value = dataMap.getDataMapArrayList("reminders").orEmpty().map { item ->
            WatchReminder(
                reminderId = item.getString("reminderId") ?: "",
                title = item.getString("title") ?: "",
                description = item.getString("description") ?: "",
                timeOfDay = item.getString("timeOfDay") ?: "",
                status = item.getString("status") ?: "PENDING"
            )
        }
        Log.d("ReminderStore", "⌚ Now holding ${_reminders.value.size} reminders")
    }

    // A DataItem is only delivered on change, so a cold-started watch app would show
    // nothing until the phone next pushed. Read whatever is already synced.
    suspend fun loadCached(context: Context) {
        try {
            val items = Wearable.getDataClient(context).dataItems.await()
            items.forEach { item ->
                if (item.uri.path == PATH) {
                    update(DataMapItem.fromDataItem(item).dataMap)
                }
            }
            items.release()
        } catch (e: Exception) {
            Log.e("ReminderStore", "⚠️ Could not read cached reminders: ${e.message}")
        }
    }
}
