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
        // Android's YuvImage only speaks NV21 (Y + interleaved V,U). Convert the other
        // 4:2:0 layouts to NV21 first: NV12 swaps the interleaved chroma bytes; I420 is
        // planar (Y, then a full U plane, then a full V plane) and must be interleaved.
        PixelFormat.NV21, PixelFormat.NV12, PixelFormat.I420 -> {
            val nv21 = when (frame.format) {
                PixelFormat.NV12 -> nv12ToNv21(frame.bytes, frame.width, frame.height)
                PixelFormat.I420 -> i420ToNv21(frame.bytes, frame.width, frame.height)
                else -> frame.bytes
            }
            val out = ByteArrayOutputStream()
            YuvImage(nv21, ImageFormat.NV21, frame.width, frame.height, null)
                .compressToJpeg(Rect(0, 0, frame.width, frame.height), quality, out)
            out.toByteArray()
        }
        else -> frame.bytes // YUV_420_888/RGBA conversion handled at the source if needed
    }

    /** NV12 (Y plane + interleaved U,V) -> NV21 (Y plane + interleaved V,U) by swapping each pair. */
    internal fun nv12ToNv21(src: ByteArray, width: Int, height: Int): ByteArray {
        val ySize = width * height
        val out = src.copyOf()
        var i = ySize
        while (i + 1 < out.size) {
            out[i] = src[i + 1]
            out[i + 1] = src[i]
            i += 2
        }
        return out
    }

    /** I420 (Y | U plane | V plane) -> NV21 (Y | interleaved V,U). */
    internal fun i420ToNv21(src: ByteArray, width: Int, height: Int): ByteArray {
        val ySize = width * height
        val chroma = ySize / 4 // per plane (U and V each width*height/4)
        val out = ByteArray(ySize + 2 * chroma)
        System.arraycopy(src, 0, out, 0, ySize)
        val uStart = ySize
        val vStart = ySize + chroma
        var o = ySize
        for (i in 0 until chroma) {
            out[o++] = src[vStart + i] // V
            out[o++] = src[uStart + i] // U
        }
        return out
    }
}
