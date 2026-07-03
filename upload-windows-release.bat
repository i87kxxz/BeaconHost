@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "TAG=v0.1.0"
set "DEST=release\windows"
set "TITLE=BeaconHost %TAG%"

where gh >nul 2>&1
if errorlevel 1 (
    echo GitHub CLI not found. Install: winget install GitHub.cli
    exit /b 1
)

gh auth status >nul 2>&1
if errorlevel 1 (
    echo Not logged in. Run: gh auth login
    gh auth login
    if errorlevel 1 exit /b 1
)

if not exist "%DEST%\BeaconHost_0.1.0_x64-setup.exe" (
    echo Missing Windows build. Run: build-release.bat
    exit /b 1
)

echo Uploading Windows release %TAG% ...
gh release view %TAG% >nul 2>&1
if errorlevel 1 (
    gh release create %TAG% ^
        "%DEST%\BeaconHost_0.1.0_x64-setup.exe" ^
        "%DEST%\BeaconHost_0.1.0_x64_en-US.msi" ^
        --title "%TITLE%" ^
        --notes "Windows installers for BeaconHost. Linux builds will be added separately."
) else (
    gh release upload %TAG% ^
        "%DEST%\BeaconHost_0.1.0_x64-setup.exe" ^
        "%DEST%\BeaconHost_0.1.0_x64_en-US.msi" ^
        --clobber
)

if errorlevel 1 exit /b 1
echo.
echo Done: https://github.com/i87kxxz/BeaconHost/releases/tag/%TAG%
endlocal
