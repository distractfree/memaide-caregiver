package com.example.memaid.data

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

// Captures the phone mic as 24kHz / 16-bit / mono PCM — the same format the watch's
// AudioStreamer and Anthony's STT expect — and hands each chunk to [onPcm]. Used by the
// phone-only voice test path so a live session can run without a Wear device.
//
// The buffer passed to [onPcm] is reused each read, so the callback must consume it
// synchronously (VoiceBridge.sendAudio base64-encodes it immediately, which is fine).
class PhoneMicStreamer(private val onPcm: (ByteArray, Int) -> Unit) {

    @Volatile
    var isStreaming = false
        private set

    private var job: Job? = null

    fun start() {
        if (isStreaming) return
        isStreaming = true
        job = CoroutineScope(Dispatchers.IO).launch {
            val sampleRate = 24000
            val minBuf = AudioRecord.getMinBufferSize(
                sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
            )
            val bufferSize = maxOf(minBuf, 3840) // ~80ms at 24kHz 16-bit mono

            @Suppress("MissingPermission") // RECORD_AUDIO checked before start() is called
            val recorder = AudioRecord(
                MediaRecorder.AudioSource.VOICE_COMMUNICATION, // hardware echo cancellation
                sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize
            )
            if (recorder.state != AudioRecord.STATE_INITIALIZED) {
                Log.e("PhoneMic", "⚠️ AudioRecord init failed (permission? unsupported rate?)")
                isStreaming = false
                return@launch
            }

            val buf = ByteArray(bufferSize)
            try {
                recorder.startRecording()
                Log.d("PhoneMic", "🎙 Recording at ${sampleRate}Hz")
                while (isStreaming) {
                    val n = recorder.read(buf, 0, buf.size)
                    if (n > 0) onPcm(buf, n)
                }
            } catch (e: Exception) {
                Log.e("PhoneMic", "⚠️ mic error: ${e.message}")
            } finally {
                try {
                    recorder.stop()
                    recorder.release()
                } catch (_: Exception) {
                }
                Log.d("PhoneMic", "🎙 Recording stopped")
            }
        }
    }

    fun stop() {
        isStreaming = false
        job = null
    }
}
