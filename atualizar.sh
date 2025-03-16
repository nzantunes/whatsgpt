#!/bin/bash

# Navegue até o diretório do aplicativo
cd /var/www/whatsgpt

# Salve as alterações locais (se houver)
git stash

# Configure o token de acesso pessoal do GitHub (se necessário)
# git config --global credential.helper store

# Atualize o código do GitHub
git pull origin master

# Atualize as dependências (se necessário)
# npm install

# Reinicie o aplicativo
pm2 restart all

# Verifique o status
pm2 status

echo "Atualização concluída!" 