#!/bin/bash

echo "=== Iniciando atualização persistente do WhatsGPT ==="
echo "Data: $(date)"

# Navegar para o diretório do aplicativo
cd /var/www/whatsgpt

# Criar backup do banco de dados
echo "Criando backup do banco de dados..."
timestamp=$(date +%Y%m%d%H%M%S)
cp database.sqlite "database.sqlite.backup_$timestamp"
echo "Backup criado: database.sqlite.backup_$timestamp"

# Backup dos arquivos .env e configurações personalizadas
if [ -f .env ]; then
  echo "Preservando arquivo .env..."
  cp .env .env.backup
fi

# Parar a aplicação
echo "Parando aplicação..."
pm2 stop whatsgpt

# Salvar alterações locais (se necessário)
echo "Salvando alterações locais..."
git stash

# Forçar atualização limpa do repositório
echo "Atualizando código do repositório..."
git fetch origin
git reset --hard origin/master

# Restaurar arquivo .env do backup
if [ -f .env.backup ]; then
  echo "Restaurando arquivo .env..."
  cp .env.backup .env
fi

# Garantir permissões corretas
echo "Configurando permissões..."
chmod +x *.sh
chmod 755 -R public/
chmod 644 .env

# Instalar dependências
echo "Atualizando dependências..."
npm install

# Limpar cache do node
echo "Limpando cache do Node.js..."
npm cache clean --force

# Reiniciar a aplicação
echo "Reiniciando aplicação..."
pm2 restart whatsgpt || pm2 start index.js --name whatsgpt

# Salvar configuração do PM2 para persistir após reboot
echo "Salvando configuração PM2..."
pm2 save

# Forçar atualização de timestamps dos arquivos estáticos para cache-busting
echo "Atualizando timestamps dos arquivos estáticos..."
find ./public -type f -exec touch {} \;

# Reiniciar Nginx para garantir que o proxy esteja atualizado
echo "Reiniciando Nginx..."
sudo systemctl restart nginx

echo "=== Atualização concluída! ==="
echo "Data: $(date)"
echo "Verificando status:"
pm2 status

# Verificar se há vulnerabilidades nas dependências
echo -e "\nVerificando vulnerabilidades nas dependências..."
npm audit 