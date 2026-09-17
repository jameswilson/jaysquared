import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val generatedAssetsDirectory = layout.buildDirectory.dir("generated/jaySquaredAssets").get().asFile
val configuredVersionCode: String? = providers.gradleProperty("jaySquaredVersionCode").orNull
val jaySquaredVersionCode: Int = configuredVersionCode?.toInt() ?: 10101
val jaySquaredVersionName: String =
    providers.gradleProperty("jaySquaredVersionName").orNull ?: "1.1.1-tv1"

require(jaySquaredVersionCode > 0) { "jaySquaredVersionCode must be positive" }
require(jaySquaredVersionName.isNotBlank()) { "jaySquaredVersionName must not be blank" }

android {
    namespace = "com.elementalidad.jaysquared"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.elementalidad.jaysquared"
        minSdk = 24
        targetSdk = 36
        versionCode = jaySquaredVersionCode
        versionName = jaySquaredVersionName
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

tasks.named("preBuild") {
    dependsOn(syncGameAssets)
}

dependencies {
    implementation("androidx.webkit:webkit:1.17.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20260814")
}
