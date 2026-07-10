package com.example.memaid.wear.presentation

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.io.OutputStream

// Streams live mic audio from the watch to the phone over a ChannelClient channel.
// 24kHz 16-bit mono PCM — matches Anthony's OpenAI pipeline.
class AudioStreamer(private val context: Context) {

    private val channelClient = Wearable.getChannelClient(context)
    private var activeChannel: ChannelClient.Channel? = null
    private var outputStream: OutputStream? = null

    @Volatile
    var isStreaming = false
        private set

    fun startStream() {
        if (isStreaming) return
        isStreaming = true

        CoroutineScope(Dispatchers.IO).launch {
            var recorder: AudioRecord? = null
            try {
                // Find the paired phone
                val nodes = Wearable.getNodeClient(context).connectedNodes.await()
                val phoneNode = nodes.firstOrNull()
                if (phoneNode == null) {
                    Log.e("AudioStream", "⚠️ No connected phone node")
                    isStreaming = false
                    return@launch
                }

                Log.d("AudioStream", "📡 Opening channel to ${phoneNode.displayName}")
                activeChannel = channelClient
                    .openChannel(phoneNode.id, "/help_audio_stream")
                    .await()
                outputStream = channelClient
                    .getOutputStream(activeChannel!!)
                    .await()

                Log.d("AudioStream", "✅ Channel open — starting mic capture")

                // --- AudioRecord setup: 24kHz, 16-bit, mono ---
                val sampleRate = 24000
                val minBuf = AudioRecord.getMinBufferSize(
                    sampleRate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT
                )
                val bufferSize = maxOf(minBuf, 3840) // ~80ms at 24kHz 16-bit mono

                @Suppress("MissingPermission")
                recorder = AudioRecord(
                    MediaRecorder.AudioSource.VOICE_COMMUNICATION, // hardware echo cancellation
                    sampleRate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize
                )

                if (recorder.state != AudioRecord.STATE_INITIALIZED) {
                    Log.e("AudioStream", "⚠️ AudioRecord failed to initialize (permission? unsupported rate?)")
                    isStreaming = false
                    return@launch
                }

                val audioBuffer = ByteArray(bufferSize)
                recorder.startRecording()
                Log.d("AudioStream", "🎙 Recording at ${sampleRate}Hz")

                var totalSent = 0L
                while (isStreaming) {
                    val read = recorder.read(audioBuffer, 0, audioBuffer.size)
                    if (read > 0) {
                        outputStream?.write(audioBuffer, 0, read)
                        outputStream?.flush()
                        totalSent += read
                        if (totalSent % 48000 < bufferSize) {
                            Log.d("AudioStream", "🎙 Sent ${totalSent / 1024} KB of audio")
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e("AudioStream", "⚠️ Stream error: ${e.message}")
            } finally {
                try {
                    recorder?.stop()
                    recorder?.release()
                    Log.d("AudioStream", "🎙 Recording stopped")
                } catch (e: Exception) {
                    // ignore
                }
                closeChannel()
            }
        }
    }

    fun stopStream() {
        isStreaming = false
    }

    private fun closeChannel() {
        try {
            outputStream?.close()
            activeChannel?.let { channelClient.close(it) }
            Log.d("AudioStream", "📡 Channel closed")
        } catch (e: Exception) {
            // ignore
        }
        outputStream = null
        activeChannel = null
    }
}