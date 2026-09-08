@echo off
setlocal
cd /d "%~dp0"
set "STORAGE_STATE=playwright/.auth/aztek.json"

echo Checking Fellow Coin products and bundles in Aztek Tools...
call .\node_modules\.bin\playwright.cmd test aztek-fellow-coin.spec.ts --headed

echo.
pause
