plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.goatstream.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.goatstream.tv"
        minSdk = 23
        targetSdk = 35
        // Release builds (GitHub Actions) pass -PversionName=1.2.0 so the TV can tell when an update is newer
        val vName = (project.findProperty("versionName") as String?) ?: "1.0.0"
        versionName = vName
        versionCode = vName.split(".").map { it.toIntOrNull() ?: 0 }.let { (it + listOf(0, 0, 0)).take(3) }
            .let { (a, b, c) -> a * 10000 + b * 100 + c }
    }

    // Updates only install over the old app if every version is signed with the SAME key.
    // GitHub Actions provides it from repository secrets; local builds fall back to the debug key.
    val ks = System.getenv("GOAT_KEYSTORE")
    signingConfigs {
        if (ks != null && file(ks).exists()) {
            create("goat") {
                storeFile = file(ks)
                storePassword = System.getenv("GOAT_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("GOAT_KEY_ALIAS")
                keyPassword = System.getenv("GOAT_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("goat") ?: signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    // The UI is the shared ../../web folder, copied in at build time
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/goatweb"))
}

val copyWeb by tasks.registering(Sync::class) {
    from(rootProject.file("../web"))
    into(layout.buildDirectory.dir("generated/goatweb/web"))
}
tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    val media3 = "1.5.1"
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-ui:$media3")
    implementation("androidx.media3:media3-datasource:$media3")
}
