package com.example.memaid.video

import android.util.Base64 as AndroidBase64

/** Pure: wraps JPEG bytes as a `data:image/jpeg;base64,...` URL the server expects. */
object DataUrlCodec {
    private const val PREFIX = "data:image/jpeg;base64,"

    fun toJpegDataUrl(jpeg: ByteArray): String =
        PREFIX + encode(jpeg)

    // android.util.Base64 is stubbed (returns null) in unit tests; fall back to java.util.
    private fun encode(bytes: ByteArray): String =
        try {
            AndroidBase64.encodeToString(bytes, AndroidBase64.NO_WRAP)
                ?: java.util.Base64.getEncoder().encodeToString(bytes)
        } catch (_: Throwable) {
            java.util.Base64.getEncoder().encodeToString(bytes)
        }
}
