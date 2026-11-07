@echo off
title 🦖 T-Rex AI Controller & API Gateway
chcp 65001 >nul
cd /d "%~dp0"
node ai-controller.js
if %errorlevel% neq 0 (
    echo.
    echo [Loi] Khong the chay ai-controller.js. Hay chac chan rang Node.js da duoc cai dat!
    pause
)
