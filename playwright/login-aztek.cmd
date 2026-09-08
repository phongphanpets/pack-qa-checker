@echo off
setlocal
cd /d "%~dp0"
set "STORAGE_STATE=playwright/.auth/aztek.json"

echo Opening Aztek Tools in Microsoft Edge...
echo Log in manually, then keep this window open until the session is saved.
call .\node_modules\.bin\playwright.cmd test -c playwright.auth.config.ts aztek-auth.setup.ts --headed --project=edge

echo.
pause
