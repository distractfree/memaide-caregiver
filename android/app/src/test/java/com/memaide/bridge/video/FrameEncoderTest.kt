package com.memaide.bridge.video

import com.memaide.bridge.model.PixelFormat
import com.memaide.bridge.model.RawFrame
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class FrameEncoderTest {
    @Test fun passes_through_jpeg_frames_as_data_urls() = runTest {
        val jpeg = byteArrayOf('A'.code.toByte(), 'B'.code.toByte(), 'C'.code.toByte())
        val source = object : FrameSource {
            override fun frames() = flowOf(RawFrame(jpeg, 2, 2, PixelFormat.JPEG))
        }
        val urls = FrameEncoder(quality = 70).encode(source.frames()).toList()
        assertTrue(urls.single().startsWith("data:image/jpeg;base64,"))
    }
}
