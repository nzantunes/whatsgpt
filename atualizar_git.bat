@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo  Atualizando Git do projeto WhatsGPT
echo ========================================
echo.

git add .
if errorlevel 1 (
  echo [ERRO] Falha no git add.
  pause
  exit /b 1
)

git commit -m "chore: atualizar WhatsNain e limpar arquivos gerados"
if errorlevel 1 (
  echo.
  echo [AVISO] Nenhuma mudanca para commit ou houve conflito.
  echo Verifique com: git status
  pause
  exit /b 1
)

git push
if errorlevel 1 (
  echo.
  echo [ERRO] Falha no git push (verifique remoto/credenciais).
  pause
  exit /b 1
)

echo.
echo [OK] Git atualizado com sucesso.
pause
exit /b 0
