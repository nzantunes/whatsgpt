# Guia de Implantação do WhatsGPT em VPS

Este guia descreve o processo completo para implantar o WhatsGPT em um servidor VPS.

## Pré-requisitos

- Um servidor VPS com Ubuntu 20.04 ou superior
- Acesso SSH ao servidor
- Um domínio apontado para o IP do seu VPS (opcional, mas recomendado)
- Cliente Git instalado no servidor
- Node.js (v14 ou superior) e npm instalados no servidor

## Etapas de Implantação

### 1. Conectar ao VPS via SSH

```bash
ssh usuario@seu_ip_do_vps
```

### 2. Atualizar o Sistema

```bash
sudo apt update
sudo apt upgrade -y
```

### 3. Instalar Dependências

```bash
# Instalar Node.js e npm
curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar as versões
node -v
npm -v

# Instalar PM2 (gerenciador de processos)
sudo npm install -g pm2

# Instalar o Git (caso ainda não esteja instalado)
sudo apt install -y git

# Instalar Chromium (necessário para o WhatsApp Web)
sudo apt install -y chromium-browser
```

### 4. Configurar Diretório da Aplicação

```bash
# Criar o diretório da aplicação
sudo mkdir -p /var/www/whatsgpt
sudo chown -R $USER:$USER /var/www/whatsgpt
```

### 5. Clonar o Repositório

```bash
# Navegar para o diretório
cd /var/www/whatsgpt

# Clonar o repositório
git clone https://github.com/nzantunes/whatsgpt.git .
```

### 6. Instalar Dependências do Projeto

```bash
npm install
```

### 7. Configurar Variáveis de Ambiente

```bash
# Criar o arquivo .env
nano .env
```

Adicione o seguinte conteúdo:

```
OPENAI_API_KEY=sua_chave_api_da_openai
PORT=3000
NODE_ENV=production
SESSION_SECRET=um_segredo_muito_seguro_para_sessoes
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

Salve o arquivo com Ctrl+O e saia com Ctrl+X.

### 8. Configurar PM2 para Iniciar a Aplicação

```bash
# Iniciar a aplicação com PM2
pm2 start index.js --name whatsgpt

# Configurar para iniciar automaticamente após reinicialização
pm2 startup
# Execute o comando fornecido pelo PM2

# Salvar a configuração atual do PM2
pm2 save
```

### 9. Configurar o Nginx como Proxy Reverso

```bash
# Instalar o Nginx
sudo apt install -y nginx

# Configurar o Nginx
sudo nano /etc/nginx/sites-available/whatsgpt
```

Adicione o seguinte conteúdo:

```nginx
server {
    listen 80;
    server_name seu_dominio.com www.seu_dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Ative o site e reinicie o Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/whatsgpt /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 10. Configurar HTTPS com Certbot (opcional, mas recomendado)

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obter certificado SSL
sudo certbot --nginx -d seu_dominio.com -d www.seu_dominio.com

# Aceite os termos e siga as instruções
```

### 11. Script de Atualização

Crie um script para facilitar atualizações futuras:

```bash
nano /var/www/whatsgpt/atualizar.sh
```

Adicione o seguinte conteúdo:

```bash
#!/bin/bash

# Navegue até o diretório do aplicativo
cd /var/www/whatsgpt

# Salve as alterações locais (se houver)
git stash

# Atualize o código do GitHub
git pull origin main

# Atualize as dependências (se necessário)
npm install

# Reinicie o aplicativo
pm2 restart whatsgpt

# Verifique o status
pm2 status

echo "Atualização concluída!"
```

Torne o script executável:

```bash
chmod +x /var/www/whatsgpt/atualizar.sh
```

## Verificação e Testes

1. Acesse a aplicação pelo navegador: `https://seu_dominio.com`
2. Verifique se o QR code é exibido corretamente
3. Conecte seu WhatsApp escaneando o QR code
4. Teste o envio e recebimento de mensagens

## Manutenção e Atualização

Para atualizar a aplicação com novas alterações do GitHub:

```bash
cd /var/www/whatsgpt
./atualizar.sh
```

Para verificar os logs do aplicativo:

```bash
pm2 logs whatsgpt
```

## Solução de Problemas

### Erro no Chromium/Puppeteer

Se o WhatsApp não conectar devido a problemas com o Chromium, edite o arquivo `index.js` e adicione flags adicionais:

```javascript
const client = new Client({
  puppeteer: {
    executablePath: '/usr/bin/chromium-browser',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ],
    headless: true
  },
  // ... outras configurações
});
```

### Verificando Logs do Nginx

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
``` 