# PowerShell script to build the web client and generate the Android APK

$ErrorActionPreference = "Stop"

Write-Host "1/4: Building client web assets..." -ForegroundColor Cyan
Push-Location "../client"
npm run build
Pop-Location

Write-Host "`n2/4: Syncing web assets to Capacitor Android project..." -ForegroundColor Cyan
npx cap sync android

Write-Host "`n3/4: Compiling Android APK with Gradle..." -ForegroundColor Cyan
Push-Location "android"
cmd.exe /c "gradlew.bat assembleDebug"
Pop-Location

Write-Host "`n4/4: Copying generated APK to the android app root folder..." -ForegroundColor Cyan
$apkSource = "android/app/build/outputs/apk/debug/app-debug.apk"
$apkDest = "softspace.apk"

if (Test-Path $apkSource) {
    Copy-Item $apkSource $apkDest -Force
    $fullPath = (Get-Item $apkDest).FullName
    Write-Host "`n[SUCCESS] APK built successfully! File path: $fullPath" -ForegroundColor Green
} else {
    Write-Host "`n[ERROR] APK file was not found at $apkSource. The build might have failed." -ForegroundColor Red
    exit 1
}
