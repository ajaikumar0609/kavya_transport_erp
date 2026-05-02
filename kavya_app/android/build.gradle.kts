allprojects {
    repositories {
        google()
        mavenCentral()
    }
    configurations.all {
        resolutionStrategy {
            // android-maps-utils:4.1.0 compiled with Kotlin 2.3.x (metadata 2.3.0).
            // Force 4.0.0 (Feb 2024, Kotlin 1.9.x era) — compatible with Gradle 8.12's
            // embedded Kotlin 2.0.21 compiler which reads metadata up to 2.1.0.
            force("com.google.maps.android:android-maps-utils:4.0.0")
            // Pin kotlin-stdlib to 2.1.21 to stop any transitive dep (firebase, etc.)
            // from pulling 2.2.0 or 2.3.x onto the compile classpath.
            force("org.jetbrains.kotlin:kotlin-stdlib:2.1.21")
            force("org.jetbrains.kotlin:kotlin-stdlib-jdk7:2.1.21")
            force("org.jetbrains.kotlin:kotlin-stdlib-jdk8:2.1.21")
        }
    }
}

val newBuildDir: Directory = rootProject.layout.buildDirectory.dir("../../build").get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}