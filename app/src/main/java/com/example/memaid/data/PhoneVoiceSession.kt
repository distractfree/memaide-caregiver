package com.example.memaid.data

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

// Phone-only voice test session: starts an AI session via the backend (same call the watch
// path uses), opens the WebSocket with Koko's hello, streams the phone mic up, and plays the
// AI's audio_out back through the phone speaker. Lets us exercise the full audio round-trip
// without a Wear device.
//
// NOTE: speaker playback can feed back into the mic (echo) despite VOICE_COMMUNICATION's AEC —
// use headphones for a clean test. Test-path convenience, not a production capture mode.
object PhoneVoiceSession {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val voiceBridge = VoiceBridge()
    private var mic: PhoneMicStreamer? = null
    private var track: AudioTrack? = null
    private var framesJob: Job? = null
    private var appContext: Context? = null

    @Volatile
    var isActive = false
        private set

    // Returns true if the phone session is now running, false if the watch already owns a
    // session (in which case nothing starts and the caller should show "in use").
    fun start(context: Context, withGlasses: Boolean = false): Boolean {
        if (isActive) return true
        if (!HelpSessionManager.tryAcquire(HelpSessionManager.Owner.PHONE)) {
            Log.w("PhoneVoice", "⚠️ watch session active — phone session refused")
            return false
        }
        isActive = true
        val appCtx = context.applicationContext
        appContext = appCtx

        // When glasses are connected, keep the AI reply on the phone speaker rather than letting
        // the platform route voice audio to the glasses over Bluetooth.
        if (withGlasses) GlassesAudioRoute.routeToPhoneSpeaker(appCtx)

        // Play AI audio_out (24kHz mono PCM16) through the phone speaker.
        val sampleRate = 24000
        val minOut = AudioTrack.getMinBufferSize(
            sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        val t = AudioTrack(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
            AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .build(),
            maxOf(minOut, 3840),
            AudioTrack.MODE_STREAM,
            AudioManager.AUDIO_SESSION_ID_GENERATE
        )
        t.play()
        track = t
        voiceBridge.onAudioOut = { pcm ->
            try {
                t.write(pcm, 0, pcm.size)
            } catch (e: Exception) {
                Log.e("PhoneVoice", "⚠️ playback failed: ${e.message}")
            }
        }

        scope.launch {
            val deviceId = SessionManager(appCtx).getDeviceId()
            if (deviceId == null) {
                Log.e("PhoneVoice", "⚠️ no deviceId set; cannot start AI session")
                return@launch
            }
            Log.d("PhoneVoice", "🚀 starting AI session for deviceId=$deviceId")
            ReminderRepository.startAiSession(deviceId).fold(
                onSuccess = { session ->
                    Log.d("PhoneVoice", "✅ session ${session.sessionId} -> ${session.websocketUrl}")
                    val helloJson =
                        """{"type":"${session.helloMessage.type}","session_id":"${session.helloMessage.session_id}"}"""
                    voiceBridge.connectWithHello(session.websocketUrl, helloJson)

                    if (withGlasses) framesJob = GlassesCapture.start(appCtx, voiceBridge, scope)

                    val endpointer = SpeechEndpointer()
                    mic = PhoneMicStreamer { buf, n ->
                        voiceBridge.sendAudio(buf, n)                 // no-ops until WS connects
                        when (endpointer.accept(buf, n)) {
                            Endpoint.AUDIO_END -> voiceBridge.sendAudioEnd()
                            Endpoint.COMMIT -> voiceBridge.sendCommit()
                            Endpoint.NONE -> {}
                        }
                    }.also { it.start() }
                },
                onFailure = { e ->
                    Log.e("PhoneVoice", "⚠️ session start failed: ${e.message}")
                    stop()
                }
            )
        }
        return true
    }

    fun stop() {
        isActive = false
        framesJob?.cancel()
        framesJob = null
        mic?.stop()
        mic = null
        voiceBridge.close()
        try {
            track?.stop()
            track?.release()
        } catch (_: Exception) {
        }
        track = null
        appContext?.let { GlassesAudioRoute.clear(it) }
        appContext = null
        HelpSessionManager.release(HelpSessionManager.Owner.PHONE)
        Log.d("PhoneVoice", "⏹ session stopped")
    }
}
