import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// Secrets live in local.properties (gitignored). The GitHub PAT gates the Meta Wearables
// DAT SDK download; the Meta app id / client token feed manifest placeholders used for the
// SDK's runtime attestation.
val localProps = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
// Treat a blank value the same as absent. The glasses source files import the SDK directly, so
// the app only fully compiles once a real token is present; this guard just avoids a confusing
// GitHub Packages 401 while the local.properties placeholder is still empty.
val githubToken: String? = (System.getenv("GITHUB_TOKEN") ?: localProps.getProperty("github_token"))
    ?.takeIf { it.isNotBlank() }

android {
    namespace = "com.example.memaid"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.example.memaid"
        // Meta Wearables DAT requires Android 10+ (API 29).
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Meta Wearables DAT attestation, injected into AndroidManifest meta-data.
        manifestPlaceholders["mwdat_application_id"] = localProps.getProperty("mwdat_application_id") ?: ""
        manifestPlaceholders["mwdat_client_token"] = localProps.getProperty("mwdat_client_token") ?: ""
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
        implementation(platform(libs.androidx.compose.bom))
        implementation(libs.androidx.core.ktx)
        implementation(libs.androidx.lifecycle.runtime.ktx)
        implementation(libs.androidx.activity.compose)
        implementation(libs.androidx.compose.ui)
        implementation(libs.androidx.compose.ui.graphics)
        implementation(libs.androidx.compose.ui.tooling.preview)
        implementation(libs.androidx.compose.material3)

        // These 3 added directly to avoid version catalog naming issues
        implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")
        implementation("androidx.compose.material:material-icons-extended:1.7.8")
        implementation("androidx.navigation:navigation-compose:2.9.0")
        implementation("org.altbeacon:android-beacon-library:2.19.6")
        implementation("com.google.android.gms:play-services-wearable:18.2.0")
        implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")


        testImplementation(libs.junit)
        androidTestImplementation(platform(libs.androidx.compose.bom))
        androidTestImplementation(libs.androidx.compose.ui.test.junit4)
        androidTestImplementation(libs.androidx.espresso.core)
        androidTestImplementation(libs.androidx.junit)
        debugImplementation(libs.androidx.compose.ui.test.manifest)
        debugImplementation(libs.androidx.compose.ui.tooling)

    // Networking — Retrofit + Moshi (JSON converter)
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Coroutines (for async network calls)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Meta Wearables Device Access Toolkit (GitHub Packages). Gated on the PAT so a checkout
    // without a token still configures; drop `github_token` into local.properties to activate.
    // The glasses capture/registration code references these, so the app only builds once a
    // token is present. Coordinates/version confirmed against facebook/meta-wearables-dat-android v0.8.0.
    if (githubToken != null) {
        implementation("com.meta.wearable:mwdat-core:0.8.0")
        implementation("com.meta.wearable:mwdat-camera:0.8.0")
        implementation("com.meta.wearable:mwdat-mockdevice:0.8.0")
    }

    // Local unit tests for the pure frame-conversion helpers (Robolectric stubs android.* APIs).
    testImplementation("org.robolectric:robolectric:4.15.1")
    testImplementation("androidx.test:core:1.6.1")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
    }