package com.example.memaid.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await

object PhoneMessenger {

    // Send a fire-and-forget message to all connected watch nodes (best for events)
    suspend fun sendMessage(context: Context, path: String, message: String) {
        try {
            val nodeClient = Wearable.getNodeClient(context)
            val messageClient = Wearable.getMessageClient(context)

            val nodes = nodeClient.connectedNodes.await()
            if (nodes.isEmpty()) {
                Log.d("PhoneMessenger", "⚠️ No connected watch nodes found")
                return
            }

            for (node in nodes) {
                messageClient.sendMessage(node.id, path, message.toByteArray()).await()
                Log.d("PhoneMessenger", "📤 Sent '$message' to ${node.displayName} on $path")
            }
        } catch (e: Exception) {
            Log.e("PhoneMessenger", "⚠️ Send failed: ${e.message}")
        }
    }

    // Write a data item that syncs to the watch (kept for reference)
    suspend fun sendData(context: Context, path: String, key: String, value: String) {
        try {
            val dataClient = Wearable.getDataClient(context)
            val request = PutDataMapRequest.create(path).apply {
                dataMap.putString(key, value)
                dataMap.putLong("timestamp", System.currentTimeMillis())
            }.asPutDataRequest().setUrgent()

            dataClient.putDataItem(request).await()
            Log.d("PhoneMessenger", "📤 Data written to $path: $key=$value")
        } catch (e: Exception) {
            Log.e("PhoneMessenger", "⚠️ Data write failed: ${e.message}")
        }
    }
}