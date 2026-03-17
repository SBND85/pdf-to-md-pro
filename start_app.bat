@echo off
echo Starting PDF to Markdown Pro (GUI Mode)...
cd /d "%~dp0"
:: Start Vite in the background and wait briefly, then start Electron
start /b cmd /c "npm run dev"
timeout /t 5 >nul
cmd /c "npm run electron"
pause
