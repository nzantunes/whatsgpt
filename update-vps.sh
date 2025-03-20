#!/bin/bash

# Parar o serviço atual
pm2 stop whatsgpt

# Fazer backup do .env e banco de dados
cp .env .env.backup
cp database.sqlite database.sqlite.backup

# Atualizar código do repositório
git pull origin master

# Restaurar .env e banco de dados
cp .env.backup .env
cp database.sqlite.backup database.sqlite

# Instalar novas dependências se houver
npm install

# Instalar Chrome se não estiver instalado
if ! command -v google-chrome &> /dev/null; then
    wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    sudo apt install ./google-chrome-stable_current_amd64.deb -y
    rm google-chrome-stable_current_amd64.deb
fi

# Reiniciar o serviço
pm2 restart whatsgpt

# Mostrar logs
pm2 logs whatsgpt 