@echo off
setlocal
set "URL=http://127.0.0.1:4174/#home"

rem Reuse the running ClutchIQ server if it is already serving the dashboard.
curl.exe -fsI --max-time 2 http://127.0.0.1:4174/coach-dashboard.js >nul 2>nul
if not errorlevel 1 (
  start "" "%URL%"
  exit /b 0
)

set "NODE=node.exe"
where node.exe >nul 2>nul
if errorlevel 1 (
  set "NODE="
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
  if not defined NODE for /f "usebackq delims=" %%N in (`powershell.exe -NoProfile -Command "foreach ($pkg in @(Get-AppxPackage -Name OpenAI.CodexPrimaryRuntime*)) { $node = Join-Path $pkg.InstallLocation 'dependencies\node\bin\node.exe'; if (Test-Path -LiteralPath $node) { $node; break } }"`) do set "NODE=%%N"
)
if not defined NODE (
  echo ClutchIQ needs Node.js. Install Node.js and reopen this launcher.
  pause
  exit /b 1
)

echo Starting ClutchIQ. Keep this window open while you play.
"%NODE%" "%~dp0serve.cjs" --open
if errorlevel 1 pause
