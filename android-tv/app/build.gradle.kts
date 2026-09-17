import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val generatedAssetsDirectory = layout.buildDirectory.dir("generated/jaySquaredAssets").get().asFile
val generatedResourcesDirectory = layout.buildDirectory.dir("generated/jaySquaredResources").get().asFile

android {
    namespace = "com.elementalidad.jaysquared"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.elementalidad.jaysquared"
        minSdk = 24
        targetSdk = 36
        versionCode = 10101
        versionName = "1.1.1-tv1"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(generatedAssetsDirectory)
            res.srcDir(generatedResourcesDirectory)
        }
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
        // AGP 8.13.2 officially pairs with Gradle 8.13 and supports API 36.x.
        // Ignore newer SDKs installed on CI until this toolchain can target them.
        disable += setOf("AndroidGradlePluginVersion", "OldTargetApi")
        warningsAsErrors = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

val syncGameAssets by tasks.registering(Sync::class) {
    from(rootProject.file("../jay-squared.html"))
    from(rootProject.file("../assets")) {
        include("favicon.ico", "favicon.svg")
        into("assets")
    }
    into(generatedAssetsDirectory)
}

val syncTvResources by tasks.registering(Sync::class) {
    from(rootProject.file("../docs/title.en.png")) {
        rename { "tv_banner.png" }
    }
    into(generatedResourcesDirectory.resolve("drawable-nodpi"))
}

tasks.named("preBuild") {
    dependsOn(syncGameAssets, syncTvResources)
}

dependencies {
    implementation("androidx.webkit:webkit:1.17.0")
}
