import java.util.Properties

pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

// GitHub PAT (read:packages) for the Meta Wearables DAT toolkit on GitHub Packages.
// Supplied via the GITHUB_TOKEN env var or a `github_token` line in local.properties
// (gitignored — never commit the token). Absent token = the mwdat deps stay off
// (see app/build.gradle.kts), so the build still resolves without one.
val localProperties = Properties().apply {
    val f = File(rootDir, "local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
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

rootProject.name = "MemAid"
include(":app")
include(":wear")
