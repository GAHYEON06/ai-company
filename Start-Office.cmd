@echo off
cd /d "%~dp0"
node scripts\office-server.mjs
if errorlevel 1 pause
