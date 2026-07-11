package com.example.memaid.video

import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
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

    // 2x2 frame: Y = 4 bytes, one chroma sample per plane. NV21 wants Y then V,U.
    @Test fun i420_to_nv21_interleaves_v_then_u() {
        // I420: [Y0 Y1 Y2 Y3][U0][V0]
        val i420 = byteArrayOf(10, 11, 12, 13, /*U*/ 20, /*V*/ 30)
        val nv21 = FrameEncoder().i420ToNv21(i420, 2, 2)
        assertArrayEquals(byteArrayOf(10, 11, 12, 13, /*V*/ 30, /*U*/ 20), nv21)
    }

    @Test fun nv12_to_nv21_swaps_chroma_pairs() {
        // NV12: [Y0 Y1 Y2 Y3][U0 V0]
        val nv12 = byteArrayOf(10, 11, 12, 13, /*U*/ 20, /*V*/ 30)
        val nv21 = FrameEncoder().nv12ToNv21(nv12, 2, 2)
        assertArrayEquals(byteArrayOf(10, 11, 12, 13, /*V*/ 30, /*U*/ 20), nv21)
    }
}
