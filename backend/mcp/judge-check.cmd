@echo off
setlocal
cd /d "%~dp0"
if not exist campus.test.mjs cd /d "%USERPROFILE%\synqora-backend\backend\mcp"
if not exist campus.test.mjs goto missing
echo SYNQORA - CampusFest automated judge check
echo Uses temporary databases. The running demo workspace is separate.
node --test campus.test.mjs recovery.test.mjs surfaces.test.mjs
if errorlevel 1 goto failed
echo PASS - three affected tasks, two independent tasks preserved.
echo PASS - stale proposal retained and human correction approved.
echo PASS - killed caller retried with one accepted result and one submit audit event.
echo PASS - 13 HTTP routes and eight MCP tools checked by protocol clients.
echo Live two-AI-client handoff requires separate evidence.
pause
exit /b 0
:missing
echo Backend checkout missing. See the PR runbook.
:failed
echo Verification incomplete. See output above.
pause
exit /b 1
