@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul || goto failed
if not exist "backend\mcp\node_modules\@electric-sql\pglite\package.json" (
  call npm.cmd --prefix backend\mcp ci --no-audit --no-fund || goto failed
)
if not exist "frontend\node_modules\vite\package.json" (
  call npm.cmd --prefix frontend ci --no-audit --no-fund || goto failed
)
node scripts\round-demo.mjs
if errorlevel 1 goto failed
exit /b 0
:failed
echo Demo startup failed. Check the message above and Node 24 installation.
pause
exit /b 1
