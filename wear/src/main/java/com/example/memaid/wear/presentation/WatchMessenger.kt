package com.example.memaid.wear.presentation

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await

object WatchMessenger {

    // Send a message to the connected phone
    suspend fun sendMessage(context: Context, path: String, message: String) {
        try {
            val nodeClient = Wearable.getNodeClient(context)
            val messageClient = Wearable.getMessageClient(context)

            val nodes = nodeClient.connectedNodes.await()
            if (nodes.isEmpty()) {
                Log.d("WatchDataLayer", "⚠️ No connected phone nodes")
                return
            }

            for (node in nodes) {
                messageClient.sendMessage(node.id, path, message.toByteArray()).await()
                Log.d("WatchDataLayer", "📤 Sent '$message' to ${node.displayName} on $path")
            }
        } catch (e: Exception) {
            Log.e("WatchDataLayer", "⚠️ Send failed: ${e.message}")
        }
    }
}