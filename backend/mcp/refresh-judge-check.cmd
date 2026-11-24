@echo off
setlocal
cd /d "%USERPROFILE%\synqora-backend" || goto failed
git branch --show-current | findstr /x "feature/backend-core" >nul || goto failed
git pull --ff-only origin feature/backend-core || goto failed
call backend\mcp\judge-check.cmd
exit /b %errorlevel%
:failed
echo Could not safely update the backend checkout.
pause
exit /b 1
