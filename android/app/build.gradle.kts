import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Secrets live in local.properties (gitignored). The GitHub PAT gates the SDK download;
// the Meta app id / client token feed manifest placeholders for runtime attestation.
val localProps = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
// Meta Wearables DAT requires Android 10+ (API 29). Present only when a GitHub PAT is available.
val githubToken: String? = System.getenv("GITHUB_TOKEN") ?: localProps.getProperty("github_token")

android {
    namespace = "com.memaide.bridge"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.memaide.bridge"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "0.1"
        // Meta Wearables DAT attestation, injected into AndroidManifest meta-data.
        manifestPlaceholders["mwdat_application_id"] = localProps.getProperty("mwdat_application_id") ?: ""
        manifestPlaceholders["mwdat_client_token"] = localProps.getProperty("mwdat_client_token") ?: ""
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

    // Meta Wearables Device Access Toolkit (GitHub Packages). Gated on the PAT so the pure-JVM
    // unit-test build stays green without a token; drop `github_token` into local.properties to
    // activate. Coordinates/version confirmed against facebook/meta-wearables-dat-android (v0.8.0).
    if (githubToken != null) {
        implementation("com.meta.wearable:mwdat-core:0.8.0")
        implementation("com.meta.wearable:mwdat-camera:0.8.0")
        implementation("com.meta.wearable:mwdat-mockdevice:0.8.0")
    }

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.robolectric:robolectric:4.15.1")
    testImplementation("androidx.test:core:1.6.1")
}
