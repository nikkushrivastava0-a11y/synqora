@echo off
setlocal
cd /d "%~dp0"
node live-handoff.mjs
if errorlevel 1 echo Live handoff incomplete. Your saved demo state is preserved.
pause
