package com.example.memaid.data

import android.content.Intent
import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.SupervisorJob

class PhoneListenerService : WearableListenerService() {

    override fun onMessageReceived(messageEvent: MessageEvent) {
        val path = messageEvent.path
        val data = String(messageEvent.data)
        Log.d("PhoneListener", "📩 From watch: path=$path data=$data")

        when (path) {
            "/help" -> {
                Log.d("PhoneListener", "🆘 Help received from watch — sending to backend")

                // Bring the phone app to the foreground
                val launchIntent = Intent(
                    applicationContext,
                    com.example.memaid.MainActivity::class.java
                ).apply {
                    addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                                Intent.FLAG_ACTIVITY_SINGLE_TOP
                    )
                    putExtra("openHelp", true)
                }
                try {
                    applicationContext.startActivity(launchIntent)
                    Log.d("PhoneListener", "📱 Launched app to foreground")
                } catch (e: Exception) {
                    Log.e("PhoneListener", "⚠️ Could not launch app: ${e.message}")
                }

                // Call the backend help endpoint
                CoroutineScope(Dispatchers.IO).launch {
                    val deviceId = SessionManager(applicationContext).getDeviceId()
                    val whatsapp = "+" + FakeDataRepository.CAREGIVER_WHATSAPP_NUMBER
                    val result = ReminderRepository.sendHelp(deviceId, "watch", whatsapp)
                    result.fold(
                        onSuccess = { Log.d("PhoneListener", "✅ Help event posted to backend") },
                        onFailure = { e -> Log.e("PhoneListener", "⚠️ Help post failed: ${e.message}") }
                    )
                }
            }

            "/vitals" -> {
                // payload format: "HR|motionState" e.g. "72|active"
                val parts = data.split("|")
                val hr = parts.getOrNull(0)?.toIntOrNull() ?: 0
                val motionRaw = parts.getOrNull(1) ?: "unknown"
                // Map old watch values to the backend's enum, pass valid ones through
                val motion = when (motionRaw) {
                    "moving" -> "active"
                    "still" -> "idle"
                    else -> motionRaw
                }
                Log.d("PhoneListener", "❤️ Vitals from watch: HR=$hr motion=$motion")

                CoroutineScope(Dispatchers.IO).launch {
                    val deviceId = SessionManager(applicationContext).getDeviceId()
                    val result = ReminderRepository.sendVitals(deviceId, hr, motion)
                    result.fold(
                        onSuccess = { Log.d("PhoneListener", "✅ Vitals posted to backend") },
                        onFailure = { e -> Log.e("PhoneListener", "⚠️ Vitals post failed: ${e.message}") }
                    )
                }
            }
        }
    }

    private val channelScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val voiceBridge = VoiceBridge()

    override fun onChannelOpened(channel: ChannelClient.Channel) {
        if (channel.path != "/help_audio_stream") return
        Log.d("PhoneListener", "✅ Audio channel opened from node ${channel.nodeId}")

        // Open a reverse channel to send AI audio back to the watch speaker
        val channelClient = Wearable.getChannelClient(this)
        var returnOut: java.io.OutputStream? = null
        channelScope.launch {
            try {
                val returnChannel = Tasks.await(
                    channelClient.openChannel(channel.nodeId, "/help_audio_return")
                )
                returnOut = Tasks.await(channelClient.getOutputStream(returnChannel))
                Log.d("PhoneListener", "🔁 Return channel open to watch")
            } catch (e: Exception) {
                Log.e("PhoneListener", "⚠️ Return channel failed: ${e.message}")
            }
        }

        // Half-duplex gate: the watch's speaker and mic are centimeters apart and its echo
        // canceller can't reliably remove the AI reply — left open, the reply leaks into the mic,
        // gets transcribed as the patient, and spawns reply after reply. So while the AI is
        // speaking we stop forwarding the watch mic upstream (turn-taking; no barge-in).
        // aiSpeakingUntil holds the elapsedRealtime (ms) the current reply finishes playing.
        val aiSpeakingUntil = java.util.concurrent.atomic.AtomicLong(0L)
        val speakingTailMs = 800L // extra guard for channel lag + speaker/room echo decay

        // When audio comes back from the server, push it down the return channel
        voiceBridge.onAudioOut = { pcm ->
            // Extend the mute window BEFORE writing: returnOut.write() blocks for the whole
            // playback (the watch drains the channel at real-time speed), so setting it after
            // would engage the gate ~a full reply too late and the echo would leak in the gap.
            // 24kHz mono PCM16 -> 48000 bytes/sec. Extend from whichever is later: now (reply
            // starting) or the end of audio already queued.
            val playMs = pcm.size * 1000L / 48000L
            val base = maxOf(android.os.SystemClock.elapsedRealtime(), aiSpeakingUntil.get())
            aiSpeakingUntil.set(base + playMs + speakingTailMs)
            try {
                returnOut?.write(pcm)
                returnOut?.flush()
            } catch (e: Exception) {
                Log.e("PhoneListener", "⚠️ Return write failed: ${e.message}")
            }
        }

        // STEP 1: Start the AI session (professor's rule — wait for 200 before opening WS)
        channelScope.launch {
            val deviceId = SessionManager(applicationContext).getDeviceId()
            Log.d("PhoneListener", "🚀 Starting AI session for deviceId=$deviceId")
            val result = ReminderRepository.startAiSession(deviceId)
            result.fold(
                onSuccess = { session ->
                    Log.d("PhoneListener", "✅ AI session started: sessionId=${session.sessionId}")
                    Log.d("PhoneListener", "🔗 Connecting to ${session.websocketUrl}")
                    // STEP 2: Only now open the WebSocket, sending Koko's prebuilt hello
                    // helloMessage is a JSON object — serialize it back to a string
                    val helloJson =
                        """{"type":"${session.helloMessage.type}","session_id":"${session.helloMessage.session_id}"}"""
                    voiceBridge.connectWithHello(session.websocketUrl, helloJson)
                },
                onFailure = { e ->
                    Log.e("PhoneListener", "⚠️ AI session start failed: ${e.message}")
                }
            )
        }

        // STEP 3: Read watch audio and forward to the WebSocket
        channelScope.launch {
            var total = 0L
            var lastLogged = 0L
            try {
                val input = Tasks.await(
                    Wearable.getChannelClient(this@PhoneListenerService).getInputStream(channel)
                )
                val buf = ByteArray(4096)
                val endpointer = SpeechEndpointer()
                var wasGated = false
                input.use { ins ->
                    while (true) {
                        val n = ins.read(buf)
                        if (n < 0) break
                        total += n

                        // While the AI reply is playing on the watch, drop the mic instead of
                        // forwarding it — otherwise the reply echoes back as "patient" speech and
                        // spawns duplicate replies. Reset the endpointer across the gap so silence
                        // during playback (or a stale mid-utterance) can't fire a bogus commit.
                        if (android.os.SystemClock.elapsedRealtime() < aiSpeakingUntil.get()) {
                            if (!wasGated) {
                                endpointer.reset()
                                wasGated = true
                                Log.d("PhoneListener", "🔇 Mic gated while AI speaks")
                            }
                            continue
                        }
                        if (wasGated) {
                            endpointer.reset()
                            wasGated = false
                            Log.d("PhoneListener", "🎙 Mic ungated — listening")
                        }

                        voiceBridge.sendAudio(buf, n)  // no-ops until WS is connected
                        when (endpointer.accept(buf, n)) {
                            Endpoint.AUDIO_END -> voiceBridge.sendAudioEnd()
                            Endpoint.COMMIT -> voiceBridge.sendCommit()
                            Endpoint.NONE -> {}
                        }
                        if (total - lastLogged >= 48_000) {
                            Log.d("PhoneListener", "🎧 Audio ${total / 1024} KB | level=${endpointer.lastLevel} (thr=500) speech=${endpointer.heardSpeech}")
                            lastLogged = total
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e("PhoneListener", "⚠️ Channel read failed: ${e.message}")
            } finally {
                voiceBridge.close()
                Log.d("PhoneListener", "Audio channel ended. Total: ${total / 1024} KB")
            }
        }
    }

    override fun onChannelClosed(
        channel: ChannelClient.Channel,
        closeReason: Int,
        appSpecificErrorCode: Int
    ) {
        if (channel.path == "/help_audio_stream") {
            Log.d("PhoneListener", "Audio channel closed, reason=$closeReason")
        }
    }
}