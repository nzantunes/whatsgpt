#!/bin/bash

# Função para exibir mensagens com cores
print_message() {
    echo -e "\e[1;34m>>> $1\e[0m"
}

print_error() {
    echo -e "\e[1;31m>>> ERRO: $1\e[0m"
}

print_success() {
    echo -e "\e[1;32m>>> SUCESSO: $1\e[0m"
}

# Função para verificar se o último comando foi executado com sucesso
check_error() {
    if [ $? -ne 0 ]; then
        print_error "$1"
        exit 1
    fi
}

# Parar serviços existentes
print_message "Parando serviços existentes..."
sudo pm2 delete all 2>/dev/null
sudo systemctl stop nginx 2>/dev/null

# Matar processos
print_message "Matando processos relacionados..."
sudo pkill -f node
sudo pkill -f chrome
sudo pkill -f chromium

# Fazer backup do .env e banco de dados se existirem
print_message "Fazendo backup dos arquivos importantes..."
BACKUP_DIR="/root/whatsgpt_backup_$(date +%Y%m%d_%H%M%S)"
sudo mkdir -p $BACKUP_DIR

if [ -f "/var/www/whatsgpt/.env" ]; then
    sudo cp /var/www/whatsgpt/.env $BACKUP_DIR/
fi

# Backup dos bancos de dados SQLite
if [ -d "/var/www/whatsgpt/db" ]; then
    sudo cp -r /var/www/whatsgpt/db $BACKUP_DIR/
fi

print_success "Backup criado em $BACKUP_DIR"

# Remover diretórios antigos
print_message "Removendo instalação antiga..."
sudo rm -rf /var/www/whatsgpt
sudo rm -rf /var/www/whatsgpt_old
check_error "Falha ao remover diretórios antigos"

# Remover instalações antigas do Node.js
print_message "Removendo instalações antigas do Node.js..."
sudo apt-get remove -y nodejs npm
sudo apt-get autoremove -y
sudo rm -rf /usr/local/bin/npm /usr/local/share/man/man1/node* /usr/local/lib/dtrace/node.d ~/.npm ~/.node-gyp /opt/local/bin/node /opt/local/include/node /opt/local/lib/node_modules
sudo rm -rf /usr/local/lib/node*
sudo rm -rf /usr/local/include/node*
sudo rm -rf /usr/local/bin/node*

# Atualizar sistema
print_message "Atualizando sistema..."
sudo apt update
sudo apt upgrade -y
check_error "Falha ao atualizar sistema"

# Instalar dependências básicas
print_message "Instalando dependências básicas..."
sudo apt install -y git curl wget build-essential

# Instalar Chromium e suas dependências
print_message "Instalando Chromium e suas dependências..."
sudo apt install -y chromium-browser chromium-codecs-ffmpeg chromium-chromedriver
sudo apt install -y ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils
check_error "Falha ao instalar Chromium e dependências"

# Verificar instalação do Chromium
print_message "Verificando instalação do Chromium..."
which chromium-browser || which chromium
check_error "Chromium não encontrado após instalação"

# Criar diretório para dados do Chrome
print_message "Configurando diretório do Chrome..."
sudo mkdir -p /usr/share/chromium
sudo chmod -R 777 /usr/share/chromium

# Atualizar arquivo .env com o caminho correto do Chrome
print_message "Atualizando configuração do Chrome no .env..."
CHROME_PATH=$(which chromium-browser || which chromium)
if [ -f "/var/www/whatsgpt/.env" ]; then
    sed -i "s|CHROME_PATH=.*|CHROME_PATH=$CHROME_PATH|g" /var/www/whatsgpt/.env
fi

# Instalar NVM
print_message "Instalando NVM..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
check_error "Falha ao instalar NVM"

# Instalar Node.js via NVM
print_message "Instalando Node.js 18 via NVM..."
nvm install 18
nvm use 18
check_error "Falha ao instalar Node.js"

# Instalar PM2 globalmente
print_message "Instalando PM2..."
npm install -g pm2
check_error "Falha ao instalar PM2"

# Criar diretório do projeto
print_message "Criando diretório do projeto..."
sudo mkdir -p /var/www/whatsgpt
cd /var/www/whatsgpt
check_error "Falha ao criar diretório do projeto"

# Clonar o repositório
print_message "Clonando repositório..."
sudo git clone https://github.com/nzantunes/whatsgpt.git .
check_error "Falha ao clonar repositório"

# Instalar dependências do projeto
print_message "Instalando dependências do projeto..."
npm install
check_error "Falha ao instalar dependências do projeto"

# Restaurar backup do .env se existir
if [ -f "$BACKUP_DIR/.env" ]; then
    print_message "Restaurando arquivo .env..."
    sudo cp $BACKUP_DIR/.env /var/www/whatsgpt/
fi

# Restaurar bancos de dados se existirem
if [ -d "$BACKUP_DIR/db" ]; then
    print_message "Restaurando bancos de dados..."
    sudo cp -r $BACKUP_DIR/db /var/www/whatsgpt/
fi

# Configurar diretórios e permissões
print_message "Configurando permissões..."
sudo chown -R $USER:$USER /var/www/whatsgpt
sudo chmod -R 755 /var/www/whatsgpt

# Criar diretórios necessários
sudo mkdir -p /var/www/whatsgpt/uploads
sudo mkdir -p /var/www/whatsgpt/db
sudo mkdir -p /var/www/whatsgpt/chrome-data

# Configurar permissões específicas
sudo chown -R $USER:$USER /var/www/whatsgpt/uploads
sudo chown -R $USER:$USER /var/www/whatsgpt/db
sudo chown -R $USER:$USER /var/www/whatsgpt/chrome-data

# Iniciar aplicação com PM2
print_message "Iniciando aplicação..."
cd /var/www/whatsgpt
pm2 start index.js --name whatsgpt
pm2 save
sudo env PATH=$PATH:/home/$USER/.nvm/versions/node/v18*/bin pm2 startup systemd -u $USER --hp /home/$USER
sudo systemctl enable pm2-$USER

print_success "Instalação concluída!"
print_message "Verifique se o arquivo .env está configurado corretamente"
print_message "Acesse o sistema através do navegador"

# Exibir logs da aplicação
print_message "Exibindo logs da aplicação..."
pm2 logs whatsgpt 