package com.memaide.bridge.video

import com.memaide.bridge.model.PixelFormat
import com.memaide.bridge.model.RawFrame
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class FrameSourceTest {
    @Test fun stub_emits_all_frames() = runTest {
        val frames = listOf(
            RawFrame(byteArrayOf(1), 1, 1, PixelFormat.JPEG),
            RawFrame(byteArrayOf(2), 1, 1, PixelFormat.JPEG),
        )
        val out = StubFrameSource(frames).frames().toList()
        assertEquals(2, out.size)
        assertEquals(2, out[1].bytes[0].toInt())
    }
}
