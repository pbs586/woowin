@echo off
cd /d "%~dp0"
echo ============================================
echo    Gangwon Governor Election Dashboard
echo ============================================
echo.
echo  - The browser will open automatically.
echo  - Save the counting Excel (gaepyo) to auto-refresh.
echo  - Close this window to stop.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js not found. Install from https://nodejs.org
  pause
  exit /b
)
chcp 65001 >nul
node server.js
echo.
echo  [server stopped]
pause >nul
