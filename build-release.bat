@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo === BeaconHost release build ===
echo.

call npm run tauri build
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)

set "TARGET=src-tauri\target\release"
set "BUNDLE=%TARGET%\bundle"
set "DEST=release"

if not exist "%DEST%\windows" mkdir "%DEST%\windows"
if not exist "%DEST%\linux" mkdir "%DEST%\linux"
if not exist "%DEST%\macos" mkdir "%DEST%\macos"

REM Windows
if exist "%TARGET%\minc.exe" copy /Y "%TARGET%\minc.exe" "%DEST%\windows\" >nul
for %%f in ("%BUNDLE%\nsis\*.exe") do copy /Y "%%f" "%DEST%\windows\" >nul
for %%f in ("%BUNDLE%\msi\*.msi") do copy /Y "%%f" "%DEST%\windows\" >nul

REM Linux: .deb, .rpm, .AppImage (built on Linux or copied from CI artifacts)
for %%f in ("%BUNDLE%\deb\*.deb") do copy /Y "%%f" "%DEST%\linux\" >nul
for %%f in ("%BUNDLE%\rpm\*.rpm") do copy /Y "%%f" "%DEST%\linux\" >nul
for %%f in ("%BUNDLE%\appimage\*.AppImage") do copy /Y "%%f" "%DEST%\linux\" >nul

REM macOS: .dmg (built on macOS or copied from CI artifacts)
for %%f in ("%BUNDLE%\dmg\*.dmg") do copy /Y "%%f" "%DEST%\macos\" >nul

echo.
echo === Copied to %CD%\%DEST% ===
echo.
echo [windows]
dir /B "%DEST%\windows" 2>nul
echo.
echo [linux]
dir /B "%DEST%\linux" 2>nul
echo.
echo [macos]
dir /B "%DEST%\macos" 2>nul
echo.

set "HAS_LINUX=0"
set "HAS_MACOS=0"
for %%f in ("%DEST%\linux\*") do set "HAS_LINUX=1"
for %%f in ("%DEST%\macos\*") do set "HAS_MACOS=1"

if "%HAS_LINUX%"=="0" if "%HAS_MACOS%"=="0" (
    echo Note: Linux and macOS installers cannot be built on Windows.
    echo       Push a version tag to build all platforms on GitHub Actions:
    echo.
    echo         git tag v0.1.0
    echo         git push origin v0.1.0
    echo.
    echo       Or upload Windows files manually:
    echo         gh release create v0.1.0 release\windows\* --title "BeaconHost v0.1.0"
    echo.
)

if /I "%~1"=="upload" (
    if "%~2"=="" (
        echo Usage: build-release.bat upload v0.1.0
        exit /b 1
    )
    where gh >nul 2>&1
    if errorlevel 1 (
        echo GitHub CLI ^(gh^) is not installed. Install from https://cli.github.com/
        exit /b 1
    )
    set "UPLOAD_FILES="
    for %%f in ("%DEST%\windows\*" "%DEST%\linux\*" "%DEST%\macos\*") do (
        if exist "%%f" set "UPLOAD_FILES=!UPLOAD_FILES! "%%f""
    )
    if "!UPLOAD_FILES!"=="" (
        echo No release files found in %DEST%
        exit /b 1
    )
    echo Uploading to GitHub Release %~2 ...
    gh release create %~2 !UPLOAD_FILES! ^
        --title "BeaconHost %~2" ^
        --notes "See the assets below to download and install BeaconHost."
    if errorlevel 1 exit /b 1
    echo Release uploaded.
)

endlocal
