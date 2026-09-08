@echo off
setlocal
cd /d "%~dp0"
set "STORAGE_STATE=playwright/.auth/tosm.json"

echo Checking Rank Flash Sale...
call .\node_modules\.bin\playwright.cmd test tests/rank-flash-sale.spec.ts --headed

echo.
pause
