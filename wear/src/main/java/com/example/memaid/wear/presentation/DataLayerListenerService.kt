package com.example.memaid.wear.presentation

import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

class DataLayerListenerService : WearableListenerService() {

    override fun onCreate() {
        super.onCreate()
        Log.d("WatchDataLayer", "🟢 Listener service created")
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        val path = messageEvent.path
        val data = String(messageEvent.data)
        Log.d("WatchDataLayer", "📩 Message received: path=$path data=$data")
    }

    override fun onChannelOpened(channel: com.google.android.gms.wearable.ChannelClient.Channel) {
        if (channel.path != "/help_audio_return") return
        Log.d("WatchDataLayer", "🔁 Return audio channel opened")

        val channelClient = com.google.android.gms.wearable.Wearable.getChannelClient(this)
        Thread {
            val sampleRate = 24000
            val minBuf = android.media.AudioTrack.getMinBufferSize(
                sampleRate,
                android.media.AudioFormat.CHANNEL_OUT_MONO,
                android.media.AudioFormat.ENCODING_PCM_16BIT
            )
            // Play the AI reply through the VOICE_COMMUNICATION stream (not MEDIA) so the
            // watch's hardware AEC — which references the voice-comm downlink — can cancel it
            // out of the VOICE_COMMUNICATION mic capture. With USAGE_MEDIA the reply leaks into
            // the mic (echo), the endpointer reads it as speech->silence and fires extra
            // commits, and the patient gets 2-3 piled-up replies. Matches PhoneVoiceSession.
            val track = android.media.AudioTrack.Builder()
                .setAudioAttributes(
                    android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .setAudioFormat(
                    android.media.AudioFormat.Builder()
                        .setSampleRate(sampleRate)
                        .setEncoding(android.media.AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(android.media.AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(maxOf(minBuf, 3840))
                .setTransferMode(android.media.AudioTrack.MODE_STREAM)
                .build()
            track.play()
            Log.d("WatchDataLayer", "🔊 Playing return audio")

            try {
                val input = com.google.android.gms.tasks.Tasks.await(
                    channelClient.getInputStream(channel)
                )
                val buf = ByteArray(4096)
                input.use { ins ->
                    while (true) {
                        val n = ins.read(buf)
                        if (n < 0) break
                        track.write(buf, 0, n)
                    }
                }
            } catch (e: Exception) {
                Log.e("WatchDataLayer", "⚠️ Return playback error: ${e.message}")
            } finally {
                track.stop()
                track.release()
                Log.d("WatchDataLayer", "🔇 Return playback stopped")
            }
        }.start()
    }
}