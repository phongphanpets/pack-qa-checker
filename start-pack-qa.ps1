$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$webRoot = Join-Path $projectRoot "web"
$runtimeRoot = Join-Path $projectRoot ".runtime"
$userProfile = [Environment]::GetFolderPath("UserProfile")
$pythonPath = Join-Path $userProfile ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$apiHealthUrl = "http://127.0.0.1:8765/api/health"
$webUrl = "http://localhost:3000"

function Test-PackQaEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Wait-PackQaEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [int]$Seconds = 35
    )

    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PackQaEndpoint -Url $Url) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Stop-WithMessage {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    Write-Host ""
    Write-Host $Message -ForegroundColor Red
    Write-Host "See the .runtime folder for details." -ForegroundColor Yellow
    Read-Host "Press Enter to close"
    exit 1
}

if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    Stop-WithMessage "Pack QA Python runtime was not found."
}
if (-not (Test-Path -LiteralPath (Join-Path $webRoot "package.json") -PathType Leaf)) {
    Stop-WithMessage "Pack QA web files were not found."
}

$npmCommand = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    Stop-WithMessage "Node.js / npm was not found."
}

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null

Write-Host "Starting Pack QA..." -ForegroundColor Cyan

if (-not (Test-PackQaEndpoint -Url $apiHealthUrl)) {
    $apiOutLog = Join-Path $runtimeRoot "api.log"
    $apiErrorLog = Join-Path $runtimeRoot "api-error.log"
    Start-Process `
        -FilePath $pythonPath `
        -ArgumentList @("-m", "packqa", "serve-api", "--port", "8765") `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $apiOutLog `
        -RedirectStandardError $apiErrorLog | Out-Null
}

if (-not (Wait-PackQaEndpoint -Url $apiHealthUrl)) {
    Stop-WithMessage "Pack QA API could not start."
}
Write-Host "[OK] Validation API is ready." -ForegroundColor Green

if (-not (Test-PackQaEndpoint -Url $webUrl)) {
    $webOutLog = Join-Path $runtimeRoot "web.log"
    $webErrorLog = Join-Path $runtimeRoot "web-error.log"
    Start-Process `
        -FilePath $npmCommand.Source `
        -ArgumentList @("run", "dev") `
        -WorkingDirectory $webRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $webOutLog `
        -RedirectStandardError $webErrorLog | Out-Null
}

if (-not (Wait-PackQaEndpoint -Url $webUrl -Seconds 45)) {
    Stop-WithMessage "Pack QA web could not start."
}
Write-Host "[OK] Pack QA web is ready." -ForegroundColor Green
Write-Host "Opening Pack QA..." -ForegroundColor Cyan
Start-Process $webUrl
