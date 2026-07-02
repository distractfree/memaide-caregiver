plugins {
    id("com.android.application") version "8.11.1" apply false
    // 2.2.0 to match the Meta Wearables DAT SDK's Kotlin metadata (mwdat 0.8.0 is compiled with 2.2.0).
    id("org.jetbrains.kotlin.android") version "2.2.0" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.2.0" apply false
}
