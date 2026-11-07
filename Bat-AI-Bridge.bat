@echo off
title Khoi dong Cau noi T-Rex Ollama
chcp 65001 >nul
echo ===================================================
echo 🦖 Dang khoi dong cau noi Ollama + Ngrok...
echo ===================================================
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "E:\REX\scripts\auto-start-bridge.ps1"
echo [OK] Da hoan tat! Cau noi Ollama dang chay ngam trong he thong.
echo Ban co the tat cua so nay.
timeout /t 3 >nul
