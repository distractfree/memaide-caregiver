package com.example.memaid.video

import android.content.Context
import android.util.Log
import com.meta.wearable.dat.camera.Stream
import com.meta.wearable.dat.camera.addStream
import com.meta.wearable.dat.camera.removeStream
import com.meta.wearable.dat.camera.types.StreamConfiguration
import com.meta.wearable.dat.camera.types.VideoFrame
import com.meta.wearable.dat.camera.types.VideoQuality
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.selectors.AutoDeviceSelector
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.session.DeviceSessionState
import com.meta.wearable.dat.core.types.RegistrationState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map

/**
 * Real-glasses capture over the Meta Wearables Device Access Toolkit (mwdat 0.8.0).
 *
 * Lifecycle (all verified against the mwdat-core/mwdat-camera 0.8.0 API):
 *  1. [Wearables.initialize] once per process (idempotent-guarded here).
 *  2. The app must already be **registered** — that is a one-time, Activity-bound user flow
 *     (`Wearables.startRegistration(activity)`) that lives in the GlassesRegister screen. If the
 *     registration state isn't `REGISTERED`, [frames] throws so the caller can surface it.
 *  3. `createSession(AutoDeviceSelector())` picks the active glasses; `session.start()` connects.
 *  4. `session.addStream(StreamConfiguration(...))` opens a camera stream; `stream.start()` begins it.
 *  5. `stream.videoStream` emits [VideoFrame]s, mapped to [RawFrame].
 * Collection teardown stops the stream and session.
 *
 * ## Frame format — confirm on device
 * [VideoFrame] exposes `buffer/width/height/isCompressed/isCodecConfig` but **no pixel-format
 * field**. We request uncompressed frames ([StreamConfiguration.compressVideo] = false) and treat
 * the raw buffer as I420, feeding the existing [FrameEncoder] I420->NV21->JPEG path. Two things to
 * verify against real hardware / MockDevice and adjust here if wrong:
 *   - whether the glasses honor `compressVideo = false` (if they only stream H.264, a MediaCodec
 *     decode stage is needed — frames would arrive with `isCompressed == true`);
 *   - the exact raw chroma order (I420 vs NV12/NV21) — a mismatch shows as swapped colors, not a crash.
 * `isCodecConfig` frames (SPS/PPS, only present when compressed) are filtered out.
 */
class GlassesFrameSource(
    private val context: Context,
    private val quality: VideoQuality = VideoQuality.LOW,
    private val frameRate: Int = 5,
) : FrameSource {

    override fun frames(): Flow<RawFrame> = flow {
        ensureInitialized(context)

        val regState = Wearables.registrationState.value
        check(regState == RegistrationState.REGISTERED) {
            "Glasses not registered (state=$regState). Complete registration in the app first."
        }

        val session: DeviceSession = Wearables.createSession(AutoDeviceSelector()).getOrThrow()
        session.start()
        // Wait until the session is connected before opening a stream.
        session.state.first { it == DeviceSessionState.STARTED }

        val stream: Stream = session
            .addStream(StreamConfiguration(quality, frameRate, /* compressVideo = */ false))
            .getOrThrow()
        stream.start().getOrThrow()

        try {
            emitAll(
                stream.videoStream
                    .filter { !it.isCodecConfig }
                    .map { it.toRawFrame() }
            )
        } finally {
            runCatching { stream.stop() }
            runCatching { stream.close() }
            runCatching { session.removeStream() }
            runCatching { session.stop() }
        }
    }

    private fun VideoFrame.toRawFrame(): RawFrame {
        // Copy off the SDK's ByteBuffer without disturbing its position (duplicate() shares content
        // but has an independent position). Assumes uncompressed I420 — see the class doc.
        val dup = buffer.duplicate()
        val bytes = ByteArray(dup.remaining())
        dup.get(bytes)
        // The glasses deliver uncompressed I420 planar (Y | U plane | V plane); the encoder
        // converts I420 -> NV21 for YuvImage.
        return RawFrame(bytes, width, height, PixelFormat.I420)
    }

    companion object {
        private const val TAG = "GlassesFrameSource"

        @Volatile private var initialized = false

        /** Idempotent process-wide init. Registration is separate (Activity flow). */
        @Synchronized
        private fun ensureInitialized(context: Context) {
            if (initialized) return
            try {
                Wearables.initialize(context.applicationContext).getOrThrow()
            } catch (e: Exception) {
                // Another entry point may have initialized the SDK first — that's fine, the SDK is
                // a process singleton. Rethrow anything that isn't that case.
                if (e.message?.contains("already initialized", ignoreCase = true) != true) throw e
                Log.i(TAG, "Wearables already initialized elsewhere; continuing.")
            }
            initialized = true
            Log.i(TAG, "Wearables initialized (devMode=${Wearables.isDevMode})")
        }
    }
}
