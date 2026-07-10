package com.example.memaid.data

import kotlin.math.abs

// Energy-based end-of-utterance detector for 16-bit little-endian PCM.
//
// The watch streams audio continuously, but Anthony's server transcribes one utterance at
// a time and only replies when it sees an `audio_end` marker. This detects the pause at
// the end of a spoken turn: once speech has been heard and is then followed by a sustained
// silence (`hangoverMs`), `accept` returns true exactly once so the caller can send
// `audio_end`. Leading/idle silence is ignored so we never mark an empty utterance.
class SpeechEndpointer(
    private val silenceThreshold: Int = 500, // mean abs amplitude below this = silence
    private val hangoverMs: Long = 700,      // silence after speech before ending the turn
    private val sampleRate: Int = 24000,
) {
    private var sawSpeech = false
    private var silentMs = 0L

    // Feed one PCM chunk; returns true at the moment the current utterance ends.
    fun accept(pcm: ByteArray, length: Int): Boolean {
        val level = meanAbsAmplitude(pcm, length)
        val chunkMs = (length / 2) * 1000L / sampleRate // 2 bytes per sample

        if (level >= silenceThreshold) {
            sawSpeech = true
            silentMs = 0
            return false
        }
        if (!sawSpeech) return false // idle/leading silence -> no empty utterance
        silentMs += chunkMs
        if (silentMs >= hangoverMs) {
            sawSpeech = false
            silentMs = 0
            return true
        }
        return false
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
