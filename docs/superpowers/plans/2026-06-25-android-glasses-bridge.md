# Android Glasses Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A minimal Android app that streams Meta Ray-Ban camera frames + mic audio to the existing MemAide WebSocket server and plays the server's audio replies back — a dumb pipe with a thin debug UI.

**Architecture:** A foreground `MediaBridgeService` owns the session. Capture sits behind a `FrameSource` interface (MockDevice for dev, real glasses later, optional phone camera). Frames → `FrameEncoder` → `DataUrlCodec`; mic/speaker → a session-long `AudioEngine` over Bluetooth SCO with an internal `Resampler`. All streams move over a Flows + buffered Channel backbone to a `BridgeSocket` (OkHttp WebSocket) that auto-reconnects with exponential backoff. No phone-side VAD/brain/safety — all reasoning stays server-side.

**Tech Stack:** Kotlin, Android (minSdk 26), Kotlin coroutines + Flow, OkHttp WebSocket, kotlinx.serialization, Meta Wearables Device Access Toolkit (`mwdat-core`/`mwdat-camera`/`mwdat-mockdevice`). Tests: JUnit4, kotlinx-coroutines-test, OkHttp MockWebServer, Robolectric (for the few Android-framework units).

> **Testing convention:** "pure-JVM" tasks run as plain `test` source-set unit tests (`./gradlew :app:testDebugUnitTest`). Device-bound tasks (Meta SDK, real SCO audio, the Service, the UI) cannot run headless — each ends with a concrete **manual verification** step against MockDevice or the live laptop server rather than an assertion.

---

## File Structure

New `android/` Gradle project in this repo. Package root: `com.memaide.bridge`.

```
android/
  settings.gradle.kts
  build.gradle.kts
  gradle.properties
  app/
    build.gradle.kts
    src/main/AndroidManifest.xml
    src/main/java/com/memaide/bridge/
      model/            Models.kt          (RawFrame, PatientContext, SessionState)
      ws/               WsMessages.kt       (serializable DTOs + WsCodec)
                        Backoff.kt          (pure exponential backoff)
                        BridgeSocket.kt     (OkHttp WebSocket + reconnect)
      video/            FrameSource.kt      (interface + StubFrameSource)
                        DataUrlCodec.kt     (pure: bytes -> data-URL)
                        FrameEncoder.kt     (RawFrame -> JPEG -> DataUrlCodec)
                        GlassesFrameSource.kt   (Meta SDK / MockDevice)
                        PhoneCameraFrameSource.kt (optional CameraX)
      audio/            Resampler.kt        (pure linear resampler)
                        AudioEngine.kt      (SCO + AudioRecord/AudioTrack + Resampler)
      service/          MediaBridgeService.kt   (foreground service, wiring)
                        OutboundChannel.kt  (drop-oldest frame policy helper)
      ui/               MainActivity.kt     (debug UI)
    src/test/java/com/memaide/bridge/   (pure-JVM unit tests)
```

Each task names exact files. Tasks 1–8 are the testable core; 9–12 are device-bound assembly.

---

## Task 1: Gradle scaffold + app module

> **DONE 2026-06-25 (commit `7c2482d`).** Version corrections vs. the snippets below, made to
> match the installed toolchain (cached Gradle 8.14.3; only android-36/36.1 SDK platforms
> present; JDK 17 at `JAVA_HOME`): **AGP `8.11.1`**, **Kotlin `2.0.21`**, **`compileSdk`/`targetSdk = 36`**,
> **Robolectric `4.15.1`**. The wrapper was bootstrapped from the cached Gradle dist
> (`gradle wrapper --gradle-version 8.14.3`). `android/.gitignore` and a gitignored
> `local.properties` (`sdk.dir`) were added. Verified: `./gradlew :app:testDebugUnitTest` →
> BUILD SUCCESSFUL (NO-SOURCE). Build commands run from `android/`: `./gradlew <task>`.

**Files:**
- Create: `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`, `android/app/build.gradle.kts`, `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Create the Gradle project files**

`android/settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositories {
        google(); mavenCentral()
        // Meta Wearables DAT toolkit is published to GitHub Packages — credentials added at Task 9.
    }
}
rootProject.name = "memaide-bridge"
include(":app")
```

`android/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application") version "8.5.0" apply false
    id("org.jetbrains.kotlin.android") version "2.0.0" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.0" apply false
}
```

`android/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx2048m
android.useAndroidX=true
kotlin.code.style=official
```

`android/app/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.memaide.bridge"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.memaide.bridge"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.robolectric:robolectric:4.12.2")
    testImplementation("androidx.test:core:1.6.1")
}
```

`android/app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />

    <application android:label="MemAide Bridge" android:allowBackup="false">
        <activity android:name=".ui.MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
        <service
            android:name=".service.MediaBridgeService"
            android:foregroundServiceType="microphone|camera"
            android:exported="false" />
    </application>
