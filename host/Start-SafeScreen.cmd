@echo off
rem Starts the SafeScreen host and opens the app window.
cd /d "%~dp0"
if exist SafeScreenHost.exe (
  start "" SafeScreenHost.exe
) else (
  python safescreen_host.py %*
)
