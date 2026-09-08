@echo off
setlocal
cd /d "%~dp0"

echo Opening TOSM login in Microsoft Edge...
echo Complete Cloudflare verification manually, then log in.
call .\node_modules\.bin\playwright.cmd test -c playwright.auth.config.ts tosm-auth.setup.ts --headed --project=edge

echo.
pause
