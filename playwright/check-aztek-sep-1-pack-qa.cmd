@echo off
setlocal
cd /d "%~dp0"
set "STORAGE_STATE=playwright/.auth/aztek.json"

echo Creating a PASS / FAIL / REVIEW / BLOCKED QA report...
call .\node_modules\.bin\playwright.cmd test aztek-sep-1-automated-report.spec.ts --headed

if exist "%CD%\qa-reports\latest.html" (
  echo Opening the latest QA report...
  start "" "%CD%\qa-reports\latest.html"
) else (
  echo The QA report was not created. Please check the error above.
)

echo.
pause
