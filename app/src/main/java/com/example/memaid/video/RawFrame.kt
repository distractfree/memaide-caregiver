package com.example.memaid.video

enum class PixelFormat { JPEG, NV21, NV12, I420, YUV_420_888, RGBA_8888 }

/** A single captured frame as delivered by a [FrameSource], before JPEG encoding. */
class RawFrame(
    val bytes: ByteArray,
    val width: Int,
    val height: Int,
    val format: PixelFormat,
)
