package com.memaide.bridge.model

import org.junit.Assert.assertEquals
import org.junit.Test

class ModelsTest {
    @Test fun rawFrame_holds_bytes_and_dims() {
        val f = RawFrame(byteArrayOf(1, 2, 3), 640, 480, PixelFormat.JPEG)
        assertEquals(3, f.bytes.size)
        assertEquals(640, f.width)
        assertEquals(PixelFormat.JPEG, f.format)
    }

    @Test fun sessionState_has_expected_values() {
        assertEquals(4, SessionState.values().size)
    }
}
