package com.example.memaid.data

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.util.Log
import com.example.memaid.video.FrameEncoder
import com.example.memaid.video.GlassesFrameSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

// Runs an AI voice session using the PHONE's own mic and speaker.
// phone mic -> WebSocket -> AI server -> phone speaker.
class PhoneAudioSession(private val context: Context) {

    private val voiceBridge = VoiceBridge()
    private var recorder: AudioRecord? = null
    private var track: AudioTrack? = null
    private var captureJob: Job? = null
    private var framesJob: Job? = null
    private var timeoutJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    @Volatile var isActive = false
        private set

    private val sampleRate = 24000

    // When true, also stream Meta glasses camera frames over the same WebSocket as the audio.
    private var withGlasses = false

    fun start(withGlasses: Boolean = false) {
        if (isActive) return
        this.withGlasses = withGlasses
        isActive = true

        scope.launch {
            val deviceId = SessionManager(context).getDeviceId()
            Log.d("PhoneAudio", "🚀 Starting AI session for deviceId=$deviceId")
            val result = ReminderRepository.startAiSession(deviceId)
            result.fold(
                onSuccess = { session ->
                    Log.d("PhoneAudio", "✅ AI session started: ${session.sessionId}")
                    Log.d("PhoneAudio", "🔗 Connecting to ${session.websocketUrl}")

                    // Set up speaker playback for returning audio
                    initPlayback()
                    voiceBridge.onAudioOut = { pcm ->
                        try {
                            track?.write(pcm, 0, pcm.size)
                        } catch (e: Exception) {
                            Log.e("PhoneAudio", "⚠️ Playback write failed: ${e.message}")
                        }
                    }

                    val helloJson =
                        """{"type":"hello","session_id":"${session.helloMessage.session_id}"}"""
                    voiceBridge.connectWithHello(session.websocketUrl, helloJson)

                    startCapture()
                    if (this@PhoneAudioSession.withGlasses) startGlassesCapture()

                    // 5-minute hard cap (professor's rule)
                    timeoutJob = scope.launch {
                        kotlinx.coroutines.delay(5 * 60 * 1000L)
                        if (isActive) {
                            Log.d("PhoneAudio", "⏱ 5-minute cap reached")
                            stop()
                        }
                    }
                },
                onFailure = { e ->
                    Log.e("PhoneAudio", "⚠️ AI session start failed: ${e.message}")
                    isActive = false
                }
            )
        }
    }

    private fun startCapture() {
        val minBuf = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        val bufferSize = maxOf(minBuf, 3840)

        @Suppress("MissingPermission")
        recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize
        )

        if (recorder?.state != AudioRecord.STATE_INITIALIZED) {
            Log.e("PhoneAudio", "⚠️ AudioRecord failed to init (permission?)")
            return
        }

        captureJob = scope.launch {
            val buf = ByteArray(bufferSize)
            recorder?.startRecording()
            Log.d("PhoneAudio", "🎙 Phone recording at ${sampleRate}Hz")
            var total = 0L
            while (isActive) {
                val n = recorder?.read(buf, 0, buf.size) ?: -1
                if (n > 0) {
                    voiceBridge.sendAudio(buf, n)
                    total += n
                    if (total % 48000 < bufferSize) {
                        Log.d("PhoneAudio", "🎙 Sent ${total / 1024} KB")
                    }
                }
            }
        }
    }

    // Meta glasses camera -> JPEG data-URL -> same WebSocket (server vision pipeline).
    // Requires prior one-time registration (Settings > Register Glasses) and the Wearables
    // CAMERA permission; GlassesFrameSource throws if not registered, which we log and swallow
    // so the voice half of the session keeps running.
    private fun startGlassesCapture() {
        framesJob = scope.launch {
            try {
                Log.d("PhoneAudio", "🕶 Starting glasses frame capture")
                val encoder = FrameEncoder()
                val source = GlassesFrameSource(context)
                encoder.encode(source.frames()).collect { dataUrl ->
                    voiceBridge.sendFrame(dataUrl)
                }
            } catch (e: Exception) {
                Log.e("PhoneAudio", "🕶 Glasses capture ended: ${e.message}")
            }
        }
    }

    private fun initPlayback() {
        val minBuf = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(sampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(maxOf(minBuf, 3840))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        track?.play()
        Log.d("PhoneAudio", "🔊 Phone playback ready")
    }

    fun stop() {
        isActive = false
        timeoutJob?.cancel()
        captureJob?.cancel()
        framesJob?.cancel()
        try {
            recorder?.stop(); recorder?.release()
        } catch (_: Exception) {}
        try {
            track?.stop(); track?.release()
        } catch (_: Exception) {}
        recorder = null
        track = null
        voiceBridge.close()
        Log.d("PhoneAudio", "🛑 Phone session stopped")
    }
}

