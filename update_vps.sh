#!/bin/bash

echo "Iniciando atualização do WhatsGPT..."

# Parar o processo atual
echo "Parando o processo atual..."
pm2 stop whatsgpt

# Puxar alterações do GitHub
echo "Baixando atualizações do GitHub..."
git pull origin master

# Instalar dependências
echo "Atualizando dependências..."
npm install

# Limpar cache do WhatsApp
echo "Limpando cache do WhatsApp..."
rm -rf .wwebjs_auth
rm -rf .wwebjs_cache

# Reiniciar o serviço
echo "Reiniciando o serviço..."
pm2 start index.js --name whatsgpt

echo "Atualização concluída!" 