@echo off
setlocal
cd /d "%~dp0"
set "STORAGE_STATE=playwright/.auth/aztek.json"
set "PWDEBUG=1"

echo Opening Playwright Inspector for the Aztek Fellow Coin check...
call .\node_modules\.bin\playwright.cmd test aztek-fellow-coin.spec.ts --headed

echo.
pause
