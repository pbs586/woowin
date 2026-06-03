@echo off
cd /d "%~dp0"
echo ============================================
echo    Gangwon Dashboard - AUTO + GitHub Pages
echo ============================================
echo.
echo  - Crawls NEC and PUSHES data.json to GitHub every 2 min.
echo  - Public Pages site updates automatically (~1-2 min lag).
echo  - Keep this window open. Close to stop.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js not found. Install from https://nodejs.org
  pause
  exit /b
)
where git >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] git not found. Install from https://git-scm.com
  pause
  exit /b
)
chcp 65001 >nul
set GIT_PUSH=1
node crawler.js --interval=120
echo.
echo  [stopped]
pause >nul
