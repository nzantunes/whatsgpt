# Script PowerShell para executar cursor_automation.py
# Tenta encontrar Python em vários locais comuns

$pythonPaths = @(
    "python",
    "python3",
    "py",
    "$env:LOCALAPPDATA\Programs\Python\Python*\python.exe",
    "$env:PROGRAMFILES\Python*\python.exe",
    "C:\Python*\python.exe",
    "$env:APPDATA\Python\Python*\python.exe"
)

$pythonExe = $null

Write-Host "Procurando Python..." -ForegroundColor Yellow

foreach ($path in $pythonPaths) {
    try {
        if ($path -match "^[a-zA-Z]+$") {
            # É um comando (python, python3, py)
            $result = Get-Command $path -ErrorAction SilentlyContinue
            if ($result) {
                $pythonExe = $result.Source
                Write-Host "Python encontrado: $pythonExe" -ForegroundColor Green
                break
            }
        } else {
            # É um caminho
            $found = Get-ChildItem $path -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) {
                $pythonExe = $found.FullName
                Write-Host "Python encontrado: $pythonExe" -ForegroundColor Green
                break
            }
        }
    } catch {
        continue
    }
}

if (-not $pythonExe) {
    Write-Host "`nPython não encontrado!" -ForegroundColor Red
    Write-Host "Por favor, instale Python de https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "Ou adicione Python ao PATH do sistema." -ForegroundColor Yellow
    exit 1
}

# Verificar se as dependências estão instaladas
Write-Host "`nVerificando dependências..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$requirementsFile = Join-Path $scriptDir "requirements_automation.txt"

if (Test-Path $requirementsFile) {
    Write-Host "Instalando dependências..." -ForegroundColor Yellow
    & $pythonExe -m pip install -q -r $requirementsFile
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Aviso: Algumas dependências podem não ter sido instaladas." -ForegroundColor Yellow
    }
}

# Executar o script (sempre o arquivo .py, nunca o diretório)
Write-Host "`nExecutando cursor_automation.py...`n" -ForegroundColor Green
$scriptFile = Join-Path $scriptDir "cursor_automation.py"
if (-not (Test-Path $scriptFile -PathType Leaf)) {
    Write-Host "ERRO: Arquivo não encontrado: $scriptFile" -ForegroundColor Red
    Write-Host "Execute a partir da pasta scripts ou use o caminho completo ao .py" -ForegroundColor Yellow
    exit 1
}
& $pythonExe $scriptFile
