#!/bin/bash

echo "=== Iniciando atualização persistente do WhatsGPT ==="
echo "Data: $(date)"

# Navegar para o diretório do projeto
cd /var/www/whatsgpt

# Puxar as últimas alterações do GitHub
echo "Atualizando código do GitHub..."
git pull origin master

# Criar diretório de logs se não existir
mkdir -p logs

# Instalar dependências se necessário
echo "Verificando dependências..."
npm install

# Salvar o startup atual do PM2
echo "Salvando configuração do PM2..."
pm2 save

# Reiniciar a aplicação usando o arquivo ecosystem
echo "Reiniciando aplicação..."
pm2 restart ecosystem.config.js --update-env

# Mostrar status
echo "Status atual do PM2:"
pm2 list

# Mostrar os últimos logs
echo "Últimos logs da aplicação:"
pm2 logs whatsgpt --lines 20

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

# Limpar cache do node
echo "Limpando cache do Node.js..."
npm cache clean --force

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