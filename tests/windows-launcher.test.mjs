import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const launcher = fileURLToPath(new URL('../vibex-local/start-windows.ps1', import.meta.url))

function findPowerShell() {
  const candidates = process.platform === 'win32'
    ? ['powershell.exe', 'powershell']
    : ['pwsh', 'powershell']
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    if (probe.status === 0) return candidate
  }
  return null
}

function quotePowerShell(value) {
  return `'${value.replaceAll("'", "''")}'`
}

function requirePowerShell() {
  assert.ok(powershell, 'Windows launcher tests require powershell.exe on Windows')
  return powershell
}

function runPowerShell(command) {
  return spawnSync(requirePowerShell(), ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
  })
}

function writeWindowsCommand(path, body) {
  writeFileSync(path, `@echo off\r\n${body.trim()}\r\n`, 'utf8')
}

function createFixture({ packageManager, packageExitCode = 0, includeCorepack = false }) {
  const root = mkdtempSync(join(tmpdir(), 'dangoo windows launcher '))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  if (packageManager === 'pnpm') writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf8')
  writeWindowsCommand(join(bin, 'node.cmd'), `
if "%~1"=="-p" echo 22.12.0
exit /b 0
`)

  if (packageManager === 'pnpm' && !includeCorepack) {
    writeWindowsCommand(join(bin, 'pnpm.cmd'), `
echo pnpm fixture output
echo pnpm fixture stderr 1>&2
exit /b ${packageExitCode}
`)
  }
  if (packageManager === 'npm') {
    writeWindowsCommand(join(bin, 'npm.cmd'), `
echo npm fixture output
echo npm fixture stderr 1>&2
exit /b ${packageExitCode}
`)
  }
  if (includeCorepack) {
    writeWindowsCommand(join(bin, 'corepack.cmd'), `
echo corepack fixture output %*
echo corepack fixture stderr 1>&2
if "%~1"=="prepare" (
  >"%~dp0pnpm.cmd" echo @echo off
  >>"%~dp0pnpm.cmd" echo echo pnpm fixture output
  >>"%~dp0pnpm.cmd" echo echo pnpm fixture stderr 1^>^&2
  >>"%~dp0pnpm.cmd" echo exit /b 0
)
exit /b 0
`)
  }
  return { root, bin }
}

function runEnsureNodePm({ root, bin, expected, failure = false }) {
  const launcherLiteral = quotePowerShell(launcher)
  const rootLiteral = quotePowerShell(root)
  const binLiteral = quotePowerShell(bin)
  const assertion = failure
    ? `
try {
  [void](Ensure-NodePm)
  throw 'Expected Ensure-NodePm to fail.'
} catch {
  if ($_.Exception.Message -notmatch 'pnpm install failed' -or $_.Exception.Message -notmatch '17') { throw }
  Write-Output 'RESULT_OK'
}
`
    : `
$result = @(Ensure-NodePm)
$expectedParts = ${quotePowerShell(expected)}.Split('|')
if ($result.Count -ne $expectedParts.Count) { throw "Unexpected command array length: $($result.Count)" }
for ($i = 0; $i -lt $result.Count; $i++) {
  if ([string]$result[$i] -ne $expectedParts[$i]) { throw "Unexpected command array item at index $($i): $($result[$i])" }
}
Write-Output 'RESULT_OK'
`

  return runPowerShell(`
$ErrorActionPreference = 'Stop'
$systemRoot = $env:SystemRoot
$env:Path = ${binLiteral} + ';' + $systemRoot + '\\System32;' + $systemRoot + ';' + $systemRoot + '\\System32\\Wbem'
$Root = ${rootLiteral}
$source = Get-Content -LiteralPath ${launcherLiteral} -Raw
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw ($errors | Out-String) }
foreach ($name in @('Assert-NodeVersion', 'Invoke-NativeCommand', 'Ensure-NodePm')) {
  $function = $ast.FindAll({ param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
  }, $true) | Select-Object -First 1
  if (!$function) { throw "Could not extract function $name" }
  Invoke-Expression $function.Extent.Text
}
${assertion}
`)
}

const powershell = findPowerShell()
const skipWithoutPowerShell = process.platform !== 'win32' && !powershell
const skipNonWindows = process.platform !== 'win32'

test('Windows launcher is valid PowerShell syntax', { skip: skipWithoutPowerShell }, () => {
  const result = runPowerShell(`
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(${quotePowerShell(launcher)}, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }
`)
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})

test('Ensure-NodePm keeps pnpm and corepack output out of its command array', { skip: skipNonWindows }, () => {
  const fixture = createFixture({ packageManager: 'pnpm', includeCorepack: true })
  try {
    const expected = `${join(fixture.bin, 'pnpm.cmd')}|exec|vite`
    const result = runEnsureNodePm({ ...fixture, expected })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /RESULT_OK/)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('Ensure-NodePm returns npm.cmd exec arguments without npm output contamination', { skip: skipNonWindows }, () => {
  const fixture = createFixture({ packageManager: 'npm' })
  try {
    const expected = `${join(fixture.bin, 'npm.cmd')}|exec|vite|--`
    const result = runEnsureNodePm({ ...fixture, expected })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /RESULT_OK/)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('Ensure-NodePm reports a non-zero pnpm exit code', { skip: skipNonWindows }, () => {
  const fixture = createFixture({ packageManager: 'pnpm', packageExitCode: 17 })
  try {
    const result = runEnsureNodePm({ ...fixture, failure: true })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /RESULT_OK/)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})
