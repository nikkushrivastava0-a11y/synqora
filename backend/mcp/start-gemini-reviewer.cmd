@echo off
setlocal
set "SYNQORA_BACKEND=%USERPROFILE%\synqora-backend\backend\mcp"
if not exist "%SYNQORA_BACKEND%\local-mcp.mjs" goto missing
set "SYNQORA_AGENT=reviewer"
set "SYNQORA_SESSIONS=%SYNQORA_BACKEND%\.synqora-local\sessions.json"
if not exist "%SYNQORA_SESSIONS%" goto missing
set "PATH=%LOCALAPPDATA%\agy\bin;%PATH%"
where agy >nul 2>nul
if errorlevel 1 (
  echo Installing Google Antigravity CLI from Google's official installer...
  powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; Invoke-RestMethod 'https://antigravity.google/cli/install.ps1' | Invoke-Expression"
  if errorlevel 1 goto failed
)
set "SYNQORA_REVIEW=%USERPROFILE%\synqora-gemini-reviewer"
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $d=Join-Path $env:SYNQORA_REVIEW '.agents'; [void][IO.Directory]::CreateDirectory($d); $p=Join-Path $d 'mcp_config.json'; $cfg=@{mcpServers=@{}}; if(Test-Path $p){$cfg=Get-Content -Raw $p | ConvertFrom-Json}; $s=@{command=(Get-Command node.exe).Source;args=@((Join-Path $env:SYNQORA_BACKEND 'local-mcp.mjs'));env=@{SYNQORA_AGENT='reviewer';SYNQORA_SESSIONS=$env:SYNQORA_SESSIONS}}; if($cfg -is [hashtable]){$cfg.mcpServers.synqora=$s}else{$cfg.mcpServers | Add-Member -Force -NotePropertyName synqora -NotePropertyValue $s}; [IO.File]::WriteAllText($p,($cfg | ConvertTo-Json -Depth 12))"
if errorlevel 1 goto failed
cd /d "%SYNQORA_REVIEW%" || goto failed
echo Sign in with your existing free Google account if prompted.
echo First check: use synqora read_record on 00000000-0000-4000-8000-000000000002 and report revision and agentId.
call agy
if errorlevel 1 goto failed
exit /b 0
:missing
echo Start the existing CampusFest backend before opening this launcher.
:failed
pause
exit /b 1
