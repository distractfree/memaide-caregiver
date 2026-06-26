package com.memaide.bridge.video

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

class DataUrlCodecTest {
    @Test fun wraps_jpeg_bytes_as_data_url() {
        val jpeg = byteArrayOf('A'.code.toByte(), 'B'.code.toByte(), 'C'.code.toByte())
        val url = DataUrlCodec.toJpegDataUrl(jpeg)
        assertTrue(url.startsWith("data:image/jpeg;base64,"))
        val b64 = url.removePrefix("data:image/jpeg;base64,")
        assertEquals("ABC", String(Base64.getDecoder().decode(b64)))
    }
}
