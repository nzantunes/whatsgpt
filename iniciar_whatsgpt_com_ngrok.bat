@echo off
title WhatsGPT + ngrok
cd /d "%~dp0"

REM Porta do servidor (deve ser a mesma do .env - padrao 3002)
set PORTA=3002

echo ============================================
echo   WhatsGPT - Iniciando com ngrok
echo ============================================
echo.
echo 1. Ngrok sera aberto em outra janela (porta %PORTA%).
echo 2. Esta janela iniciara o servidor WhatsGPT.
echo.
echo Mantenha as DUAS janelas abertas.
echo Apos o ngrok iniciar, copie a URL https que aparecer
echo e cole em ngrok-url.txt ou em BASE_URL no .env.
echo.
echo Acesse local: http://localhost:%PORTA%
echo ============================================
echo.

REM Inicia o ngrok em nova janela (fica rodando)
start "ngrok - WhatsGPT" cmd /k "ngrok http %PORTA%"

REM Da tempo do ngrok mostrar a URL
timeout /t 3 /nobreak >nul

echo Iniciando servidor WhatsGPT...
echo.
npm start

pause
