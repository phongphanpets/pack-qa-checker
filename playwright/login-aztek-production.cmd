@echo off
setlocal
cd /d "%~dp0"
set "STORAGE_STATE=playwright/.auth/aztek-production.json"
set "AZTEK_URL=https://aztek-tools.exe.in.th/exe/dashboard"

echo Opening Aztek Tools production in Microsoft Edge...
echo Complete Cloudflare verification and log in manually.
echo Keep this window open until the Aztek dashboard appears.
call .\node_modules\.bin\playwright.cmd test -c playwright.auth.config.ts aztek-auth.setup.ts --headed --project=edge

echo.
pause
