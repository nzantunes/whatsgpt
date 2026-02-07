@echo off
title WhatsGPT - Modo Verboso (todos os logs no CMD)
cd /d "%~dp0"

set VERBOSE=1
echo ============================================
echo   WhatsGPT - TODOS OS LOGS NO CMD
echo ============================================
echo.
echo VERBOSE=1 ativado. Voce vera:
echo   - Requisicoes HTTP
echo   - Mensagens do WhatsApp
echo   - Automação (Python stdout/stderr)
echo   - Socket, erros e detalhes do servidor
echo.
echo Mantenha esta janela aberta.
echo Acesse: http://localhost:3002 (ou a porta do .env)
echo.
echo --------------------------------------------
node scripts/run-verbose.js
pause
