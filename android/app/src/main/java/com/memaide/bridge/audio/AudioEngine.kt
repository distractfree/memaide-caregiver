package com.memaide.bridge.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.util.Base64
import android.util.Log
import com.memaide.bridge.ws.Outbound
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Session-long audio bridge over Bluetooth SCO (HFP). The Meta glasses present as a standard
 * Bluetooth headset for audio — the DAT SDK's camera Stream carries no audio — so this is pure
 * Android: `AudioRecord` for the glasses mic, `AudioTrack` for the glasses speaker, with the
 * pure [Resampler] bridging the negotiated SCO rate and the server's 24 kHz.
 *
 * Rates: SCO voice is 16 kHz on current glasses ([SCO_RATE]); the server speaks PCM16 @ [SERVER_RATE].
 * If a device negotiates a different SCO rate, read the actual `AudioRecord` rate and update [SCO_RATE].
 * Requires RECORD_AUDIO + BLUETOOTH_CONNECT (granted by the Activity) and a connected SCO link.
 */
class AudioEngine(private val context: Context) {

    private val audioManager =
        context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    @Volatile private var record: AudioRecord? = null
    @Volatile private var track: AudioTrack? = null
    private val running = AtomicBoolean(false)

    /** Acquire SCO and open both endpoints. Call once per session before [micPcm]/[play]. */
    fun start() {
        if (!running.compareAndSet(false, true)) return
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        @Suppress("DEPRECATION") // startBluetoothSco is the broadly-supported path across our minSdk.
        audioManager.startBluetoothSco()
        @Suppress("DEPRECATION")
        audioManager.isBluetoothScoOn = true

        val inBuf = AudioRecord.getMinBufferSize(
            SCO_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        ).coerceAtLeast(SCO_RATE) // >= ~0.5 s headroom
        record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            SCO_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, inBuf
        ).also { it.startRecording() }

        val outBuf = AudioTrack.getMinBufferSize(
            SCO_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT
        ).coerceAtLeast(SCO_RATE)
        track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(SCO_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .build()
            )
            .setBufferSizeInBytes(outBuf)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
            .also { it.play() }
        Log.i(TAG, "AudioEngine started (SCO ${SCO_RATE}Hz)")
    }

    /**
     * Cold flow of mic audio as base64 PCM16 @ [SERVER_RATE], ready for `Outbound.Audio`. Reads
     * blocking chunks from [AudioRecord]; resamples SCO->server rate; ends when [stop] is called.
     */
    fun micPcm(): Flow<Outbound.Audio> = flow {
        val rec = record ?: error("AudioEngine.start() not called")
        val buf = ShortArray(CHUNK_SAMPLES)
        while (running.get()) {
            val n = rec.read(buf, 0, buf.size)
            if (n <= 0) continue
            val chunk = if (n == buf.size) buf else buf.copyOf(n)
            val up = Resampler.resample(chunk, SCO_RATE, SERVER_RATE)
            emit(Outbound.Audio(Base64.encodeToString(shortsToBytes(up), Base64.NO_WRAP)))
        }
    }

    /** Decode a server `audio_out` payload (base64 PCM16 @ [SERVER_RATE]) and play it on the glasses. */
    fun play(pcmBase64: String) {
        val t = track ?: return
        val serverPcm = bytesToShorts(Base64.decode(pcmBase64, Base64.NO_WRAP))
        val down = Resampler.resample(serverPcm, SERVER_RATE, SCO_RATE)
        t.write(down, 0, down.size)
    }

    /** Release both endpoints and drop SCO. Unblocks any pending [micPcm] read. */
    fun stop() {
        if (!running.compareAndSet(true, false)) return
        runCatching { record?.stop() }
        runCatching { record?.release() }
        record = null
        runCatching { track?.stop() }
        runCatching { track?.release() }
        track = null
        @Suppress("DEPRECATION")
        audioManager.stopBluetoothSco()
        @Suppress("DEPRECATION")
        audioManager.isBluetoothScoOn = false
        audioManager.mode = AudioManager.MODE_NORMAL
        Log.i(TAG, "AudioEngine stopped")
    }

    private fun shortsToBytes(samples: ShortArray): ByteArray {
        val out = ByteArray(samples.size * 2)
        for (i in samples.indices) {
            val s = samples[i].toInt()
            out[i * 2] = (s and 0xFF).toByte()          // little-endian
            out[i * 2 + 1] = ((s shr 8) and 0xFF).toByte()
        }
        return out
    }

    private fun bytesToShorts(bytes: ByteArray): ShortArray {
        val out = ShortArray(bytes.size / 2)
        for (i in out.indices) {
            val lo = bytes[i * 2].toInt() and 0xFF
            val hi = bytes[i * 2 + 1].toInt()
            out[i] = ((hi shl 8) or lo).toShort()
        }
        return out
    }

    companion object {
        private const val TAG = "AudioEngine"
        const val SCO_RATE = 16000     // negotiated Bluetooth SCO voice rate (verify on device)
        const val SERVER_RATE = 24000  // PCM16 rate the MemAide server speaks
        private const val CHUNK_SAMPLES = 320 // 20 ms @ 16 kHz
    }
}
