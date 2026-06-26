package com.memaide.bridge.model

enum class PixelFormat { JPEG, NV21, YUV_420_888, RGBA_8888 }

/** A single captured frame as delivered by a FrameSource, before JPEG encoding. */
class RawFrame(
    val bytes: ByteArray,
    val width: Int,
    val height: Int,
    val format: PixelFormat,
)

data class PatientContext(
    val patientId: String,
    val name: String,
)

enum class SessionState { Disconnected, Connecting, Streaming, Reconnecting }