</manifest>
```

- [ ] **Step 2: Verify the project configures**

Run: `cd android && ./gradlew :app:help -q`
Expected: configures without error (downloads Gradle/AGP on first run).

- [ ] **Step 3: Commit**

```bash
git add android/settings.gradle.kts android/build.gradle.kts android/gradle.properties android/app/build.gradle.kts android/app/src/main/AndroidManifest.xml
git commit -m "chore(android): scaffold bridge app module"
```

---

## Task 2: Domain models

**Files:**
- Create: `android/app/src/main/java/com/memaide/bridge/model/Models.kt`
- Test: `android/app/src/test/java/com/memaide/bridge/model/ModelsTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package com.memaide.bridge.model

import org.junit.Assert.assertEquals
import org.junit.Test

class ModelsTest {
    @Test fun rawFrame_holds_bytes_and_dims() {
        val f = RawFrame(byteArrayOf(1, 2, 3), 640, 480, PixelFormat.JPEG)
        assertEquals(3, f.bytes.size)
        assertEquals(640, f.width)
        assertEquals(PixelFormat.JPEG, f.format)
    }

    @Test fun sessionState_has_expected_values() {
        assertEquals(4, SessionState.values().size)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*ModelsTest"`
Expected: FAIL — unresolved references `RawFrame`/`PixelFormat`/`SessionState`.

- [ ] **Step 3: Implement**

```kotlin
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*ModelsTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/memaide/bridge/model/Models.kt android/app/src/test/java/com/memaide/bridge/model/ModelsTest.kt
git commit -m "feat(android): add domain models"
```

---

## Task 3: `DataUrlCodec` (pure)

**Files:**
- Create: `android/app/src/main/java/com/memaide/bridge/video/DataUrlCodec.kt`
- Test: `android/app/src/test/java/com/memaide/bridge/video/DataUrlCodecTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*DataUrlCodecTest"`
Expected: FAIL — unresolved `DataUrlCodec`.

- [ ] **Step 3: Implement**

```kotlin
package com.memaide.bridge.video

import android.util.Base64 as AndroidBase64

/** Pure: wraps JPEG bytes as a `data:image/jpeg;base64,...` URL the server expects. */
object DataUrlCodec {
    private const val PREFIX = "data:image/jpeg;base64,"

    fun toJpegDataUrl(jpeg: ByteArray): String =
        PREFIX + encode(jpeg)

    // android.util.Base64 is stubbed in unit tests (returnDefaultValues); fall back to java.util.
    private fun encode(bytes: ByteArray): String =
        try {
            AndroidBase64.encodeToString(bytes, AndroidBase64.NO_WRAP)
                ?: java.util.Base64.getEncoder().encodeToString(bytes)
        } catch (_: Throwable) {
            java.util.Base64.getEncoder().encodeToString(bytes)
        }
}
```

> Note: under unit tests `android.util.Base64` returns null/defaults, so the fallback to
> `java.util.Base64` is what the test exercises. On device, the Android encoder is used.

- [ ] **Step 4: Run to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*DataUrlCodecTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/memaide/bridge/video/DataUrlCodec.kt android/app/src/test/java/com/memaide/bridge/video/DataUrlCodecTest.kt
git commit -m "feat(android): add DataUrlCodec"
```

---

## Task 4: `Resampler` (pure)

**Files:**
- Create: `android/app/src/main/java/com/memaide/bridge/audio/Resampler.kt`
- Test: `android/app/src/test/java/com/memaide/bridge/audio/ResamplerTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package com.memaide.bridge.audio

import org.junit.Assert.assertEquals
import org.junit.Test

class ResamplerTest {
    @Test fun upsample_16k_to_24k_lengthens_by_ratio() {
        // 4 input samples at 16k -> 6 output samples at 24k (ratio 1.5).
        val input = shortArrayOf(0, 100, 200, 300)
        val out = Resampler.resample(input, fromRate = 16000, toRate = 24000)
        assertEquals(6, out.size)
        assertEquals(0, out[0].toInt())          // first sample preserved
    }

    @Test fun downsample_24k_to_16k_shortens_by_ratio() {
        val input = ShortArray(6) { (it * 100).toShort() }
        val out = Resampler.resample(input, fromRate = 24000, toRate = 16000)
        assertEquals(4, out.size)
    }

    @Test fun same_rate_is_identity() {
        val input = shortArrayOf(1, 2, 3)
        val out = Resampler.resample(input, fromRate = 24000, toRate = 24000)
        assertEquals(listOf<Short>(1, 2, 3), out.toList())
    }

    @Test fun empty_input_returns_empty() {
        assertEquals(0, Resampler.resample(ShortArray(0), 16000, 24000).size)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*ResamplerTest"`
Expected: FAIL — unresolved `Resampler`.

- [ ] **Step 3: Implement**

```kotlin
package com.memaide.bridge.audio

import kotlin.math.floor
import kotlin.math.min

/** Pure linear-interpolation resampler for mono PCM16. Good enough for HFP voice. */
object Resampler {
    fun resample(input: ShortArray, fromRate: Int, toRate: Int): ShortArray {
        if (input.isEmpty() || fromRate == toRate) return input.copyOf()
        val outLen = (input.size.toLong() * toRate / fromRate).toInt()
        if (outLen <= 0) return ShortArray(0)
        val out = ShortArray(outLen)
        val step = fromRate.toDouble() / toRate.toDouble()
        for (i in 0 until outLen) {
            val pos = i * step
            val idx = floor(pos).toInt()
            val frac = pos - idx
            val a = input[min(idx, input.size - 1)].toInt()
            val b = input[min(idx + 1, input.size - 1)].toInt()
            out[i] = (a + (b - a) * frac).toInt().toShort()
        }
        return out
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*ResamplerTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/memaide/bridge/audio/Resampler.kt android/app/src/test/java/com/memaide/bridge/audio/ResamplerTest.kt
git commit -m "feat(android): add PCM16 linear Resampler"
```

---

## Task 5: WebSocket DTOs + codec

> **Contract corrected after review (commit `ffff667`).** Two inbound DTOs in the snippet
> below mismatched the real server (`src/memaide/server/voice_loop.py`): `escalation.triggered_by`
> is a **JSON array** (decode to `List<String>` like `advisory_flags`, not a scalar), and
> `audio_error` carries **`text`**, not `message`. The original test fixtures hid this by
> matching the buggy decoder; they were re-derived from the literal `voice_loop.py` payloads
> and now assert decoded values (`triggeredBy == ["vision","keyword"]`, `AudioError.text`).

**Files:**
- Create: `android/app/src/main/java/com/memaide/bridge/ws/WsMessages.kt`
- Test: `android/app/src/test/java/com/memaide/bridge/ws/WsCodecTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package com.memaide.bridge.ws

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WsCodecTest {
    @Test fun encodes_hello_with_patient() {
        val json = WsCodec.encode(
            Outbound.Hello("s1", PatientDto("p1", "Rose"))
        )
        assertTrue(json.contains("\"type\":\"hello\""))
        assertTrue(json.contains("\"session_id\":\"s1\""))
        assertTrue(json.contains("\"patient_id\":\"p1\""))
    }

    @Test fun encodes_frame_and_audio() {
        assertTrue(WsCodec.encode(Outbound.Frame("data:image/jpeg;base64,QUJD"))
            .contains("\"data_url\":\"data:image/jpeg;base64,QUJD\""))
        assertTrue(WsCodec.encode(Outbound.Audio("QUJD")).contains("\"pcm\":\"QUJD\""))
    }

    @Test fun decodes_known_inbound_types() {
        assertTrue(WsCodec.decode("""{"type":"audio_out","pcm":"QUJD","seq":3}""")
                is Inbound.AudioOut)
        assertTrue(WsCodec.decode("""{"type":"subtitle","text":"hi","role":"agent"}""")
                is Inbound.Subtitle)
        assertTrue(WsCodec.decode(
            """{"type":"vision_context","description":"a kitchen","label":"kitchen","advisory_flags":[],"ts":"t"}"""
        ) is Inbound.VisionContext)
        assertTrue(WsCodec.decode("""{"type":"escalation","reason":"fall","triggered_by":"vision"}""")
                is Inbound.Escalation)
        assertTrue(WsCodec.decode("""{"type":"audio_error","message":"x"}""")
                is Inbound.AudioError)
    }

    @Test fun unknown_inbound_is_null() {
        assertEquals(null, WsCodec.decode("""{"type":"nope"}"""))
        assertEquals(null, WsCodec.decode("not json"))
    }

    @Test fun audio_out_carries_payload() {
        val msg = WsCodec.decode("""{"type":"audio_out","pcm":"QUJD","seq":3}""") as Inbound.AudioOut
        assertEquals("QUJD", msg.pcm)
        assertEquals(3, msg.seq)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*WsCodecTest"`
Expected: FAIL — unresolved `WsCodec`/`Outbound`/`Inbound`.

- [ ] **Step 3: Implement**

```kotlin
package com.memaide.bridge.ws

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class PatientDto(
    @SerialName("patient_id") val patientId: String,
    val name: String,
)

/** Messages the client sends. Field names match src/memaide/server/ws.py. */
sealed interface Outbound {
    @Serializable
    data class Hello(
        @SerialName("session_id") val sessionId: String,
        val patient: PatientDto,
        val type: String = "hello",
    ) : Outbound

    @Serializable
    data class Frame(
        @SerialName("data_url") val dataUrl: String,
        val type: String = "frame",
    ) : Outbound

    @Serializable
    data class Audio(val pcm: String, val type: String = "audio") : Outbound

    @Serializable
    data class Bye(val type: String = "bye") : Outbound
}

/** Messages the client receives. */
sealed interface Inbound {
    data class VisionContext(
        val description: String,
        val label: String,
        val advisoryFlags: List<String>,
        val ts: String,
    ) : Inbound

    data class Subtitle(val text: String, val role: String) : Inbound
    data class Escalation(val reason: String, val triggeredBy: String) : Inbound
    data class AudioOut(val pcm: String, val seq: Int) : Inbound
    data class AudioError(val message: String) : Inbound
}

object WsCodec {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun encode(msg: Outbound): String = when (msg) {
        is Outbound.Hello -> json.encodeToString(Outbound.Hello.serializer(), msg)
        is Outbound.Frame -> json.encodeToString(Outbound.Frame.serializer(), msg)
        is Outbound.Audio -> json.encodeToString(Outbound.Audio.serializer(), msg)
        is Outbound.Bye -> json.encodeToString(Outbound.Bye.serializer(), msg)
    }

    fun decode(raw: String): Inbound? {
        val obj: JsonObject = try {
            json.parseToJsonElement(raw).jsonObject
        } catch (_: Throwable) {
            return null
        }
        fun str(k: String) = obj[k]?.jsonPrimitive?.content ?: ""
        return when (str("type")) {
            "vision_context" -> Inbound.VisionContext(
                str("description"), str("label"),
                (obj["advisory_flags"] as? kotlinx.serialization.json.JsonArray)
                    ?.map { it.jsonPrimitive.content } ?: emptyList(),
                str("ts"),
            )
            "subtitle" -> Inbound.Subtitle(str("text"), str("role"))
            "escalation" -> Inbound.Escalation(str("reason"), str("triggered_by"))
            "audio_out" -> Inbound.AudioOut(
                str("pcm"), obj["seq"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
            )
            "audio_error" -> Inbound.AudioError(str("message"))
            else -> null
        }
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*WsCodecTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/memaide/bridge/ws/WsMessages.kt android/app/src/test/java/com/memaide/bridge/ws/WsCodecTest.kt
git commit -m "feat(android): add WS message DTOs + codec"
```

---

## Task 6: `Backoff` (pure)

**Files:**
- Create: `android/app/src/main/java/com/memaide/bridge/ws/Backoff.kt`
- Test: `android/app/src/test/java/com/memaide/bridge/ws/BackoffTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package com.memaide.bridge.ws

import org.junit.Assert.assertEquals
import org.junit.Test

class BackoffTest {
    @Test fun doubles_until_cap_then_resets() {
        val b = Backoff(initialMs = 500, maxMs = 4000)
        assertEquals(500, b.next())
        assertEquals(1000, b.next())
        assertEquals(2000, b.next())
        assertEquals(4000, b.next())
        assertEquals(4000, b.next())   // capped
        b.reset()
        assertEquals(500, b.next())     // back to start after a successful connect
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*BackoffTest"`
Expected: FAIL — unresolved `Backoff`.

- [ ] **Step 3: Implement**

```kotlin
package com.memaide.bridge.ws

import kotlin.math.min

/** Pure exponential backoff: doubles each call up to a cap; reset on a good connect. */
class Backoff(private val initialMs: Long = 500, private val maxMs: Long = 10_000) {
    private var current = initialMs
    fun next(): Long {
        val v = current
        current = min(current * 2, maxMs)
        return v
    }
    fun reset() { current = initialMs }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*BackoffTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/memaide/bridge/ws/Backoff.kt android/app/src/test/java/com/memaide/bridge/ws/BackoffTest.kt
git commit -m "feat(android): add exponential Backoff"
```

---

## Task 7: `OutboundChannel` drop-oldest frame policy

**Files:**
- Create: `android/app/src/main/java/com/memaide/bridge/service/OutboundChannel.kt`
- Test: `android/app/src/test/java/com/memaide/bridge/service/OutboundChannelTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package com.memaide.bridge.service

import com.memaide.bridge.ws.Outbound
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class OutboundChannelTest {
    @Test fun drops_oldest_frame_when_full_but_keeps_audio() = runTest {
        val ch = OutboundChannel(frameCapacity = 2)
        // Three frames into a 2-slot frame buffer: the oldest is dropped.
        ch.offerFrame(Outbound.Frame("f1"))
        ch.offerFrame(Outbound.Frame("f2"))
        ch.offerFrame(Outbound.Frame("f3"))
        ch.offerAudio(Outbound.Audio("a1"))
        ch.close()

        val drained = ch.drain()
        val frames = drained.filterIsInstance<Outbound.Frame>().map { it.dataUrl }
        val audios = drained.filterIsInstance<Outbound.Audio>().map { it.pcm }
        assertEquals(listOf("f2", "f3"), frames)   // f1 dropped
        assertEquals(listOf("a1"), audios)         // audio never dropped
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*OutboundChannelTest"`
Expected: FAIL — unresolved `OutboundChannel`.

- [ ] **Step 3: Implement**

```kotlin
package com.memaide.bridge.service

import com.memaide.bridge.ws.Outbound
import kotlinx.coroutines.channels.Channel

/**
 * Frames use a bounded drop-oldest buffer so stale video never backlogs; audio uses an
 * unbounded buffer so speech is never dropped. `drain()` (test/helper) reads everything
 * currently buffered after `close()`. In the Service, a sender coroutine consumes both.
 */
class OutboundChannel(frameCapacity: Int = 4) {
    private val frames = ArrayDeque<Outbound.Frame>()
    private val frameCap = frameCapacity
    private val audio = Channel<Outbound.Audio>(Channel.UNLIMITED)
    private var closed = false

    @Synchronized
    fun offerFrame(f: Outbound.Frame) {
        if (closed) return
        if (frames.size >= frameCap) frames.removeFirst()  // drop oldest
        frames.addLast(f)
    }

    fun offerAudio(a: Outbound.Audio) {
        if (!closed) audio.trySend(a)
    }

    @Synchronized
    fun close() { closed = true; audio.close() }

    /** Helper for tests/flush: snapshot of buffered frames then audio. */
    @Synchronized
    fun drain(): List<Outbound> {
        val out = ArrayList<Outbound>(frames)
        while (true) {
            val a = audio.tryReceive().getOrNull() ?: break
            out.add(a)
        }
        return out
    }

    /** Clear buffered frames on a socket drop so nothing stale flushes on reconnect. */
    @Synchronized
    fun clearFrames() { frames.clear() }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*OutboundChannelTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/memaide/bridge/service/OutboundChannel.kt android/app/src/test/java/com/memaide/bridge/service/OutboundChannelTest.kt
git commit -m "feat(android): add drop-oldest OutboundChannel"
```

---

## Task 8: `FrameSource` interface + `StubFrameSource`

**Files:**
- Create: `android/app/src/main/java/com/memaide/bridge/video/FrameSource.kt`
- Test: `android/app/src/test/java/com/memaide/bridge/video/FrameSourceTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*FrameSourceTest"`
Expected: FAIL — unresolved `FrameSource`/`StubFrameSource`.

- [ ] **Step 3: Implement**

```kotlin
package com.memaide.bridge.video

import com.memaide.bridge.model.RawFrame
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.asFlow

/** Capture seam: MockDevice/real-glasses/phone-camera all implement this. */
interface FrameSource {
    fun frames(): Flow<RawFrame>
}

/** Test/dev source that replays a fixed list of frames. */
class StubFrameSource(private val items: List<RawFrame>) : FrameSource {
    override fun frames(): Flow<RawFrame> = items.asFlow()
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*FrameSourceTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/memaide/bridge/video/FrameSource.kt android/app/src/test/java/com/memaide/bridge/video/FrameSourceTest.kt
git commit -m "feat(android): add FrameSource seam + stub"
```

---

## Task 9: `FrameEncoder` (RawFrame → data-URL Flow)

**Files:**
- Create: `android/app/src/main/java/com/memaide/bridge/video/FrameEncoder.kt`
- Test: `android/app/src/test/java/com/memaide/bridge/video/FrameEncoderTest.kt` (Robolectric)

The JPEG step is Android-framework-bound (`YuvImage`/`Bitmap.compress`). We keep the
encoder thin: if a `RawFrame` is already JPEG (the Meta SDK/MockDevice common case) it goes
straight to `DataUrlCodec`; other formats are compressed via the Android API. The test
covers the already-JPEG path (no real codec needed).

- [ ] **Step 1: Write the failing test**

```kotlin
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*FrameEncoderTest"`
Expected: FAIL — unresolved `FrameEncoder`.

- [ ] **Step 3: Implement**

```kotlin
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*FrameEncoderTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/memaide/bridge/video/FrameEncoder.kt android/app/src/test/java/com/memaide/bridge/video/FrameEncoderTest.kt
git commit -m "feat(android): add FrameEncoder"
```

---

## Task 10: `BridgeSocket` (OkHttp WebSocket + reconnect)

> **Test corrected during impl (commit `bff37c3`).** The `runTest`-based test below is broken:
> it depends on real OkHttp/MockWebServer background threads, but `runTest` uses a virtual
> clock so its `delay`/`withTimeout` fast-forward the timeout (~0.6 s real) before the round
> trip completes. The committed test instead runs in **real time** — plain `@Test`, a
> `CountDownLatch` with a real timeout, `onSubscription` to register the collector before
> `connect()` (the inbound SharedFlow has no replay), and it closes the **server-side**
> WebSocket before `server.shutdown()` (else MockWebServer hangs on the open upgraded
> connection). `BridgeSocket.kt` itself is unchanged from the snippet below.

**Files:**
- Create: `android/app/src/main/java/com/memaide/bridge/ws/BridgeSocket.kt`
- Test: `android/app/src/test/java/com/memaide/bridge/ws/BridgeSocketTest.kt` (MockWebServer)

- [ ] **Step 1: Write the failing test**

```kotlin
package com.memaide.bridge.ws

import com.memaide.bridge.model.PatientContext
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.QueueDispatcher
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class BridgeSocketTest {
    private lateinit var server: MockWebServer

    @Before fun setUp() { server = MockWebServer(); server.start() }
    @After fun tearDown() { server.shutdown() }

    @Test fun sends_hello_on_open_and_emits_decoded_inbound() = runTest {
        // Server echoes one audio_out frame back, then keeps the socket open.
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : okhttp3.WebSocketListener() {
                override fun onMessage(webSocket: okhttp3.WebSocket, text: String) {
                    if (text.contains("\"type\":\"hello\"")) {
                        webSocket.send("""{"type":"audio_out","pcm":"QUJD","seq":1}""")
                    }
                }
            })
        )
        val url = server.url("/").toString().replace("http", "ws")
        val socket = BridgeSocket(url, PatientContext("p1", "Rose"), sessionId = "s1")

        val received = ArrayList<Inbound>()
        val job = launch { socket.inbound.collect { received.add(it) } }
        socket.connect()
        withTimeout(2000) {
            while (received.none { it is Inbound.AudioOut }) kotlinx.coroutines.delay(10)
        }
        socket.close()
        job.cancel()

        // Server saw the hello with our session id.
        val request = server.takeRequest()
        assertTrue(request.path == "/")
        assertTrue(received.any { it is Inbound.AudioOut })
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*BridgeSocketTest"`
Expected: FAIL — unresolved `BridgeSocket`.

- [ ] **Step 3: Implement**

```kotlin
package com.memaide.bridge.ws

import android.util.Log
import com.memaide.bridge.model.PatientContext
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.atomic.AtomicBoolean

/**
 * One WebSocket connection to the MemAide server. Sends `hello` on open, exposes decoded
 * inbound messages as a Flow, and reconnects with exponential backoff until `close()`.
 * Reconnect uses a fresh `hello` (the server's VoiceLoop is per-connection — no resume).
 */
class BridgeSocket(
    private val url: String,
    private val patient: PatientContext,
    private val sessionId: String,
    private val client: OkHttpClient = OkHttpClient(),
    private val backoff: Backoff = Backoff(),
) {
    private val _inbound = MutableSharedFlow<Inbound>(
        extraBufferCapacity = 64, onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val inbound: SharedFlow<Inbound> = _inbound

    @Volatile private var ws: WebSocket? = null
    private val running = AtomicBoolean(false)

    fun connect() {
        running.set(true)
        open()
    }

    private fun open() {
        if (!running.get()) return
        val request = Request.Builder().url(url).build()
        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                backoff.reset()
                webSocket.send(
                    WsCodec.encode(
                        Outbound.Hello(sessionId, PatientDto(patient.patientId, patient.name))
                    )
                )
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                WsCodec.decode(text)?.let { _inbound.tryEmit(it) }
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w("BridgeSocket", "socket failed; reconnecting", t)
                reconnectLater()
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                reconnectLater()
            }
        })
    }

    private fun reconnectLater() {
        if (!running.get()) return
        val delay = backoff.next()
        Thread {
            Thread.sleep(delay)
            open()
        }.start()
    }

    fun send(msg: Outbound): Boolean = ws?.send(WsCodec.encode(msg)) ?: false

    fun close() {
        running.set(false)
        ws?.close(1000, "bye")
        ws = null
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*BridgeSocketTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/memaide/bridge/ws/BridgeSocket.kt android/app/src/test/java/com/memaide/bridge/ws/BridgeSocketTest.kt
git commit -m "feat(android): add BridgeSocket with reconnect"
```

---

## Task 11: `AudioEngine`, `GlassesFrameSource`, `MediaBridgeService` (device-bound assembly)

These three are Android-framework / Meta-SDK bound and cannot run as headless unit tests;
each step ends with a concrete manual verification against MockDevice or the live server.

**Files:**
- Create: `android/app/src/main/java/com/memaide/bridge/audio/AudioEngine.kt`
- Create: `android/app/src/main/java/com/memaide/bridge/video/GlassesFrameSource.kt`
- Create: `android/app/src/main/java/com/memaide/bridge/service/MediaBridgeService.kt`
- Modify: `android/settings.gradle.kts`, `android/app/build.gradle.kts` (Meta SDK deps)

- [ ] **Step 1: Add the Meta toolkit dependency**

In `android/settings.gradle.kts`, add the GitHub Packages repo with credentials from
`gradle.properties` (a GitHub PAT with `read:packages`; documented in the README, not committed):

```kotlin
maven {
    url = uri("https://maven.pkg.github.com/facebook/meta-wearables-dat-android")
    credentials {
        username = providers.gradleProperty("gpr.user").orNull
        password = providers.gradleProperty("gpr.token").orNull
    }
}
```

In `android/app/build.gradle.kts` dependencies add:

```kotlin
implementation("com.meta.wearables.dat:mwdat-core:+")
implementation("com.meta.wearables.dat:mwdat-camera:+")
implementation("com.meta.wearables.dat:mwdat-mockdevice:+")
```

- [ ] **Step 2: Implement `AudioEngine`**

```kotlin
package com.memaide.bridge.audio

import android.bluetooth.BluetoothAdapter
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.util.Base64
import com.memaide.bridge.ws.Outbound
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
```

> Implement `AudioEngine` to: (a) request SCO via `AudioManager.startBluetoothSco()` +
> `isBluetoothScoOn`, hold it for the session; (b) read mono PCM16 from `AudioRecord`
> (`MediaRecorder.AudioSource.VOICE_COMMUNICATION`, the negotiated SCO rate, e.g. 16 kHz);
> (c) `micPcm(): Flow<Outbound.Audio>` that resamples each buffer to 24 kHz via
> `Resampler.resample(...)`, base64-encodes, and emits; (d) `play(pcm: String)` that base64-
> decodes, resamples 24 kHz → SCO rate, and writes to a streaming `AudioTrack`; (e) `start()`
> / `stop()` lifecycle that owns SCO and releases both endpoints.

- [ ] **Step 3 (manual): Verify SCO + loopback**

Build/install on a phone with a paired BT headset. In a temporary debug button, start
`AudioEngine`, speak, and confirm `micPcm()` emits non-silent buffers (log RMS) and `play()`
of a known PCM tone is audible through the headset. Expected: mic buffers non-zero; tone audible.

- [ ] **Step 4: Implement `GlassesFrameSource`**

```kotlin
package com.memaide.bridge.video

import android.content.Context
import com.memaide.bridge.model.PixelFormat
import com.memaide.bridge.model.RawFrame
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
// Meta SDK imports (confirm exact names against the installed mwdat-camera artifact).
```

> Implement against the documented Meta flow: `Wearables.initialize(context)` →
> `startRegistration(activity)` → `createSession(AutoDeviceSelector())` → open a
> `CameraStream` with `StreamConfiguration(resolution = LOW, fps = 2)` → map its
> `videoStream` Kotlin Flow to `RawFrame`. **Confirm the frame element's byte/format/dim
> accessors against the real artifact** (the SDK frame type isn't documented yet) and set
> `PixelFormat` accordingly (JPEG if already-compressed, else NV21).

- [ ] **Step 5 (manual): Verify frames against MockDevice**

Initialize the toolkit in **Mock Device** mode (`mwdat-mockdevice`), collect
`GlassesFrameSource.frames()`, and log frame count + first frame dims for ~5 s. Expected:
~2 frames/sec, plausible dimensions, no crash. Adjust the accessor mapping if needed.

- [ ] **Step 6: Implement `MediaBridgeService`**

> Foreground service that on `start`: posts the foreground notification
> (`foregroundServiceType=microphone|camera`); builds `BridgeSocket`, `AudioEngine`,
> `FrameEncoder`, and the chosen `FrameSource`; launches coroutines that (a) collect
> `FrameEncoder.encode(source.frames())` → `OutboundChannel.offerFrame`, (b) collect
> `AudioEngine.micPcm()` → `OutboundChannel.offerAudio`, (c) a sender coroutine drains the
> channel → `BridgeSocket.send`, (d) collect `BridgeSocket.inbound`: `AudioOut` →
> `AudioEngine.play`, others → a `StateFlow<UiState>` for the Activity. On socket drop
> (observed via inbound gap / a `BridgeSocket` state callback) call
> `OutboundChannel.clearFrames()`. On `stop`: send `Outbound.Bye`, stop `AudioEngine`, close
> `BridgeSocket`, stop foreground. Expose `StateFlow<SessionState>` + last subtitle/vision.

- [ ] **Step 7 (manual): End-to-end against the live server with MockDevice**

Start the Python server on the laptop (`config.WS_HOST=0.0.0.0`); enable recording by
injecting `FileSessionRecorder` (see the server plan). From the phone on the same WiFi, point
the app at `ws://<laptop-LAN-IP>:8765`, start the session with MockDevice frames + the BT mic.
Expected: server logs `hello`; `recordings/<session_id>/` fills with JPEGs + manifest;
`vision_context`/`subtitle` come back and render; spoken audio yields `audio_out` that plays.

- [ ] **Step 8: Commit**

```bash
git add android/app/src/main/java/com/memaide/bridge/audio/AudioEngine.kt android/app/src/main/java/com/memaide/bridge/video/GlassesFrameSource.kt android/app/src/main/java/com/memaide/bridge/service/MediaBridgeService.kt android/settings.gradle.kts android/app/build.gradle.kts
git commit -m "feat(android): add AudioEngine, GlassesFrameSource, MediaBridgeService"
```

---

## Task 12: `MainActivity` debug UI + optional `PhoneCameraFrameSource`

**Files:**
- Create: `android/app/src/main/java/com/memaide/bridge/ui/MainActivity.kt`
- Create: `android/app/src/main/res/layout/activity_main.xml`
- Create (optional): `android/app/src/main/java/com/memaide/bridge/video/PhoneCameraFrameSource.kt`

- [ ] **Step 1: Implement the debug UI**

> A single screen with: a server-URL text field (default `ws://<laptop-LAN-IP>:8765`); a
> Start/Stop button; runtime-permission requests (RECORD_AUDIO, CAMERA, BLUETOOTH_CONNECT)
> on Start; and read-only status bound to the Service's `StateFlow`s: socket/session state,
> frame fps, mic level, last `subtitle`, last `vision_context`. Binds to `MediaBridgeService`
> and renders state; no capture/network logic lives here.

- [ ] **Step 2 (optional): Implement `PhoneCameraFrameSource`**

> A CameraX `ImageAnalysis` source emitting `RawFrame` (NV21/YUV) at ~2 fps, for testing the
> whole pipe with no glasses and no MockDevice. Selectable from the UI as the active `FrameSource`.

- [ ] **Step 3 (manual): Full smoke test**

Install, grant permissions, Start with MockDevice (or phone camera): confirm the status panel
shows Streaming, fps ≈ 2, mic level moving while talking, subtitles/vision updating, and audio
replies playing. Stop: confirm the session ends and the notification clears.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/com/memaide/bridge/ui/ android/app/src/main/res/layout/activity_main.xml android/app/src/main/java/com/memaide/bridge/video/PhoneCameraFrameSource.kt
git commit -m "feat(android): add debug UI + optional phone-camera source"
```

---

## Task 13: README + ignore build output

**Files:**
- Create: `android/README.md`
- Create: `android/.gitignore`

- [ ] **Step 1: Add `android/.gitignore`**

```gitignore
.gradle/
build/
local.properties
*.iml
.idea/
```

- [ ] **Step 2: Write `android/README.md`**

Document: prerequisites (Android Studio, JDK 17, Meta Developer Mode on the glasses via the
Meta AI app); the GitHub Packages PAT (`gpr.user`/`gpr.token` in `~/.gradle/gradle.properties`,
never committed — **no `.env.example`**, per repo convention); how to run against MockDevice;
how to find the laptop LAN IP and point the app at `ws://<ip>:8765`; that the phone and laptop
must share WiFi; and that the server records frames when a `FileSessionRecorder` is injected.

- [ ] **Step 3: Verify the full unit-test suite is green**

Run: `cd android && ./gradlew :app:testDebugUnitTest`
Expected: PASS — Tasks 2–10 unit tests all green.

- [ ] **Step 4: Commit**

```bash
git add android/README.md android/.gitignore
git commit -m "docs(android): add README; ignore build output"
```

---

## Self-Review

- **Spec coverage:**
  - Dumb-pipe client, no phone-side brain/safety → Tasks 8–12 (capture + forward only) ✅.
  - Flows + buffered Channel backbone → `OutboundChannel` (Task 7) + Service wiring (Task 11) ✅.
  - `FrameSource` seam (Mock/real/phone) → Tasks 8, 11 (GlassesFrameSource), 12 (PhoneCamera) ✅.
  - `FrameEncoder` raw→JPEG→data-URL, every frame, no client throttle → Tasks 3, 9 ✅.
  - `AudioEngine` session-long SCO + `Resampler` 16↔24 kHz → Tasks 4, 11 ✅.
  - `BridgeSocket` send hello/frame/audio/bye, typed inbound, reconnect+backoff, fresh hello
    → Tasks 5, 6, 10 ✅.
  - Reconnect drops stale frames (drop-oldest, clearFrames) → Tasks 7, 11 ✅.
  - Permissions, foreground service → Tasks 1 (manifest), 11–12 ✅.
  - `android/` subdir in this repo, separate from the Python suite → Task 1 ✅.
  - Testing: MockDevice + pure-JVM units + manual live-server run → Tasks 2–10 (units),
    11–12 (manual) ✅.
- **Placeholder scan:** No "TBD/TODO". Device-bound steps (11–12) intentionally specify
  behavior + a concrete manual verification rather than a unit assertion, because they need a
  device/SDK; the testable cores they depend on are fully TDD'd in Tasks 2–10.
- **Type consistency:** `RawFrame(bytes,width,height,format)`, `PixelFormat`, `FrameSource.frames():Flow<RawFrame>`,
  `FrameEncoder.encode(Flow<RawFrame>):Flow<String>`, `DataUrlCodec.toJpegDataUrl(ByteArray)`,
  `Resampler.resample(ShortArray,from,to)`, `Outbound.{Hello,Frame,Audio,Bye}`,
  `Inbound.{VisionContext,Subtitle,Escalation,AudioOut,AudioError}`, `WsCodec.encode/decode`,
  `Backoff.next/reset`, `OutboundChannel.offerFrame/offerAudio/clearFrames/close/drain`,
  `BridgeSocket(url,patient,sessionId).connect/send/close/inbound` — all consistent across tasks.

## Known unknowns (confirm at implementation)
- Meta SDK frame element's exact byte/format/dimension accessors (Task 11 Step 4–5) — not
  documented yet; verified against the `mwdat-camera` artifact and MockDevice during impl.
- Negotiated SCO sample rate on the target glasses (Task 11 Step 2) — read the actual
  `AudioRecord` rate rather than assuming 16 kHz.
- Meta toolkit Maven coordinates/version (Task 11 Step 1) — confirm against GitHub Packages.
