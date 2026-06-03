@echo off
cd /d "%~dp0"
echo ============================================
echo    Gangwon Governor - AUTO (NEC crawling)
echo ============================================
echo.
echo  - Browser opens automatically.
echo  - Data fetched from NEC every 60s (no Excel needed).
echo  - Two windows appear: keep both open. Close to stop.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js not found. Install from https://nodejs.org
  pause
  exit /b
)
start "NEC Crawler" cmd /k "chcp 65001 >nul & node crawler.js"
set NO_EXCEL=1
chcp 65001 >nul
node server.js
echo.
echo  [server stopped]
pause >nul
