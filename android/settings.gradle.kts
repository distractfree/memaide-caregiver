pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        // Meta Wearables DAT toolkit (GitHub Packages) is added at Task 11 with credentials.
    }
}
rootProject.name = "memaide-bridge"
include(":app")
