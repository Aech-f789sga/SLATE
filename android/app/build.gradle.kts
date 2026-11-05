import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Signing credentials live in keystore.properties (git-ignored), or in the
// environment when the build runs on CI.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) FileInputStream(keystorePropsFile).use { load(it) }
}

fun secret(key: String, envName: String): String? =
    keystoreProps.getProperty(key) ?: System.getenv(envName)

val versionCodeProp = (project.findProperty("slateVersionCode") as String?)?.toIntOrNull() ?: 1
val versionNameProp = (project.findProperty("slateVersionName") as String?) ?: "1.0.0"
val defaultUrlProp = (project.findProperty("slateDefaultUrl") as String?)
    ?: "https://slate-omega-henna.vercel.app"
val googleClientIdProp = (project.findProperty("slateGoogleClientId") as String?) ?: ""

android {
    namespace = "app.slate.notes"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.slate.notes"
        minSdk = 26
        targetSdk = 34
        versionCode = versionCodeProp
        versionName = versionNameProp

        resValue("string", "slate_default_url", defaultUrlProp)
        resValue("string", "slate_google_client_id", googleClientIdProp)
    }

    signingConfigs {
        create("release") {
            val storePath = secret("storeFile", "SLATE_STORE_FILE")
            if (storePath != null) {
                storeFile = rootProject.file(storePath)
                storePassword = secret("storePassword", "SLATE_STORE_PASSWORD")
                keyAlias = secret("keyAlias", "SLATE_KEY_ALIAS")
                keyPassword = secret("keyPassword", "SLATE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (secret("storeFile", "SLATE_STORE_FILE") != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources.excludes += setOf(
            "META-INF/AL2.0",
            "META-INF/LGPL2.1",
            "META-INF/*.kotlin_module"
        )
    }

    lint {
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Native Google Sign-In (Credential Manager). Only used when
    // slateGoogleClientId is configured; harmless otherwise.
    implementation("androidx.credentials:credentials:1.2.2")
    implementation("androidx.credentials:credentials-play-services-auth:1.2.2")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
}
