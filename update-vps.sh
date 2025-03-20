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

# Instalar Chromium e dependências necessárias
sudo apt-get update
sudo apt-get install -y chromium chromium-l10n

# Instalar dependências adicionais necessárias
sudo apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils

# Verificar se o Chromium foi instalado corretamente
if [ -f "/usr/bin/chromium" ]; then
    echo "Chromium instalado com sucesso em /usr/bin/chromium"
else
    echo "ERRO: Chromium não encontrado em /usr/bin/chromium"
    # Tentar encontrar o executável do Chromium
    which chromium
    which chromium-browser
fi

# Reiniciar o serviço
pm2 restart whatsgpt

# Mostrar logs
pm2 logs whatsgpt 