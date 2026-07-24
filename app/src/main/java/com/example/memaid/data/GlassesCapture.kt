package com.example.memaid.data

import android.content.Context
import android.util.Log
import com.example.memaid.video.FrameEncoder
import com.example.memaid.video.GlassesFrameSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

// Meta glasses camera -> JPEG data-URL -> the given session WebSocket (server vision pipeline).
// Shared by the phone-local session (PhoneVoiceSession) and the watch session
// (PhoneListenerService). GlassesFrameSource throws if the glasses aren't ready; we log and
// swallow so audio keeps running. Returns the Job so the caller cancels it on teardown.
object GlassesCapture {

    private const val TAG = "GlassesCapture"

    fun start(appCtx: Context, voiceBridge: VoiceBridge, scope: CoroutineScope): Job =
        scope.launch {
            try {
                Log.d(TAG, "starting glasses frame capture")
                val encoder = FrameEncoder()
                val source = GlassesFrameSource(appCtx)
                var frameCount = 0
                encoder.encode(source.frames()).collect { dataUrl ->
                    frameCount++
                    if (frameCount == 1 || frameCount % 30 == 0) {
                        Log.d(
                            TAG,
                            "glasses frame #$frameCount wsConnected=${voiceBridge.isConnected} bytes=${dataUrl.length}"
                        )
                    }
                    voiceBridge.sendFrame(dataUrl)
                }
                Log.w(TAG, "glasses frame flow ended after $frameCount frame(s)")
            } catch (e: Exception) {
                Log.e(TAG, "glasses capture FAILED: ${e.message}", e)
            }
        }
}
