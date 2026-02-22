@echo off
setlocal EnableExtensions EnableDelayedExpansion

if /I "%~1" NEQ "--run" (
  start "Atualizar Git - WhatsGPT" cmd /k ""%~f0" --run"
  exit /b 0
)

cd /d "%~dp0"
set "LOG_FILE=%~dp0atualizar_git.log"

echo ========================================
echo  Atualizando Git do projeto WhatsGPT
echo ========================================
echo Pasta: %cd%
echo Log: %LOG_FILE%
echo.

echo [INFO] Iniciado em %date% %time% > "%LOG_FILE%"
echo [INFO] Pasta: %cd% >> "%LOG_FILE%"

where git >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Git nao encontrado no PATH.
  echo [ERRO] Git nao encontrado no PATH. >> "%LOG_FILE%"
  echo Instale o Git e tente novamente: https://git-scm.com/download/win
  pause
  exit /b 1
)

echo [1/3] git add .
git add . >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo [ERRO] Falha no git add.
  echo Veja o log: %LOG_FILE%
  pause
  exit /b 1
)

echo [2/3] git commit
git commit -m "chore: atualizar WhatsNain e limpar arquivos gerados" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo [AVISO] Nao houve commit - sem mudancas, conflito ou erro.
  echo Executando git status para diagnostico...
  git status
  git status >> "%LOG_FILE%" 2>&1
  echo [INFO] Continuando para tentativa de push.
)

echo [3/3] git push
set "CURRENT_BRANCH="
for /f "delims=" %%B in ('git symbolic-ref --short -q HEAD 2^>nul') do set "CURRENT_BRANCH=%%B"

if defined CURRENT_BRANCH (
  echo [INFO] Branch atual: !CURRENT_BRANCH!
  git push origin !CURRENT_BRANCH! >> "%LOG_FILE%" 2>&1
  if errorlevel 1 (
    echo [ERRO] Falha no git push da branch !CURRENT_BRANCH!.
    echo Veja o log: %LOG_FILE%
    pause
    exit /b 1
  )
) else (
  echo [INFO] Detached HEAD detectado. Tentando push para origin/main...
  git push origin HEAD:main >> "%LOG_FILE%" 2>&1
  if errorlevel 1 (
    echo [ERRO] Falha no push em detached HEAD para origin/main.
    echo Veja o log: %LOG_FILE%
    pause
    exit /b 1
  )
)

echo.
echo [OK] Git atualizado com sucesso.
echo [OK] Finalizado em %date% %time% >> "%LOG_FILE%"
echo Log salvo em: %LOG_FILE%
pause
exit /b 0
