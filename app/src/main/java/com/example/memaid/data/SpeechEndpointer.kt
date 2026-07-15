package com.example.memaid.data

import kotlin.math.abs

// Two-stage end-of-utterance detector for 16-bit little-endian PCM.
//
// One spoken sentence often contains short mid-sentence pauses. A single silence threshold
// splits it into several utterances, each answered separately, so the patient hears 2-3
// near-duplicate replies. Instead we track silence against two thresholds:
//   - after `shortBreakMs` of silence following speech -> AUDIO_END (server prepares a reply)
//   - after `holdOutMs` of silence                     -> COMMIT   (turn is over; speak it)
// Each event fires at most once per silence run; resumed speech resets both. Leading/idle
// silence is ignored so we never mark an empty utterance.
enum class Endpoint { NONE, AUDIO_END, COMMIT }

class SpeechEndpointer(
    private val silenceThreshold: Int = 500, // mean abs amplitude below this = silence
    private val shortBreakMs: Long = 700,    // silence after speech -> AUDIO_END
    private val holdOutMs: Long = 1500,      // longer silence -> COMMIT (turn over)
    private val sampleRate: Int = 24000,
) {
    private var sawSpeech = false
    private var silentMs = 0L
    private var audioEndSent = false
    private var committed = false

    // Diagnostics — the level/state of the most recent accept() call, for logging.
    var lastLevel = 0
        private set
    val heardSpeech get() = sawSpeech

    // Drop all accumulated state so the next chunk starts a fresh utterance. Used to gate the
    // detector while the AI reply plays (half-duplex): we don't want silence accrued during
    // playback — or the tail of the previous turn — to fire a spurious AUDIO_END/COMMIT.
    fun reset() {
        sawSpeech = false
        silentMs = 0
        audioEndSent = false
        committed = false
    }

    // Feed one PCM chunk; returns the boundary event (if any) this chunk triggers.
    fun accept(pcm: ByteArray, length: Int): Endpoint {
        val level = meanAbsAmplitude(pcm, length)
        lastLevel = level
        val chunkMs = (length / 2) * 1000L / sampleRate // 2 bytes per sample

        if (level >= silenceThreshold) {
            sawSpeech = true
            silentMs = 0
            audioEndSent = false
            committed = false
            return Endpoint.NONE
        }
        if (!sawSpeech) return Endpoint.NONE // idle/leading silence -> no empty utterance
        silentMs += chunkMs
        if (!audioEndSent && silentMs >= shortBreakMs) {
            audioEndSent = true
            return Endpoint.AUDIO_END
        }
        if (!committed && silentMs >= holdOutMs) {
            committed = true
            return Endpoint.COMMIT
        }
        return Endpoint.NONE
    }

    private fun meanAbsAmplitude(pcm: ByteArray, length: Int): Int {
        var sum = 0L
        var count = 0
        var i = 0
        while (i + 1 < length) {
            val lo = pcm[i].toInt() and 0xFF
            val hi = pcm[i + 1].toInt()
            val sample = ((hi shl 8) or lo).toShort().toInt() // signed 16-bit LE
            sum += abs(sample)
            count++
            i += 2
        }
        return if (count == 0) 0 else (sum / count).toInt()
    }
}
