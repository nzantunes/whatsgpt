#!/bin/bash

# Parar processos existentes
pkill -f "node index.js"
pkill -f "chrome"

# Backup da pasta atual
mv whatsgpt whatsgpt_backup_$(date +%Y%m%d)

# Clonar nova versão
git clone https://github.com/nzantunes/whatsgpt.git

# Entrar na pasta
cd whatsgpt

# Copiar arquivo .env do backup
cp ../whatsgpt_backup_$(date +%Y%m%d)/.env .

# Copiar banco de dados
cp -r ../whatsgpt_backup_$(date +%Y%m%d)/db/*.sqlite db/

# Instalar dependências
npm install

# Iniciar servidor
node index.js

echo "Atualização concluída!" 