import java.util.Properties

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

// GitHub PAT (read:packages) for the Meta Wearables DAT toolkit on GitHub Packages.
// Supplied via the GITHUB_TOKEN env var or a `github_token` line in local.properties
// (gitignored — never commit the token). Absent token = the mwdat deps stay off (see app/build.gradle.kts).
val localProperties = Properties().apply {
    val f = File(rootDir, "local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven {
            url = uri("https://maven.pkg.github.com/facebook/meta-wearables-dat-android")
            credentials {
                username = "" // not needed; token auth only
                password = System.getenv("GITHUB_TOKEN")
                    ?: localProperties.getProperty("github_token")
            }
        }
    }
}
rootProject.name = "memaide-bridge"
include(":app")
