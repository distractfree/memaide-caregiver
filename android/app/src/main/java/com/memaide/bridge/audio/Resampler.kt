package com.memaide.bridge.audio

import kotlin.math.floor
import kotlin.math.min

/** Pure linear-interpolation resampler for mono PCM16. Good enough for HFP voice. */
object Resampler {
    fun resample(input: ShortArray, fromRate: Int, toRate: Int): ShortArray {
        if (input.isEmpty() || fromRate == toRate) return input.copyOf()
        val outLen = (input.size.toLong() * toRate / fromRate).toInt()
        if (outLen <= 0) return ShortArray(0)
        val out = ShortArray(outLen)
        val step = fromRate.toDouble() / toRate.toDouble()
        for (i in 0 until outLen) {
            val pos = i * step
            val idx = floor(pos).toInt()
            val frac = pos - idx
            val a = input[min(idx, input.size - 1)].toInt()
            val b = input[min(idx + 1, input.size - 1)].toInt()
            out[i] = (a + (b - a) * frac).toInt().toShort()
        }
        return out
    }
}
