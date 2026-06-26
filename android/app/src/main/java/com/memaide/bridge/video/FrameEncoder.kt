package com.memaide.bridge.video

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import com.memaide.bridge.model.PixelFormat
import com.memaide.bridge.model.RawFrame
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.io.ByteArrayOutputStream

/**
 * Encodes every captured frame to a JPEG data-URL. No throttling — the server decimates to
 * the brain; the client sends the full stream (so the server can record it).
 */
class FrameEncoder(private val quality: Int = 70) {
    fun encode(frames: Flow<RawFrame>): Flow<String> =
        frames.map { DataUrlCodec.toJpegDataUrl(toJpeg(it)) }

    private fun toJpeg(frame: RawFrame): ByteArray = when (frame.format) {
        PixelFormat.JPEG -> frame.bytes
        PixelFormat.NV21 -> {
            val out = ByteArrayOutputStream()
            YuvImage(frame.bytes, ImageFormat.NV21, frame.width, frame.height, null)
                .compressToJpeg(Rect(0, 0, frame.width, frame.height), quality, out)
            out.toByteArray()
        }
        else -> frame.bytes // YUV_420_888/RGBA conversion handled at the source if needed
    }
}
