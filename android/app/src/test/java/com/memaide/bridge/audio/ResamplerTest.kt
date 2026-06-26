package com.memaide.bridge.audio

import org.junit.Assert.assertEquals
import org.junit.Test

class ResamplerTest {
    @Test fun upsample_16k_to_24k_lengthens_by_ratio() {
        val input = shortArrayOf(0, 100, 200, 300)
        val out = Resampler.resample(input, fromRate = 16000, toRate = 24000)
        assertEquals(6, out.size)
        assertEquals(0, out[0].toInt())
    }

    @Test fun downsample_24k_to_16k_shortens_by_ratio() {
        val input = ShortArray(6) { (it * 100).toShort() }
        val out = Resampler.resample(input, fromRate = 24000, toRate = 16000)
        assertEquals(4, out.size)
    }

    @Test fun same_rate_is_identity() {
        val input = shortArrayOf(1, 2, 3)
        val out = Resampler.resample(input, fromRate = 24000, toRate = 24000)
        assertEquals(listOf<Short>(1, 2, 3), out.toList())
    }

    @Test fun empty_input_returns_empty() {
        assertEquals(0, Resampler.resample(ShortArray(0), 16000, 24000).size)
    }
}
