$ErrorActionPreference = 'Stop'
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot 'runtime'
$apiOutLog = Join-Path $runtimeDir 'api-dev.log'
$apiErrLog = Join-Path $runtimeDir 'api-dev.err.log'
$webOutLog = Join-Path $runtimeDir 'web-dev.log'
$webErrLog = Join-Path $runtimeDir 'web-dev.err.log'

function Resolve-LogPath {
  param(
    [string]$PreferredPath
  )

  try {
    $stream = [System.IO.File]::Open($PreferredPath, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
    $stream.Close()
    return $PreferredPath
  }
  catch {
    $directory = Split-Path -Parent $PreferredPath
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($PreferredPath)
    $extension = [System.IO.Path]::GetExtension($PreferredPath)
    return Join-Path $directory ("{0}-{1}{2}" -f $baseName, (Get-Date -Format 'yyyyMMdd-HHmmss'), $extension)
  }
}

function Get-ListeningProcess {
  param(
    [int]$Port
  )

  $pattern = "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$"
  $match = netstat -ano -p tcp | Select-String -Pattern $pattern | Select-Object -First 1
  if (!$match) {
    return $null
  }

  $processId = [int]$match.Matches[0].Groups[1].Value
  try {
    $process = Get-Process -Id $processId -ErrorAction Stop
    return [PSCustomObject]@{
      Port = $Port
      Pid = $processId
      ProcessName = $process.ProcessName
    }
  }
  catch {
    return [PSCustomObject]@{
      Port = $Port
      Pid = $processId
      ProcessName = 'unknown'
    }
  }
}

function Wait-ForListeningPort {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $listener = Get-ListeningProcess -Port $Port
    if ($listener) {
      return $listener
    }

    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  throw "Port $Port belirtilen sure icinde acilmadi."
}

function Start-DevProcess {
  param(
    [string]$ScriptName,
    [int]$Port,
    [string]$StdoutPath,
    [string]$StderrPath
  )

  $listener = Get-ListeningProcess -Port $Port
  if ($listener) {
    Write-Output ("ALREADY_RUNNING name={0} port={1} pid={2} process={3}" -f $ScriptName, $Port, $listener.Pid, $listener.ProcessName)
    return [PSCustomObject]@{
      Port = $Port
      Pid = $listener.Pid
      ProcessName = $listener.ProcessName
      StdoutPath = $StdoutPath
      StderrPath = $StderrPath
    }
  }

  $resolvedStdout = Resolve-LogPath -PreferredPath $StdoutPath
  $resolvedStderr = Resolve-LogPath -PreferredPath $StderrPath

  $process = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList 'run', $ScriptName `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $resolvedStdout `
    -RedirectStandardError $resolvedStderr `
    -PassThru

  $listener = Wait-ForListeningPort -Port $Port
  Write-Output ("STARTED name={0} port={1} pid={2} bootstrapPid={3} stdout={4} stderr={5}" -f $ScriptName, $Port, $listener.Pid, $process.Id, $resolvedStdout, $resolvedStderr)
  return [PSCustomObject]@{
    Port = $Port
    Pid = $listener.Pid
    ProcessName = $listener.ProcessName
    StdoutPath = $resolvedStdout
    StderrPath = $resolvedStderr
  }
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

Write-Output 'STEP ensure-local-postgres'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ensure-local-postgres.ps1')
if ($LASTEXITCODE -ne 0) {
  throw "Yerel PostgreSQL hazirlanamadi."
}

$apiAlreadyRunning = Get-ListeningProcess -Port 4000
if ($apiAlreadyRunning) {
  Write-Output ("STEP skip-prisma api-already-running pid={0}" -f $apiAlreadyRunning.Pid)
}
else {
  Write-Output 'STEP prisma-generate'
  & npm.cmd run prisma:generate
  if ($LASTEXITCODE -ne 0) {
    throw "Prisma generate basarisiz oldu."
  }

  Write-Output 'STEP db-init'
  & npm.cmd run db:init
  if ($LASTEXITCODE -ne 0) {
    throw "Migration uygulamasi basarisiz oldu."
  }
}

$apiStatus = Start-DevProcess -ScriptName 'dev:api' -Port 4000 -StdoutPath $apiOutLog -StderrPath $apiErrLog
$webStatus = Start-DevProcess -ScriptName 'dev:web' -Port 3000 -StdoutPath $webOutLog -StderrPath $webErrLog

Write-Output ("READY postgres=5432 api={0} web={1}" -f $apiStatus.Pid, $webStatus.Pid)
Write-Output "WEB_URL=http://localhost:3000/login"
Write-Output "API_URL=http://localhost:4000"
Write-Output "API_LOG=$($apiStatus.StdoutPath)"
Write-Output "WEB_LOG=$($webStatus.StdoutPath)"
