@echo off
setlocal
set "NODE=node.exe"
where node.exe >nul 2>nul
if errorlevel 1 (
  set "NODE="
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
  if not defined NODE for /f "usebackq delims=" %%N in (`powershell.exe -NoProfile -Command "foreach ($pkg in @(Get-AppxPackage -Name OpenAI.CodexPrimaryRuntime*)) { $node = Join-Path $pkg.InstallLocation 'dependencies\node\bin\node.exe'; if (Test-Path -LiteralPath $node) { $node; break } }"`) do set "NODE=%%N"
)
if not defined NODE (
  echo CLUTCHUP needs Node.js. Install Node.js and reopen this launcher.
  pause
  exit /b 1
)

echo Starting CLUTCHUP. Keep this window open while you play.
"%NODE%" "%~dp0serve.cjs" --open
if errorlevel 1 pause
