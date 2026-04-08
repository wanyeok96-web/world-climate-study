@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo [1/2] 링크 동기화...
node scripts\sync-site-links.mjs
if errorlevel 1 exit /b 1
echo [2/2] Git push...
node scripts\push-to-github.mjs %*
if errorlevel 1 exit /b 1
echo 완료.
exit /b 0
