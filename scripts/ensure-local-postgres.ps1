$ErrorActionPreference = 'Stop'
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$pgRoot = 'C:\Program Files\PostgreSQL\16'
$binDir = Join-Path $pgRoot 'bin'
$localRoot = Join-Path $env:LOCALAPPDATA 'KaguWeb\postgres-16'
$dataDir = Join-Path $localRoot 'data'
$logFile = Join-Path $localRoot 'server.log'
$passwordFile = Join-Path $localRoot 'bootstrap-password.txt'
$pgHost = 'localhost'
$port = 5432
$dbName = 'kagu'
$dbUser = 'postgres'
$dbPassword = 'postgres'

function Test-ProcessAlive {
  param(
    [int]$ProcessId
  )

  try {
    Get-Process -Id $ProcessId -ErrorAction Stop | Out-Null
    return $true
  }
  catch {
    return $false
  }
}

function Invoke-PgCommand {
  param(
    [string]$Executable,
    [string[]]$Arguments
  )

  & (Join-Path $binDir $Executable) @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Executable failed with code $LASTEXITCODE"
  }
}

function Clear-StalePostmasterPid {
  $pidFile = Join-Path $dataDir 'postmaster.pid'
  if (!(Test-Path $pidFile)) {
    return
  }

  $pidLine = Get-Content $pidFile -TotalCount 1 -ErrorAction SilentlyContinue
  $pidValue = 0
  $isPid = [int]::TryParse($pidLine, [ref]$pidValue)
  if ($isPid -and (Test-ProcessAlive -ProcessId $pidValue)) {
    return
  }

  Remove-Item $pidFile -Force
}

function Resolve-StartupLogFile {
  try {
    $stream = [System.IO.File]::Open($logFile, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
    $stream.Close()
    return $logFile
  }
  catch {
    return Join-Path $localRoot ("server-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  }
}

if (!(Test-Path (Join-Path $binDir 'pg_ctl.exe'))) {
  throw "PostgreSQL 16 binary bulunamadi: $binDir"
}

New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
$env:PGPASSWORD = $dbPassword

$null = & (Join-Path $binDir 'pg_isready.exe') -h $pgHost -p $port -U $dbUser 2>$null
$isReadyExitCode = $LASTEXITCODE
$needsInit = !(Test-Path (Join-Path $dataDir 'PG_VERSION'))

if ($needsInit) {
  if (Test-Path $dataDir) {
    Remove-Item $dataDir -Recurse -Force
  }

  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  Set-Content -Path $passwordFile -Value $dbPassword -Encoding ascii

  try {
    Invoke-PgCommand 'initdb.exe' @(
      "--pgdata=$dataDir",
      "--username=$dbUser",
      '--encoding=UTF8',
      "--pwfile=$passwordFile",
      '--auth=scram-sha-256',
      '--no-locale'
    )
  }
  finally {
    Remove-Item $passwordFile -Force -ErrorAction SilentlyContinue
  }
}

if ($isReadyExitCode -ne 0) {
  Clear-StalePostmasterPid
  $startupLogFile = Resolve-StartupLogFile
  Invoke-PgCommand 'pg_ctl.exe' @(
    'start',
    '-D',
    $dataDir,
    '-l',
    $startupLogFile,
    '-w',
    '-o',
    "-p $port"
  )
  $logFile = $startupLogFile
}

$databaseExists = & (Join-Path $binDir 'psql.exe') -h $pgHost -p $port -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$dbName';"
if ($LASTEXITCODE -ne 0) {
  throw "Database existence check failed with code $LASTEXITCODE"
}

$databaseExistsValue = if ($null -eq $databaseExists) { '' } else { [string]$databaseExists }
if ($databaseExistsValue.Trim() -ne '1') {
  Invoke-PgCommand 'createdb.exe' @('-h', $pgHost, '-p', "$port", '-U', $dbUser, $dbName)
}

Write-Output "LOCAL_POSTGRES_READY"
Write-Output "ROOT=$localRoot"
Write-Output "DATA=$dataDir"
Write-Output "LOG=$logFile"
Write-Output "DATABASE=$dbName"
exit 0
