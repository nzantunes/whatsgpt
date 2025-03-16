#!/bin/bash

# Script para atualizar o código no servidor
cd /var/www/whatsgpt

# Salvar alterações locais (se houver)
git stash

# Configurar git para usar https com credenciais embutidas
# Substitua USERNAME e TOKEN pelos seus valores reais
git remote set-url origin https://github.com/nzantunes/whatsgpt.git

# Fazer pull das alterações mais recentes
git pull

# Restaurar alterações locais (se necessário)
# git stash pop

# Reiniciar o serviço Node.js (se estiver usando PM2)
pm2 restart all

echo "Atualização concluída!" 