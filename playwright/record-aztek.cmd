@echo off
setlocal
cd /d "%~dp0"

if not exist "playwright\.auth\aztek.json" (
  echo Please run login-aztek.cmd first.
  echo.
  pause
  exit /b 1
)

echo Opening Playwright Recorder for Aztek Tools...
call .\node_modules\.bin\playwright.cmd codegen --channel=msedge --load-storage=playwright/.auth/aztek.json --target=playwright-test https://aztek-tools-v2.exe.in.th/exe/dashboard

echo.
pause
