$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path (Join-Path $ScriptDir "..")
Set-Location $Root

$LocalDir = Join-Path $Root "vibex-local"
$PbDir = Join-Path $Root "pocketbase"
$PbLogDir = Join-Path $PbDir "logs"
$PbBin = Join-Path $LocalDir "bin\windows\pocketbase.exe"
New-Item -ItemType Directory -Force -Path $PbDir, (Join-Path $PbDir "pb_data"), (Join-Path $PbDir "pb_hooks"), (Join-Path $PbDir "pb_migrations"), $PbLogDir, (Split-Path -Parent $PbBin) | Out-Null

$EnvFile = Join-Path $Root ".env.local"
$EnvExample = Join-Path $LocalDir ".env.local.example"
if (!(Test-Path $EnvFile) -and (Test-Path $EnvExample)) {
  Copy-Item $EnvExample $EnvFile
}
if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith("#") -or !$line.Contains("=")) { return }
    $idx = $line.IndexOf("=")
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim().Trim('"')
    if ($name) { [Environment]::SetEnvironmentVariable($name, $value, "Process") }
  }
}
if (!$env:VIBEX_APP_ID) { $env:VIBEX_APP_ID = "app-ca81449e917d4660aa213c5c13d47008" }

function Ensure-PocketBase {
  if (Test-Path $PbBin) {
    try {
      & $PbBin --version *> $null
      if ($LASTEXITCODE -eq 0) { return }
    } catch {}
    Remove-Item $PbBin -Force
  }
  Write-Host "Downloading PocketBase for Windows..."
  $release = Invoke-RestMethod "https://api.github.com/repos/pocketbase/pocketbase/releases/latest"
  $asset = $release.assets | Where-Object { $_.name -match "windows_amd64.zip$" } | Select-Object -First 1
  if (!$asset) { throw "Could not resolve PocketBase windows_amd64 release asset." }
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("vibex-pb-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $zip = Join-Path $tmp "pocketbase.zip"
  Invoke-WebRequest $asset.browser_download_url -OutFile $zip
  Expand-Archive $zip -DestinationPath $tmp -Force
  Move-Item (Join-Path $tmp "pocketbase.exe") $PbBin -Force
  Remove-Item $tmp -Recurse -Force
}

function Assert-NodeVersion {
  $versionOutput = & node -p "process.versions.node" 2>&1
  $nodeExitCode = $LASTEXITCODE
  if ($nodeExitCode -ne 0) {
    throw "Could not read the Node.js version (exit code $nodeExitCode)."
  }
  $version = ($versionOutput -join [Environment]::NewLine).Trim()
  if (!$version -or $version -notmatch '^\d+\.\d+') {
    throw "Could not parse the Node.js version returned by node: $version"
  }
  $parts = $version.Split(".")
  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  $ok = (($major -eq 20 -and $minor -ge 19) -or ($major -eq 22 -and $minor -ge 12) -or ($major -gt 22))
  if (!$ok) {
    throw "Node.js 20.19+ or 22.12+ is required by this export. Install a newer Node.js, then run this script again."
  }
}

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string[]]$CommandArgs = @(),
    [Parameter(Mandatory = $true)][string]$FailureMessage
  )

  # Capture output locally so it cannot become a function return value, then
  # forward it to the console without emitting success-stream objects.
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Native stderr is a normal diagnostic stream for npm/pnpm/corepack. Do
    # not let PS5 promote it to a terminating error; use the exit code below.
    $ErrorActionPreference = "Continue"
    $output = & $Command @CommandArgs 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  foreach ($line in $output) { Write-Host $line }
  if ($exitCode -ne 0) {
    throw "$FailureMessage (exit code $exitCode)."
  }
}

function Ensure-NodePm {
  if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 20.19+ or 22.12+ is required. Install Node.js, then run this script again."
  }
  Assert-NodeVersion
  if (Test-Path (Join-Path $Root "pnpm-lock.yaml")) {
    $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if (!$pnpm) {
      $corepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue
      if ($corepack) {
        Invoke-NativeCommand $corepack.Source @("enable") "Corepack could not enable package managers"
        Invoke-NativeCommand $corepack.Source @("prepare", "pnpm@latest", "--activate") "Corepack could not activate pnpm"
        $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
        if (!$pnpm) {
          throw "Corepack enabled successfully, but pnpm.cmd is still unavailable."
        }
      } else {
        throw "pnpm.cmd is required for this project. Install pnpm or Corepack, then run again."
      }
    }
    Invoke-NativeCommand $pnpm.Source @("install") "pnpm install failed"
    return @($pnpm.Source, "exec", "vite")
  }
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (!$npm) {
    throw "npm.cmd is required for this project. Install Node.js, then run again."
  }
  Invoke-NativeCommand $npm.Source @("install") "npm install failed"
  return @($npm.Source, "exec", "vite", "--")
}

function Show-PocketBaseLogTail {
  $stderr = Join-Path $PbLogDir "stderr.log"
  if (Test-Path $stderr) { Get-Content $stderr -Tail 80 | ForEach-Object { Write-Host $_ } }
}

function Test-PocketBaseHealth {
  try {
    $health = Invoke-RestMethod "http://127.0.0.1:7000/api/health" -TimeoutSec 1
    return ($health.message -eq "API is healthy." -or $health.code -eq 200)
  } catch {
    return $false
  }
}

function Wait-PocketBase($Process) {
  for ($i = 0; $i -lt 30; $i++) {
    if ($Process.HasExited) {
      Show-PocketBaseLogTail
      throw "PocketBase failed to start. Check that port 7000 is free, then retry."
    }
    if (Test-PocketBaseHealth) { return }
    Start-Sleep -Seconds 1
  }
  Show-PocketBaseLogTail
  throw "PocketBase did not become healthy at http://127.0.0.1:7000/api/health."
}

Ensure-PocketBase
$pb = Start-Process -FilePath $PbBin -ArgumentList @("serve", "--http=127.0.0.1:7000") -WorkingDirectory $PbDir -RedirectStandardOutput (Join-Path $PbLogDir "stdout.log") -RedirectStandardError (Join-Path $PbLogDir "stderr.log") -PassThru
try {
  Wait-PocketBase $pb
  $vite = Ensure-NodePm
  Start-Job -ScriptBlock { Start-Sleep -Seconds 3; Start-Process "http://127.0.0.1:8000" } | Out-Null
  Write-Host "VibeX local app: http://127.0.0.1:8000"
  Write-Host "PocketBase:      http://127.0.0.1:7000"
  $cmd = $vite[0]
  $ViteArgs = @()
  if ($vite.Length -gt 1) { $ViteArgs += $vite[1..($vite.Length - 1)] }
  $ViteArgs += @("--config", "vibex-local/vite.local.config.ts", "--host", "127.0.0.1", "--port", "8000")
  & $cmd @ViteArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Vite failed to start or exited with code $LASTEXITCODE."
  }
} finally {
  if ($pb -and !$pb.HasExited) { Stop-Process -Id $pb.Id -Force }
}
