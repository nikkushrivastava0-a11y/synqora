@echo off
setlocal
cd /d "%USERPROFILE%\synqora-gemini-reviewer" || goto failed
"%LOCALAPPDATA%\agy\bin\agy.exe" -i "Call only the synqora MCP tool read_record with recordId 00000000-0000-4000-8000-000000000002. Report its actual record ID, revision, body and agentId, or the tool error. Do not use files or shell commands."
if not errorlevel 1 exit /b 0
:failed
pause
