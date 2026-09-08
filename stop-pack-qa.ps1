$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeRoot = Join-Path $projectRoot ".runtime"

function Test-PackQaEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [Parameter(Mandatory = $true)]
        [string]$Marker
    )

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content -match $Marker
    }
    catch {
        return $false
    }
}

function Get-ListeningProcessId {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    $lines = & netstat.exe -ano -p TCP 2>$null
    foreach ($line in $lines) {
        if ($line -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
            return [int]$Matches[1]
        }
    }
    return $null
}

function Stop-PackQaBackgroundProcesses {
    $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $byId = @{}
    foreach ($process in $processes) {
        $byId[[int]$process.ProcessId] = $process
    }

    $targets = New-Object System.Collections.Generic.HashSet[int]
    $seeds = @($processes | Where-Object {
        $_.ProcessId -ne $PID -and (
            ($_.CommandLine -like "*$projectRoot*" -and $_.Name -match '^(node|workerd|cmd)\.exe$') -or
            ($_.CommandLine -match '\-m\s+packqa\s+serve-api')
        )
    })

    foreach ($seed in $seeds) {
        [void]$targets.Add([int]$seed.ProcessId)

        $parentId = [int]$seed.ParentProcessId
        while ($parentId -and $byId.ContainsKey($parentId)) {
            $parent = $byId[$parentId]
            if ($parent.Name -notmatch '^(node|workerd|cmd)\.exe$') {
                break
            }
            [void]$targets.Add($parentId)
            $parentId = [int]$parent.ParentProcessId
        }
    }

    $added = $true
    while ($added) {
        $added = $false
        foreach ($process in $processes) {
            if ($targets.Contains([int]$process.ParentProcessId) -and -not $targets.Contains([int]$process.ProcessId)) {
                [void]$targets.Add([int]$process.ProcessId)
                $added = $true
            }
        }
    }

    foreach ($processId in @($targets)) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }

    if ($targets.Count -gt 0) {
        Start-Sleep -Milliseconds 400
        Write-Host "[OK] Pack QA background processes stopped." -ForegroundColor Green
    }
}

function Stop-PackQaService {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port,
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [Parameter(Mandatory = $true)]
        [string]$Marker,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $processId = Get-ListeningProcessId -Port $Port
    if (-not $processId) {
        Write-Host "[OK] $Name is already stopped." -ForegroundColor DarkGray
        return
    }
    if (-not (Test-PackQaEndpoint -Url $Url -Marker $Marker)) {
        Write-Host "[SKIP] Port $Port is not identified as Pack QA." -ForegroundColor Yellow
        return
    }

    Stop-Process -Id $processId -Force
    Write-Host "[OK] $Name stopped." -ForegroundColor Green
}

Write-Host "Stopping Pack QA..." -ForegroundColor Cyan
Stop-PackQaBackgroundProcesses
Stop-PackQaService `
    -Port 3000 `
    -Url "http://localhost:3000" `
    -Marker "Pack QA" `
    -Name "Pack QA web"
Stop-PackQaService `
    -Port 8765 `
    -Url "http://127.0.0.1:8765/api/health" `
    -Marker '"app"\s*:\s*"pack-qa"' `
    -Name "Pack QA API"

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
Write-Host "Pack QA is closed. You can now copy the data folder." -ForegroundColor Cyan
Start-Sleep -Seconds 2
