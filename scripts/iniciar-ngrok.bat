@echo off
REM Inicia o ngrok na porta do WhatsGPT (leia PORT do .env ou use 3002)
echo Iniciando ngrok para a porta 3002...
echo Depois coloque a URL gerada em BASE_URL no .env e reinicie o WhatsGPT.
echo.
ngrok http 3002
